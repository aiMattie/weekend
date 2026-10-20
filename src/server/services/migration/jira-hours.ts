/**
 * Worklogs: the current invoicing period (default: the month of `now`) is aggregated per
 * klant + fase + person + month into Urenregistratie rows; ALL raw worklogs go to a CSV archive.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { items } from "../../../db/schema/core";
import { createItemRow, patchItemRow } from "./item-writer";
import { aggregateWorklogs, monthPeriod, worklogsCsv, type HourRow } from "./jira-map";
import type { JiraSnapshot } from "./jira-snapshot";
import type { JiraEnv } from "./jira-write";
import { epicKeyOf, isSubtask } from "./jira-map";
import { fasesOfKlant } from "./jira-targets";
import { hashOf } from "./refs";

export interface HoursOptions { period?: string; now?: Date; nonBillableProjects?: string[]; archiveDir?: string }
export interface HoursReport { period: string; rows: number; totalHours: number; billableHours: number; nonBillableHours: number; meerwerkHours: number; unmappedPersons: number; worklogsTotal: number; archiveFile: string | null }

const NON_BILLABLE_RE = /non-?billable|\bintern(al)?\b/i;

export function migrateHours(env: JiraEnv, snap: JiraSnapshot, o: HoursOptions = {}): HoursReport & { csv: string; rowsData: HourRow[] } {
  const { tracker, targets } = env;
  const period = monthPeriod((o.period ?? (o.now ?? new Date()).toISOString().slice(0, 7)) + (o.period && o.period.length > 7 ? "" : "-01"));
  const issueByKey = new Map(snap.projects.flatMap((p) => p.issues.map((i) => [i.key, i] as const)));
  const projectName = new Map(snap.projects.map((p) => [p.project.key, p.project.name]));
  const nonBillable = new Set((o.nonBillableProjects ?? []).map((k) => k.toUpperCase()));
  const epicOf = (key: string): string | null => {
    let i = issueByKey.get(key);
    if (i && isSubtask(i) && i.fields.parent) i = issueByKey.get(i.fields.parent.key) ?? i;
    return i ? epicKeyOf(i, env.fields) : null;
  };
  const rows = aggregateWorklogs(snap.worklogs, period, {
    projectName: (k) => projectName.get(k) ?? k,
    faseOf: (key) => { const e = epicOf(key); return (e && env.epicFase.get(e)?.name) || ""; },
    isNonBillable: (key, pk) => nonBillable.has(pk.toUpperCase()) || NON_BILLABLE_RE.test(`${projectName.get(pk) ?? ""} ${pk}`) || (issueByKey.get(key)?.fields.labels ?? []).some((l) => /non-?billable/i.test(l)),
    isMeerwerk: (key) => (issueByKey.get(key)?.fields.labels ?? []).some((l) => /meerwerk/i.test(l)),
  });
  const uren = targets.delivery?.boards.uren;
  let unmapped = 0;
  for (const r of rows) {
    const userId = [...snap.worklogs].find((w) => w.author?.accountId === r.accountId)?.author;
    const wie = env.users.map(userId ?? null);
    if (!wie) unmapped++;
    const klantId = [...env.klantItem.entries()].find(([k]) => projectName.get(k) === r.klant)?.[1];
    const fase = klantId && targets.delivery && !tracker.isPlaceholder(klantId) ? fasesOfKlant(targets.delivery.boards.fases, klantId).find((f) => f.name === r.fase) : undefined;
    const pm = wie ? env.users.isPm(wie) : false;
    const lastDay = snap.worklogs.filter((w) => w.author?.accountId === r.accountId && w.projectKey === r.project && w.started.startsWith(r.month)).map((w) => w.started.slice(0, 10)).sort().pop() ?? `${r.month}-01`;
    const raw: Record<string, unknown> = {
      wie: wie ? [wie] : null, datum: lastDay, klant: klantId && !tracker.isPlaceholder(klantId) ? [klantId] : null, fase: fase ? [fase.id] : null,
      uren_dev: null, uren_pm: null, meerwerk_uren: null, nonbillable_uren: null, billable: { checked: r.billable }, factuurperiode: r.month, gefactureerd: { checked: false },
    };
    raw[!r.billable ? "nonbillable_uren" : r.meerwerk ? "meerwerk_uren" : pm ? "uren_pm" : "uren_dev"] = r.hours;
    const name = `${r.klant} · ${r.fase || "geen fase"} · ${r.person} · ${r.month}${!r.billable ? " (non-billable)" : r.meerwerk ? " (meerwerk)" : ""}`;
    const ext = [r.project, r.fase, r.accountId, r.month, r.billable, r.meerwerk].join("|");
    tracker.upsert("hours", ext, hashOf([raw, name]), `uren ${name}: ${r.hours}u`, {
      exists: (x) => !!db.select().from(items).where(eq(items.id, x)).get(),
      create: () => createItemRow(env.actor, { boardId: uren!, name, raw, creatorId: wie }).id,
      update: (x) => patchItemRow(x, { name, raw }),
    });
    if (!wie) tracker.note("hours row whose Jira author has no matching clone user: Wie left empty");
  }
  const sum = (f: (r: HourRow) => boolean) => Math.round(rows.filter(f).reduce((a, r) => a + r.hours, 0) * 100) / 100;
  return {
    period: period.label, rows: rows.length, totalHours: sum(() => true), billableHours: sum((r) => r.billable), nonBillableHours: sum((r) => !r.billable), meerwerkHours: sum((r) => r.meerwerk),
    unmappedPersons: unmapped, worklogsTotal: snap.worklogs.length, archiveFile: null, csv: worklogsCsv(snap.worklogs), rowsData: rows,
  };
}

export function writeArchive(csv: string, dir: string | undefined, now = new Date()): string {
  const d = dir ?? path.join(process.cwd(), "data", "archive");
  mkdirSync(d, { recursive: true });
  const file = path.join(d, `jira-worklogs-${now.toISOString().slice(0, 10)}.csv`);
  writeFileSync(file, csv, "utf8");
  return file;
}

