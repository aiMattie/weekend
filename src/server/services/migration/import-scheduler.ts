/**
 * In-process timer for the scheduled imports (Admin > Import): every minute, start the monday.com / Jira runs whose
 * slot has passed. Off with IMPORT_SCHEDULER=off and under Vitest. HMR safe (one timer per process).
 */
import { tickImportSchedules } from "../import-connections";

const g = globalThis as unknown as { __importTimer?: ReturnType<typeof setInterval>; __importBusy?: boolean };

export function startImportScheduler(intervalMs = 60_000): void {
  if (g.__importTimer) clearInterval(g.__importTimer);
  g.__importTimer = undefined;
  if (process.env.IMPORT_SCHEDULER === "off" || process.env.VITEST) return;
  const run = () => {
    if (g.__importBusy) return;
    g.__importBusy = true;
    tickImportSchedules()
      .then((started) => { for (const s of started) console.log(`[import] scheduled ${s.kind} sync started (job ${s.jobId})`); })
      .catch((e) => console.error("[import] schedule tick failed", e))
      .finally(() => { g.__importBusy = false; });
  };
  g.__importTimer = setInterval(run, intervalMs);
  g.__importTimer.unref?.();
  setTimeout(run, 5000).unref?.(); // catch-up on boot
}

export function stopImportScheduler(): void { if (g.__importTimer) clearInterval(g.__importTimer); g.__importTimer = undefined; }
