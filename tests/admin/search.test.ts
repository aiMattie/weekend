import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/client";
import { docs } from "../../src/db/schema/docs";
import { users } from "../../src/db/schema/core";
import { eq } from "drizzle-orm";
import { systemActor } from "../../src/lib/actor";
import * as boards from "../../src/server/services/boards";
import * as columns from "../../src/server/services/columns";
import * as items from "../../src/server/services/items";
import * as members from "../../src/server/services/members";
import * as permissions from "../../src/server/services/permissions";
import * as search from "../../src/server/services/search";
import * as updates from "../../src/server/services/updates";
import * as workspaces from "../../src/server/services/workspaces";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

const hits = (actor: Parameters<typeof search.search>[0], q: string, kind?: search.SearchKind) =>
  search.search(actor, { q, kinds: kind ? [kind] : undefined }).groups.flatMap((g) => g.hits);

describe("search", () => {
  it("finds boards, items, updates, workspaces and users, grouped", () => {
    const b = boards.create(c.admin, { workspaceId: c.workspaceId, name: "Zoekbord Alfa" });
    const it1 = items.create(c.admin, { boardId: b.id, name: "Kwartaalrapport schrijven" });
    updates.create(c.admin, { itemId: it1.id, body: "<p>De kwartaalcijfers zijn binnen</p>" });
    const r = search.search(c.admin, { q: "kwartaal" });
    expect(r.groups.map((g) => g.kind)).toEqual(expect.arrayContaining(["item", "update"]));
    expect(hits(c.admin, "Zoekbord", "board")[0]).toMatchObject({ title: "Zoekbord Alfa", href: `/boards/${b.id}` });
    expect(hits(c.admin, "kwartaalrapport", "item")[0]).toMatchObject({ id: it1.id, href: `/boards/${b.id}?item=${it1.id}`, boardName: "Zoekbord Alfa" });
    expect(hits(c.admin, "binnen", "update")[0].snippet.some((p) => p.hit)).toBe(true);
    expect(hits(c.admin, "Delivery", "workspace")[0].id).toBe(c.workspaceId);
    expect(hits(c.admin, "Builder", "user")[0].id).toBe(c.member.id);
    expect(hits(c.admin, "kwartaalrap")).not.toHaveLength(0); // prefix match
    expect(search.search(c.admin, { q: "  !!  " }).total).toBe(0);
  });

  it("keeps the index current through events (create, rename, delete)", () => {
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Oorspronkelijk" });
    expect(hits(c.admin, "oorspronkelijk", "item")).toHaveLength(1);
    items.update(c.admin, it1.id, { name: "Hernoemd item" });
    expect(hits(c.admin, "oorspronkelijk", "item")).toHaveLength(0);
    expect(hits(c.admin, "hernoemd", "item")).toHaveLength(1);
    items.remove(c.admin, it1.id);
    expect(hits(c.admin, "hernoemd", "item")).toHaveLength(0);
  });

  it("filters results by permission: private boards, closed workspaces, guests", () => {
    const priv = boards.create(c.admin, { workspaceId: c.workspaceId, name: "Geheim plan", visibility: "private" });
    items.create(c.admin, { boardId: priv.id, name: "Geheim item" });
    expect(hits(c.admin, "geheim")).toHaveLength(2);
    expect(hits(c.member, "geheim")).toHaveLength(0);
    boards.setMember(c.admin, priv.id, c.member.id, "viewer");
    expect(hits(c.member, "geheim")).toHaveLength(2);

    const closed = workspaces.create(c.admin, { name: "Besloten club", kind: "closed" });
    const cb = boards.create(c.admin, { workspaceId: closed.id, name: "Clubboard" });
    items.create(c.admin, { boardId: cb.id, name: "Clubitem" });
    expect(hits(c.member, "club")).toHaveLength(0);
    workspaces.setMember(c.admin, closed.id, c.member.id, "member");
    expect(hits(c.member, "club").length).toBeGreaterThanOrEqual(3);

    // guests only see the board they were added to; no workspaces, no people
    const shared = boards.create(c.admin, { workspaceId: c.workspaceId, name: "Gedeeld bord", visibility: "share" });
    items.create(c.admin, { boardId: shared.id, name: "Gedeeld item" });
    items.create(c.admin, { boardId: c.boardId, name: "Gedeeld intern item" });
    expect(hits(c.guest, "gedeeld")).toHaveLength(0);
    boards.setMember(c.admin, shared.id, c.guest.id, "viewer");
    const g = hits(c.guest, "gedeeld");
    expect(g.map((h) => h.title).sort()).toEqual(["Gedeeld bord", "Gedeeld item"]);
    expect(hits(c.guest, "delivery", "workspace")).toHaveLength(0);
    expect(hits(c.guest, "dev1", "user")).toHaveLength(0);
  });

  it("does not leak the text of columns that are hidden for the searcher", () => {
    const col = columns.create(c.admin, c.boardId, { title: "Geheime notitie", type: "text" });
    const it1 = items.create(c.admin, { boardId: c.boardId, name: "Gewoon item" });
    items.changeColumnValue(c.admin, it1.id, col.id, "vertrouwelijkecode");
    expect(hits(c.admin, "vertrouwelijkecode", "item")).toHaveLength(1);
    permissions.setColumnPermission(c.admin, col.id, { view: { mode: "owners" } });
    search.reindexBoard(c.boardId);
    expect(hits(c.admin, "vertrouwelijkecode", "item")).toHaveLength(0);
    expect(hits(c.admin, "gewoon", "item")).toHaveLength(1);
  });

  it("indexes docs and applies doc visibility", () => {
    const sys = systemActor(c.accountId);
    void sys;
    db.insert(docs).values({ workspaceId: c.workspaceId, title: "Handboek onboarding", blocks: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Welkom bij de nieuwe medewerker" }] }] }, ownerId: c.admin.id }).run();
    db.insert(docs).values({ workspaceId: c.workspaceId, title: "Privé onboarding", visibility: "private", blocks: { type: "doc", content: [] }, ownerId: c.admin.id }).run();
    expect(hits(c.admin, "onboarding", "doc")).toHaveLength(2);
    expect(hits(c.member, "onboarding", "doc").map((h) => h.title)).toEqual(["Handboek onboarding"]);
    expect(hits(c.member, "nieuwe medewerker", "doc")).toHaveLength(1);
    expect(hits(c.guest, "onboarding", "doc")).toHaveLength(0);
  });

  it("reconciles changes made behind the event bus", () => {
    items.create(c.admin, { boardId: c.boardId, name: "Voorheen" });
    expect(hits(c.admin, "voorheen")).toHaveLength(1);
    db.update(users).set({ name: "Builder Gewijzigd" }).where(eq(users.id, c.member.id)).run();
    expect(hits(c.admin, "gewijzigd", "user")).toHaveLength(1);
    search.reindexAll();
    expect(hits(c.admin, "voorheen")).toHaveLength(1);
  });

  it("stores recent searches per user (unique, newest first, clearable)", () => {
    search.addRecent(c.member, "kwartaal");
    search.addRecent(c.member, "rapport");
    search.addRecent(c.member, "kwartaal");
    expect(search.recent(c.member)).toEqual(["kwartaal", "rapport"]);
    expect(search.recent(c.admin)).toEqual([]);
    search.clearRecent(c.member);
    expect(search.recent(c.member)).toEqual([]);
  });

  it("members are listed by the invitation flow too (users index follows member events)", async () => {
    const inv = members.invite(c.admin, { email: "zoekbaar@voorbeeld.nl", name: "Zoekbaar Persoon" });
    await members.acceptInvitation(inv.link.split("/").pop()!, { password: "Geheim-12345" });
    expect(hits(c.admin, "zoekbaar", "user")).toHaveLength(1);
  });
});
