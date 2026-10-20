/** Orchestrates the synchronous part of the monday import (everything after the network reads). */
import type { Actor } from "../../../lib/actor";
import { db } from "../../../db/client";
import { importDocs, importItems, importRelations, importUpdates, type PendingDownload } from "./import-content";
import { finalizeColumns, importBoards, importFolders, importTeams, importUsers, importWorkspaces, type ImportEnv } from "./import-structure";
import type { MondaySnapshot } from "./monday-types";
import { Tracker } from "./refs";

/**
 * Apply mode runs in one transaction, so a failure leaves the clone untouched. Dry-run never
 * writes; the tracker hands out numeric placeholder ids so every step runs the same code path.
 */
export function importContent(actor: Actor, snap: MondaySnapshot, opts: { apply: boolean; adoptBoards: boolean }): { tracker: Tracker; pending: PendingDownload[]; skipped: Record<string, number> } {
  const tracker = new Tracker("monday", opts.apply);
  const env: ImportEnv = { accountId: actor.accountId, tracker, snap, adoptBoards: opts.adoptBoards };
  const pending: PendingDownload[] = [];
  const skipped: Record<string, number> = {};
  const run = () => {
    importUsers(env);
    importTeams(env);
    importWorkspaces(env);
    importFolders(env);
    const planned = importBoards(env);
    finalizeColumns(env, planned);
    importItems(env, planned, pending);
    importRelations(env, planned);
    importUpdates(env, planned, pending);
    const docsSkipped = importDocs(env, actor);
    if (docsSkipped) skipped.docs = docsSkipped;
    if (snap.skippedBoards.length) skipped.customObjects = snap.skippedBoards.length;
    const subBoards = snap.boards.filter((b) => b.type === "sub_items_board").length;
    if (subBoards) skipped.subitemBoardsMerged = subBoards;
    const docBoards = snap.boards.filter((b) => b.type === "document").length;
    if (docBoards) skipped.documentBoards = docBoards;
  };
  if (opts.apply) db.transaction(run);
  else run();
  for (const [msg, n] of Object.entries(tracker.tally)) tracker.warn(`${n} x ${msg}`);
  return { tracker, pending, skipped };
}
