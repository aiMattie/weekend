/**
 * monday.com -> Weekend importer (service). Reads a monday.com account through a READ-ONLY client
 * (see migration/monday-client.ts), then classifies/writes everything idempotently through
 * `external_refs`. Default mode is dry-run: nothing in the clone is written except the job row.
 *
 *   runImport(actor, { apply: false })   -> report with counts and a diff-style summary
 *   runImport(actor, { apply: true })    -> writes (one transaction), then downloads files
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors";
import { assertCan } from "../../lib/permissions";
import { db } from "../../db/client";
import { assets } from "../../db/schema/core";
import { importJobs } from "../../db/schema/import-jobs";
import { importContent } from "./migration/import-run";
import { MondayClient } from "./migration/monday-client";
import { mondayCredentials } from "./migration/credentials";
import { fetchSnapshot } from "./migration/monday-queries";
import type { MondaySnapshot } from "./migration/monday-types";
import type { PendingDownload } from "./migration/import-content";
import { filesDir } from "./assets";
import { parse } from "./_shared";

export { registerDocImporter } from "./migration/import-content";
export { assertReadOnly, ReadOnlyViolationError, MondayClient } from "./migration/monday-client";

export type ImportJob = typeof importJobs.$inferSelect;

export const importOptionsSchema = z.object({
  apply: z.boolean().default(false),
  /** monday workspace ids; "main" = the main workspace. Empty = everything */
  workspaces: z.array(z.string().regex(/^(\d+|main)$/)).default([]),
  includeUpdates: z.boolean().default(true),
  downloadFiles: z.boolean().default(true),
  adoptBoards: z.boolean().default(true),
  maxItemsPerBoard: z.number().int().min(1).max(100000).optional(),
  /** test hook: only honoured when E2E_RESET=1 and the URL is localhost */
  apiUrl: z.string().url().optional(),
});
export type ImportOptions = z.input<typeof importOptionsSchema>;

export interface ImportReport {
  mode: "dry_run" | "apply";
  counts: Record<string, { create: number; update: number; skip: number }>;
  warnings: string[];
  diff: string[];
  skipped: Record<string, number>;
  files: { downloaded: number; failed: number; pending: number };
  requests: number;
  durationMs: number;
  account: string | null;
}

/**
 * Build the read-only client. The key comes from the account's linked connection, else MONDAY_API_KEY, and is
 * only ever sent to api.monday.com (or MONDAY_API_URL from the environment).
 */
export function resolveClient(opts: { apiUrl?: string; accountId?: string } = {}, log?: (m: string) => void): MondayClient {
  const envUrl = process.env.MONDAY_API_URL;
  let apiUrl = envUrl;
  let apiKey = mondayCredentials(opts.accountId)?.apiKey;
  if (!envUrl && opts.apiUrl) {
    const host = new URL(opts.apiUrl).hostname;
    if (process.env.E2E_RESET !== "1" || !["localhost", "127.0.0.1"].includes(host)) throw new ValidationError("apiUrl override is only available in the e2e test environment");
    apiUrl = opts.apiUrl;
    apiKey = "local-mock-key";
  }
  if (!apiKey) throw new ValidationError("monday is not linked: connect it under Admin > Import (or set MONDAY_API_KEY in .env)");
  return new MondayClient({ apiKey, apiUrl, log });
}

const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "file";

async function downloadFiles(client: MondayClient, pending: PendingDownload[], tracker: { warn(m: string): void }): Promise<ImportReport["files"]> {
  const out = { downloaded: 0, failed: 0, pending: pending.length };
  for (const p of pending) {
    const url = p.asset.public_url || p.asset.url;
    if (!url) { out.failed++; continue; }
    try {
      const bytes = await client.download(url);
      const rel = `${p.assetId}-${safeName(p.asset.name)}`; // same flat layout as services/assets.ts
      mkdirSync(filesDir(), { recursive: true });
      writeFileSync(path.join(filesDir(), rel), bytes);
      db.update(assets).set({ path: rel, size: bytes.byteLength }).where(eq(assets.id, p.assetId)).run();
      out.downloaded++;
    } catch (e) {
      out.failed++;
      tracker.warn(`file "${p.asset.name}": download failed (${(e as Error).message}); metadata imported`);
    }
  }
  return out;
}

export interface RunDeps { client?: MondayClient | null; snapshot?: MondaySnapshot; log?: (m: string) => void }

/** Run an import. `deps.snapshot` skips the network (tests); otherwise `deps.client`/env is used. */
export async function runImport(actor: Actor, input: ImportOptions = {}, deps: RunDeps = {}): Promise<ImportReport> {
  assertCan(actor, "account:manage");
  const o = parse(importOptionsSchema, input);
  const started = Date.now();
  const say = deps.log ?? (() => {});
  const client = deps.snapshot ? deps.client ?? null : deps.client ?? resolveClient({ apiUrl: o.apiUrl, accountId: actor.accountId }, say);
  const snapshot = deps.snapshot ?? await fetchSnapshot(client!, { workspaces: o.workspaces, includeUpdates: o.includeUpdates, maxItemsPerBoard: o.maxItemsPerBoard, onProgress: say });
  const { tracker, pending, skipped } = importContent(actor, snapshot, { apply: o.apply, adoptBoards: o.adoptBoards });
  let files: ImportReport["files"] = { downloaded: 0, failed: 0, pending: pending.length };
  if (o.apply && o.downloadFiles && client && pending.length) files = await downloadFiles(client, pending, tracker);
  return {
    mode: o.apply ? "apply" : "dry_run", counts: tracker.counts, warnings: tracker.warnings, diff: tracker.diff, skipped, files,
    requests: client?.requests ?? 0, durationMs: Date.now() - started, account: snapshot.account?.name ?? null,
  };
}

/* ------------------------------------------------------------------ job history */

export function listJobs(actor: Actor, limit = 50): ImportJob[] {
  assertCan(actor, "account:manage");
  return db.select().from(importJobs).where(eq(importJobs.accountId, actor.accountId)).orderBy(desc(importJobs.createdAt), desc(importJobs.id)).limit(limit).all();
}

export function getJob(actor: Actor, id: string): ImportJob {
  assertCan(actor, "account:manage");
  const j = db.select().from(importJobs).where(eq(importJobs.id, id)).get();
  if (!j || j.accountId !== actor.accountId) throw new NotFoundError("Import job");
  return j;
}

/** Run an import and record it in import_jobs. Resolves when finished (the REST route does not await it). */
export async function runImportJob(actor: Actor, input: ImportOptions = {}, deps: RunDeps = {}, existingJobId?: string): Promise<ImportJob> {
  assertCan(actor, "account:manage");
  const o = parse(importOptionsSchema, input);
  const publicOptions = { apply: o.apply, workspaces: o.workspaces, includeUpdates: o.includeUpdates, downloadFiles: o.downloadFiles, adoptBoards: o.adoptBoards, maxItemsPerBoard: o.maxItemsPerBoard };
  const job = existingJobId ? getJob(actor, existingJobId) : db.insert(importJobs).values({ accountId: actor.accountId, kind: "monday", mode: o.apply ? "apply" : "dry_run", options: publicOptions, startedBy: actor.isSystem ? null : actor.id }).returning().get();
  try {
    const report = await runImport(actor, input, deps);
    return db.update(importJobs).set({ status: "done", counts: report.counts, report: { ...report, counts: undefined }, finishedAt: new Date().toISOString() }).where(eq(importJobs.id, job.id)).returning().get();
  } catch (e) {
    return db.update(importJobs).set({ status: "failed", error: (e as Error).message.slice(0, 2000), finishedAt: new Date().toISOString() }).where(eq(importJobs.id, job.id)).returning().get();
  }
}

/** Fail jobs left running for 30+ minutes (server restart), then refuse when a job of this kind still runs. */
export function assertNoRunningJob(accountId: string, kind: ImportJob["kind"]): void {
  const stale = new Date(Date.now() - 30 * 60_000).toISOString();
  for (const j of db.select().from(importJobs).where(eq(importJobs.status, "running")).all()) {
    if (j.createdAt < stale) db.update(importJobs).set({ status: "failed", error: "Interrupted (server restart or timeout)", finishedAt: new Date().toISOString() }).where(eq(importJobs.id, j.id)).run();
    else if (j.kind === kind && j.accountId === accountId) throw new ConflictError("An import is already running");
  }
}

/** Create the job row now and run in the background; returns immediately (UI polls getJob). */
export function startImportJob(actor: Actor, input: ImportOptions = {}, deps: RunDeps = {}): ImportJob {
  assertCan(actor, "account:manage");
  const o = parse(importOptionsSchema, input);
  assertNoRunningJob(actor.accountId, "monday");
  const job = db.insert(importJobs).values({ accountId: actor.accountId, kind: "monday", mode: o.apply ? "apply" : "dry_run", options: { ...o, apiUrl: undefined }, startedBy: actor.isSystem ? null : actor.id }).returning().get();
  void runImportJob(actor, input, deps, job.id);
  return job;
}
