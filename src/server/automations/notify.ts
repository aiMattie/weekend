/** In-app notification + email for the notify actions. */
import { inArray } from "drizzle-orm";
import type { Actor } from "../../lib/actor";
import { db } from "../../db/client";
import { users } from "../../db/schema/core";
import { notify } from "../services/_shared";
import { sendMail } from "./mailer";

export const appUrl = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3058").replace(/\/$/, "");

export interface NotifyInput { title: string; body?: string; boardId?: string | null; itemId?: string | null; email?: boolean; subject?: string }

/** Create in-app notifications (type "automation") and optionally email the same users. Returns the number of users reached. */
export async function notifyUsers(actor: Actor, userIds: string[], n: NotifyInput): Promise<number> {
  if (!userIds.length) return 0;
  const link = n.boardId ? `/boards/${n.boardId}${n.itemId ? `?item=${n.itemId}` : ""}` : undefined;
  for (const id of userIds) notify(actor, id, { type: "automation", title: n.title, body: n.body, boardId: n.boardId ?? undefined, itemId: n.itemId ?? undefined, link });
  if (n.email) {
    const rows = db.select({ email: users.email, name: users.name, active: users.isActive, ai: users.isAiAgent }).from(users).where(inArray(users.id, userIds)).all().filter((u) => u.active && !u.ai);
    if (rows.length) {
      const text = `${n.body ? `${n.body}\n\n` : ""}${link ? `${appUrl()}${link}` : ""}`.trim() || n.title;
      await sendMail({ to: rows.map((r) => r.email), subject: n.subject || n.title, text });
    }
  }
  return userIds.length;
}
