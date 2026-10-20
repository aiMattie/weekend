/** Build an Actor from a user id (used by signed-URL endpoints that carry the user in a token). */
import { eq } from "drizzle-orm";
import type { Actor } from "@/lib/actor";
import { db } from "@/db/client";
import { users } from "@/db/schema/core";

export function userToActorLite(userId: string): Actor | null {
  const u = db.select().from(users).where(eq(users.id, userId)).get();
  if (!u || !u.isActive) return null;
  return { id: u.id, accountId: u.accountId, role: u.role, name: u.name, email: u.email, source: "mcp" };
}
