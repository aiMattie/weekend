/** Profile page: own name, title, phone, language, avatar, password. Everything is self service. */
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError } from "../../lib/errors";
import { emit } from "../../lib/events";
import { hashPassword, verifyPassword } from "../../lib/auth/password";
import { db } from "../../db/client";
import { users } from "../../db/schema/core";
import { userSecurity } from "../../db/schema/audit-log";
import { removeImage, saveImage } from "../../modules/admin/lib/images";
import { recordAudit } from "./audit";
import { assertPasswordPolicy } from "./security";
import { revokeAllForUser } from "./sessions";
import { getSecurityRow } from "./twofactor";
import { parse } from "./_shared";

const updateInput = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().max(200).nullish(),
  phone: z.string().trim().max(50).nullish(),
  locale: z.enum(["nl", "en"]).optional(),
  timeZone: z.string().trim().min(1).max(60).optional(),
});

export interface Profile {
  id: string; name: string; email: string; title: string | null; phone: string | null; photoUrl: string | null;
  locale: string; timeZone: string; role: string; twoFactorEnabled: boolean; recoveryCodesLeft: number; passwordChangedAt: string | null;
}

export function get(actor: Actor): Profile {
  const u = db.select().from(users).where(eq(users.id, actor.id)).get();
  if (!u) throw new NotFoundError("User");
  const sec = getSecurityRow(u.id);
  return {
    id: u.id, name: u.name, email: u.email, title: u.title, phone: u.phone, photoUrl: u.photoUrl, locale: u.locale, timeZone: u.timeZone, role: u.role,
    twoFactorEnabled: sec.totpEnabled, recoveryCodesLeft: sec.recoveryCodes.length, passwordChangedAt: sec.passwordChangedAt,
  };
}

export function update(actor: Actor, input: unknown): Profile {
  const d = parse(updateInput, input);
  if (d.timeZone) { try { new Intl.DateTimeFormat("nl", { timeZone: d.timeZone }); } catch { throw new ForbiddenError("Unknown time zone"); } }
  if (Object.keys(d).length) db.update(users).set(d).where(eq(users.id, actor.id)).run(); // undefined = untouched, null = cleared
  emit({ type: "member.changed", boardId: null, actorId: actor.id });
  return get(actor);
}

export function setAvatar(actor: Actor, data: Buffer | null): Profile {
  if (data) saveImage("avatar", actor.id, data);
  else removeImage("avatar", actor.id);
  db.update(users).set({ photoUrl: data ? `/api/v1/profile/avatar/${actor.id}?v=${Date.now()}` : null }).where(eq(users.id, actor.id)).run();
  emit({ type: "member.changed", boardId: null, actorId: actor.id });
  return get(actor);
}

/** Change the own password; all other sessions are signed out. */
export async function changePassword(actor: Actor, input: unknown, currentSid?: string | null): Promise<void> {
  const d = parse(z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) }), input);
  const u = db.select().from(users).where(eq(users.id, actor.id)).get();
  if (!u || !(await verifyPassword(d.current, u.passwordHash))) throw new ForbiddenError("Het huidige wachtwoord klopt niet");
  assertPasswordPolicy(actor.accountId, d.next);
  db.update(users).set({ passwordHash: await hashPassword(d.next) }).where(eq(users.id, actor.id)).run();
  getSecurityRow(actor.id);
  db.update(userSecurity).set({ passwordChangedAt: new Date().toISOString() }).where(eq(userSecurity.userId, actor.id)).run();
  revokeAllForUser(actor.id, "password_changed", currentSid ?? undefined);
  recordAudit(actor, "user.password_changed", { targetType: "user", targetId: actor.id });
}
