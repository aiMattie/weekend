/**
 * Retrospectives: cards (Keep / Improve / Discussion) are items on the Retrospectives board, one group
 * per sprint. Votes live in `retro_votes` (one per user per card); the "Stemmen" column mirrors the count.
 */
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { systemActor, type Actor } from "../../lib/actor";
import { ValidationError } from "../../lib/errors";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { groups, items, users } from "../../db/schema/core";
import { retroVotes, sprints } from "../../db/schema/sprints";
import { statusLabels } from "../columns/labels";
import { activeGroups, insertGroupRow } from "./groups";
import * as itemsSvc from "./items";
import { boardColumns, getItemRow, parse, requireBoard } from "./_shared";
import { sprintsBoardFor } from "./dev-config";
import { toDtoLite } from "./sprint-read";

export type RetroKind = "Keep" | "Improve" | "Discussion";
export interface RetroCard { id: string; text: string; kind: RetroKind | string; groupId: string | null; sprint: string; votes: number; voted: boolean; authorId: string | null; authorName: string | null }
export interface RetroData { boardId: string; sprints: { id: string; name: string; state: string }[]; groups: { id: string; title: string }[]; cards: RetroCard[] }

const kindCol = (boardId: string) => boardColumns(boardId, "item").find((c) => c.key === "categorie");
const votesCol = (boardId: string) => boardColumns(boardId, "item").find((c) => c.key === "stemmen");

export function list(actor: Actor, boardId: string): RetroData {
  requireBoard(actor, boardId, "board:view");
  const kc = kindCol(boardId);
  const labels = kc ? statusLabels(kc.settings) : [];
  const gs = activeGroups(boardId);
  const rows = db.select().from(items).where(and(eq(items.boardId, boardId), eq(items.state, "active"))).all().filter((i) => !i.parentItemId);
  const votes = rows.length ? db.select().from(retroVotes).where(inArray(retroVotes.itemId, rows.map((r) => r.id))).all() : [];
  const authors = new Map(db.select({ id: users.id, name: users.name }).from(users).where(eq(users.accountId, actor.accountId)).all().map((u) => [u.id, u.name]));
  const sb = sprintsBoardFor(boardId);
  const sp = sb ? db.select().from(sprints).where(eq(sprints.boardId, sb)).all().map((s) => ({ id: s.id, name: toDtoLite(s), state: s.state })) : [];
  return {
    boardId, sprints: sp, groups: gs.map((g) => ({ id: g.id, title: g.title })),
    cards: rows.map((r) => {
      const v = kc ? (r.values[kc.id] as { index: number } | undefined) : undefined;
      return {
        id: r.id, text: r.name, kind: labels.find((l) => l.id === v?.index)?.text ?? "Discussion", groupId: r.groupId, sprint: gs.find((g) => g.id === r.groupId)?.title ?? "",
        votes: votes.filter((x) => x.itemId === r.id).length, voted: votes.some((x) => x.itemId === r.id && x.userId === actor.id),
        authorId: r.creatorId, authorName: r.creatorId ? authors.get(r.creatorId) ?? null : null,
      };
    }),
  };
}

const cardInput = z.object({ kind: z.enum(["Keep", "Improve", "Discussion"]), text: z.string().trim().min(1).max(500), sprintId: idSchema.optional(), groupId: idSchema.optional() });

export function addCard(actor: Actor, boardId: string, input: unknown): RetroCard {
  const d = parse(cardInput, input);
  requireBoard(actor, boardId, "board:edit_items");
  let groupId = d.groupId;
  if (!groupId && d.sprintId) {
    const s = db.select().from(sprints).where(eq(sprints.id, d.sprintId)).get();
    if (!s) throw new ValidationError("Unknown sprint");
    const title = toDtoLite(s);
    groupId = activeGroups(boardId).find((g) => g.title === title)?.id ?? insertGroupRow(boardId, { title, top: true }).id;
  }
  groupId ??= activeGroups(boardId)[0]?.id;
  if (!groupId) throw new ValidationError("Retro board has no group");
  if (db.select().from(groups).where(and(eq(groups.id, groupId), eq(groups.boardId, boardId))).get() === undefined) throw new ValidationError("Group is on another board");
  const it = itemsSvc.create(actor, { boardId, groupId, name: d.text, values: { categorie: d.kind, stemmen: 0 } });
  return list(actor, boardId).cards.find((c) => c.id === it.id)!;
}

/** Toggle the actor's vote on a card. Returns the new vote count. */
export function vote(actor: Actor, itemId: string): { votes: number; voted: boolean } {
  const it = getItemRow(itemId);
  requireBoard(actor, it.boardId, "board:comment");
  const mine = db.select().from(retroVotes).where(and(eq(retroVotes.itemId, itemId), eq(retroVotes.userId, actor.id))).get();
  if (mine) db.delete(retroVotes).where(eq(retroVotes.id, mine.id)).run();
  else db.insert(retroVotes).values({ itemId, userId: actor.id }).run();
  const n = db.select().from(retroVotes).where(eq(retroVotes.itemId, itemId)).all().length;
  const vc = votesCol(it.boardId);
  if (vc) itemsSvc.changeColumnValue(systemActor(actor.accountId, "system"), itemId, vc.id, n);
  return { votes: n, voted: !mine };
}
