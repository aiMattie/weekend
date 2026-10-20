/** Admin center > Account: general settings and logo. */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { assertCan } from "../../lib/permissions";
import { db } from "../../db/client";
import { accounts } from "../../db/schema/core";
import { readImage, removeImage, saveImage } from "../../modules/admin/lib/images";
import { accountRow, getSettings, patchSettings } from "./account-settings";
import { recordAudit } from "./audit";
import { parse } from "./_shared";

export interface AccountInfo {
  id: string; name: string; slug: string;
  general: { logoUrl: string | null; defaultLocale: "nl" | "en"; timeZone: string; weekStart: "monday" | "sunday" | "saturday" };
}

/** Readable by every user of the account (name, logo, defaults). */
export function get(actor: Actor): AccountInfo {
  const a = accountRow(actor.accountId);
  return { id: a.id, name: a.name, slug: a.slug, general: getSettings(a.id).general };
}

const updateInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  defaultLocale: z.enum(["nl", "en"]).optional(),
  timeZone: z.string().trim().min(1).max(60).refine((tz) => { try { new Intl.DateTimeFormat("nl", { timeZone: tz }); return true; } catch { return false; } }, "Unknown time zone").optional(),
  weekStart: z.enum(["monday", "sunday", "saturday"]).optional(),
});

export function update(actor: Actor, input: unknown): AccountInfo {
  assertCan(actor, "account:manage");
  const d = parse(updateInput, input);
  if (d.name) db.update(accounts).set({ name: d.name }).where(eq(accounts.id, actor.accountId)).run();
  patchSettings(actor.accountId, (s) => {
    if (d.defaultLocale) s.general.defaultLocale = d.defaultLocale;
    if (d.timeZone) s.general.timeZone = d.timeZone;
    if (d.weekStart) s.general.weekStart = d.weekStart;
  });
  recordAudit(actor, "account.settings_changed", { ...d });
  return get(actor);
}

export function setLogo(actor: Actor, data: Buffer | null): AccountInfo {
  assertCan(actor, "account:manage");
  if (data) saveImage("logo", actor.accountId, data);
  else removeImage("logo", actor.accountId);
  patchSettings(actor.accountId, (s) => { s.general.logoUrl = data ? `/api/v1/account/logo?v=${Date.now()}` : null; });
  recordAudit(actor, data ? "account.logo_changed" : "account.logo_removed", {});
  return get(actor);
}

/**
 * Public branding (no actor): name + logo of the install's account, for page metadata
 * (<title>, Open Graph) and the public logo route. One account per install: the oldest one.
 */
export function publicBranding(): { accountId: string; name: string; hasLogo: boolean; logoVersion: string | null } | null {
  const a = db.select({ id: accounts.id, name: accounts.name }).from(accounts).orderBy(asc(accounts.createdAt)).limit(1).get();
  if (!a) return null;
  const logoUrl = getSettings(a.id).general.logoUrl;
  return { accountId: a.id, name: a.name, hasLogo: !!logoUrl, logoVersion: logoUrl ? new URL(logoUrl, "http://x").searchParams.get("v") : null };
}

/** The public logo image (Open Graph / favicon), or null when no logo is set. */
export function publicLogo(): { data: Buffer; mime: string } | null {
  const b = publicBranding();
  return b?.hasLogo ? readImage("logo", b.accountId) : null;
}
