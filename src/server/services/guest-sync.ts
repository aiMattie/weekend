/**
 * Guests invited to a whole workspace get a board membership on every board of that workspace that is
 * shared with guests ("share"). The membership rows make boards.list / the sidebar work without special cases.
 * Runs on invite acceptance, on access changes and (bus) whenever a board is created or updated.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { subscribe } from "../../lib/events";
import { boardMembers, boards } from "../../db/schema/core";
import { guestGrants } from "../../db/schema/audit-log";

/** Idempotent. Returns the number of memberships added. */
export function syncGuestGrants(workspaceId?: string): number {
  const grants = db.select().from(guestGrants).where(workspaceId ? eq(guestGrants.workspaceId, workspaceId) : undefined).all();
  let added = 0;
  for (const g of grants) {
    const shared = db.select({ id: boards.id }).from(boards).where(and(eq(boards.workspaceId, g.workspaceId), eq(boards.visibility, "share"), eq(boards.state, "active"))).all();
    for (const b of shared) added += db.insert(boardMembers).values({ boardId: b.id, userId: g.userId, role: g.role }).onConflictDoNothing().run().changes;
  }
  return added;
}

const g = globalThis as unknown as { __adminGuestSync?: () => void };
if (!g.__adminGuestSync) {
  g.__adminGuestSync = subscribe((e) => {
    if ((e.type !== "board.created" && e.type !== "board.updated") || !e.boardId) return;
    try {
      const b = db.select({ ws: boards.workspaceId, v: boards.visibility }).from(boards).where(eq(boards.id, e.boardId)).get();
      if (b?.v === "share") syncGuestGrants(b.ws);
    } catch (err) {
      console.error("[guests] grant sync failed", err instanceof Error ? err.message : err);
    }
  });
}
