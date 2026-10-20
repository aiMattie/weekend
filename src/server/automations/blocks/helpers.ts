/** Shared helpers for action blocks. */
import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { teamMembers, users } from "../../../db/schema/core";
import type { PeopleValue } from "../../columns/people";
import type { ItemRow } from "../../services/_shared";
import type { RunContext } from "./types";
import { ValidationError } from "../../../lib/errors";
import * as items from "../../services/items";

/** The item an action works on. `on: "parent"` targets the parent of a subitem. */
export function targetItem(ctx: RunContext<{ on?: string }>): ItemRow {
  const it = ctx.item();
  if (!it) throw new ValidationError("This automation run has no item to work on");
  if (ctx.config.on === "parent" && it.parentItemId) return items.get(ctx.actor, it.parentItemId);
  return it;
}

export const ON_PARENT_FIELD = {
  key: "on", kind: "select" as const, label: { nl: "op", en: "on" }, default: "item",
  options: [{ value: "item", label: { nl: "dit item", en: "this item" } }, { value: "parent", label: { nl: "het bovenliggende item", en: "the parent item" } }],
};

/**
 * Recipient specs: a user id, "@creator", "@actor" (who triggered it), "@col:<columnId>" (people in
 * a column of the item), "@team:<teamId>". Returns distinct active user ids of the account.
 */
export function resolveUsers(ctx: RunContext<unknown>, specs: string[] | undefined): string[] {
  const out = new Set<string>();
  const it = ctx.item();
  for (const raw of specs ?? []) {
    const s = String(raw);
    if (s === "@creator") { if (it?.creatorId) out.add(it.creatorId); }
    else if (s === "@actor") { const a = ctx.event?.actorId ?? (ctx.trigger.vars.userId || null); if (a) out.add(a); }
    else if (s.startsWith("@col:")) {
      const v = it?.values[s.slice(5)] as PeopleValue | undefined;
      for (const p of v?.personsAndTeams ?? []) {
        if (p.kind === "person") out.add(p.id);
        else for (const m of db.select().from(teamMembers).where(eq(teamMembers.teamId, p.id)).all()) out.add(m.userId);
      }
    } else if (s.startsWith("@team:")) {
      for (const m of db.select().from(teamMembers).where(eq(teamMembers.teamId, s.slice(6))).all()) out.add(m.userId);
    } else if (/^\d+$/.test(s)) out.add(s);
  }
  if (!out.size) return [];
  return [...out].filter((id) => db.select({ id: users.id }).from(users).where(eq(users.id, id)).get());
}

/** Escape text for the sanitised HTML an update body expects. */
export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const textToHtml = (s: string) => s.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
