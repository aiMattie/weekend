import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { accounts } from "../../src/db/schema/core";
import { ConflictError } from "../../src/lib/errors";
import { getSettings, patchSettings, type ImportSchedule } from "../../src/server/services/account-settings";
import * as conn from "../../src/server/services/import-connections";
import type { ImportJob } from "../../src/server/services/import";
import { mondayCredentials } from "../../src/server/services/migration/credentials";
import type { MondayClient } from "../../src/server/services/migration/monday-client";
import { freshCtx, type Ctx } from "../helpers";

const ENV = ["MONDAY_API_KEY"] as const;
let saved: Record<string, string | undefined>;
let ctx: Ctx;
beforeEach(async () => {
  ctx = await freshCtx();
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
});
afterEach(() => { for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });

const KEY = "eyJhbGciOiJIUzI1NiJ9.secret-monday-key-123456";
const mondayOk = { mondayClient: () => ({ query: async () => ({ me: { name: "Alex", account: { name: "Example" } } }) }) as unknown as MondayClient };
const mondayBad = { mondayClient: () => ({ query: async () => { throw new Error("HTTP 401"); } }) as unknown as MondayClient };
const settingsJson = (accountId: string) => JSON.stringify(db.select().from(accounts).where(eq(accounts.id, accountId)).get()!.settings);

const sched = (p: Partial<ImportSchedule>): ImportSchedule => ({ enabled: true, frequency: "daily", hour: 6, weekday: 1, enabledAt: "2026-10-07T09:10:00Z", lastRunAt: null, lastJobId: null, ...p });

describe("schedule maths (account time zone, DST safe)", () => {
  const tz = "Europe/Amsterdam";
  it("hourly: next full hour after the last run / enabling", () => {
    expect(conn.nextRunAt(sched({ frequency: "hourly" }), tz)!.toISOString()).toBe("2026-10-07T10:00:00.000Z");
    expect(conn.nextRunAt(sched({ frequency: "hourly", lastRunAt: "2026-10-07T10:00:20Z" }), tz)!.toISOString()).toBe("2026-10-07T11:00:00.000Z");
  });
  it("daily at 06:00 local, before and after the switch to winter time", () => {
    expect(conn.nextRunAt(sched({}), tz)!.toISOString()).toBe("2026-10-08T04:00:00.000Z"); // CEST, UTC+2
    expect(conn.nextRunAt(sched({ lastRunAt: "2026-10-25T09:00:00Z" }), tz)!.toISOString()).toBe("2026-10-26T05:00:00.000Z"); // CET, UTC+1
  });
  it("weekly on Monday 06:00, disabled = no next run", () => {
    expect(conn.nextRunAt(sched({ frequency: "weekly", weekday: 1 }), tz)!.toISOString()).toBe("2026-10-12T04:00:00.000Z");
    expect(conn.nextRunAt(sched({ enabled: false }), tz)).toBeNull();
  });
});

describe("linking monday", () => {
  it("verifies, stores the secret sealed and never returns it", async () => {
    const v = await conn.connect(ctx.admin, "monday", { apiKey: KEY }, mondayOk);
    const m = v.connections.find((c) => c.kind === "monday")!;
    expect(m).toMatchObject({ linked: true, source: "app", label: "Example" });
    expect(JSON.stringify(v)).not.toContain(KEY);
    expect(settingsJson(ctx.admin.accountId)).not.toContain(KEY);
    expect(mondayCredentials(ctx.admin.accountId)).toEqual({ apiKey: KEY, source: "app" });
  });
  it("rejects credentials the source refuses and stores nothing", async () => {
    await expect(conn.connect(ctx.admin, "monday", { apiKey: KEY }, mondayBad)).rejects.toThrow(/weigert/);
    expect(mondayCredentials(ctx.admin.accountId)).toBeNull();
  });
  it("linked credentials win over .env; unlinking falls back to .env", async () => {
    process.env.MONDAY_API_KEY = "env-key";
    expect(mondayCredentials(ctx.admin.accountId)?.source).toBe("env");
    await conn.connect(ctx.admin, "monday", { apiKey: KEY }, mondayOk);
    expect(mondayCredentials(ctx.admin.accountId)?.source).toBe("app");
    conn.disconnect(ctx.admin, "monday");
    expect(mondayCredentials(ctx.admin.accountId)).toEqual({ apiKey: "env-key", source: "env" });
  });
  it("only account managers may see or change connections", async () => {
    expect(() => conn.adminView(ctx.member)).toThrow();
    await expect(conn.connect(ctx.member, "monday", { apiKey: KEY }, mondayOk)).rejects.toThrow();
  });
});

describe("scheduled sync", () => {
  const fakeJob = (id: string) => ({ id }) as ImportJob;

  it("cannot be enabled before linking", () => {
    expect(() => conn.updateSchedule(ctx.admin, "monday", { enabled: true })).toThrow(/Koppel eerst/);
  });

  it("starts a due run once, as a full apply run of the chosen scope", async () => {
    await conn.connect(ctx.admin, "monday", { apiKey: KEY }, mondayOk);
    conn.updateSchedule(ctx.admin, "monday", { enabled: true, frequency: "hourly", workspaces: ["main", "7059403"] });
    const calls: unknown[] = [];
    const deps = { startMonday: ((_a: unknown, input: unknown) => { calls.push(input); return fakeJob("j1"); }) as typeof import("../../src/server/services/import").startImportJob };
    const enabledAt = new Date(getSettings(ctx.admin.accountId).importConnections.monday.schedule.enabledAt!);
    expect(await conn.tickImportSchedules(enabledAt, deps)).toEqual([]); // not due yet
    const later = new Date(enabledAt.getTime() + 61 * 60_000);
    expect(await conn.tickImportSchedules(later, deps)).toEqual([{ accountId: ctx.admin.accountId, kind: "monday", jobId: "j1" }]);
    expect(calls).toEqual([{ apply: true, workspaces: ["main", "7059403"], includeUpdates: true, downloadFiles: true }]);
    expect(await conn.tickImportSchedules(later, deps)).toEqual([]); // lastRunAt moved on
  });

  it("a busy manual run is retried next tick", async () => {
    await conn.connect(ctx.admin, "monday", { apiKey: KEY }, mondayOk);
    conn.updateSchedule(ctx.admin, "monday", { enabled: true, frequency: "hourly" });
    patchSettings(ctx.admin.accountId, (s) => { s.importConnections.monday.schedule.enabledAt = "2026-10-07T09:10:00Z"; });
    const now = new Date("2026-10-07T10:01:00Z");
    let busy = true;
    const startMonday = (() => { if (busy) throw new ConflictError("An import is already running"); return fakeJob("j2"); }) as typeof import("../../src/server/services/import").startImportJob;
    expect(await conn.tickImportSchedules(now, { startMonday })).toEqual([]);
    expect(getSettings(ctx.admin.accountId).importConnections.monday.schedule.lastRunAt).toBeNull();
    busy = false;
    expect((await conn.tickImportSchedules(now, { startMonday })).map((s) => s.jobId)).toEqual(["j2"]);
  });
});
