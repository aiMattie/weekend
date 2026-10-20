import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { docVersions } from "@/db/schema/docs";
import { notifications } from "@/db/schema/core";
import * as docs from "@/server/services/docs";
import * as whiteboards from "@/server/services/whiteboards";
import * as items from "@/server/services/items";
import { freshCtx, type Ctx } from "../helpers";

let ctx: Ctx;
beforeEach(async () => { ctx = await freshCtx(); });

describe("docs service", () => {
  it("creates from markdown, reads back as markdown and blocks, assigns block ids", () => {
    const d = docs.create(ctx.member, { workspaceId: ctx.workspaceId, title: "Plan", markdown: "# Kop\n\nTekst\n\n- a\n- b" });
    expect(d.access).toBe("edit");
    expect(d.blocks.content!.every((n) => typeof (n.attrs as { blockId?: string })?.blockId === "string")).toBe(true);
    const [r] = docs.read(ctx.member, { ids: [d.id], format: "both" });
    expect(r.markdown).toContain("# Kop");
    expect(r.blocks?.content).toHaveLength(3);
    expect(docs.toMarkdown(ctx.member, d.id)).toMatch(/^# Plan\n\n# Kop/);
    expect(docs.read(ctx.member, { workspaceId: ctx.workspaceId }).map((x) => x.id)).toContain(d.id);
  });

  it("update supports blocks, markdown, appendMarkdown and snapshots versions", () => {
    const d = docs.create(ctx.member, { workspaceId: ctx.workspaceId, title: "V", markdown: "eerste" });
    docs.update(ctx.member, d.id, { markdown: "tweede" });
    let versions = docs.listVersions(ctx.member, d.id);
    expect(versions).toHaveLength(1); // previous state snapshotted
    docs.update(ctx.member, d.id, { appendMarkdown: "## extra" }); // within interval: no new snapshot
    expect(docs.listVersions(ctx.member, d.id)).toHaveLength(1);
    const after = docs.get(ctx.member, d.id);
    expect(after.blocks.content!.map((n) => n.type)).toEqual(["paragraph", "heading"]);
    // age the last snapshot -> next save snapshots again
    db.update(docVersions).set({ createdAt: new Date(Date.now() - 10 * 60_000).toISOString() }).where(eq(docVersions.docId, d.id)).run();
    docs.update(ctx.member, d.id, { markdown: "derde" });
    versions = docs.listVersions(ctx.member, d.id);
    expect(versions).toHaveLength(2);
    const first = versions[versions.length - 1];
    docs.restoreVersion(ctx.member, d.id, first.id);
    expect(docs.read(ctx.member, { ids: [d.id] })[0].markdown?.trim()).toBe("eerste");
    expect(docs.listVersions(ctx.member, d.id).length).toBeGreaterThan(2); // restore keeps a safety snapshot
    const v = docs.createVersion(ctx.member, d.id);
    expect(docs.getVersion(ctx.member, d.id, v.id).title).toBe("V");
  });

  it("validates input", () => {
    expect(() => docs.create(ctx.member, { title: "x" })).toThrow(/workspaceId or itemId/);
    expect(() => docs.update(ctx.member, docs.create(ctx.member, { workspaceId: ctx.workspaceId }).id, { blocks: { type: "paragraph" } })).toThrow();
  });

  it("enforces permissions: viewer reads, guest sees nothing, private docs are owner/members only", () => {
    const d = docs.create(ctx.member, { workspaceId: ctx.workspaceId, title: "Open", markdown: "hoi" });
    expect(docs.get(ctx.viewer, d.id).access).toBe("view");
    expect(() => docs.update(ctx.viewer, d.id, { title: "nee" })).toThrow(/only view/);
    expect(() => docs.create(ctx.viewer, { workspaceId: ctx.workspaceId })).toThrow();
    expect(() => docs.get(ctx.guest, d.id)).toThrow(/not found/);
    expect(docs.list(ctx.guest, {})).toHaveLength(0);

    const p = docs.update(ctx.member, d.id, { visibility: "private" });
    expect(p.visibility).toBe("private");
    expect(() => docs.get(ctx.viewer, d.id)).toThrow(/not found/);
    expect(docs.list(ctx.viewer, {}).map((x) => x.id)).not.toContain(d.id);
    docs.setMembers(ctx.member, d.id, [{ userId: ctx.viewer.id, role: "viewer" }]);
    expect(docs.get(ctx.viewer, d.id).access).toBe("view");
    expect(docs.get(ctx.admin, d.id).access).toBe("edit");
    expect(() => docs.setMembers(ctx.viewer, d.id, [])).toThrow();
    docs.remove(ctx.member, d.id);
    expect(() => docs.get(ctx.member, d.id)).toThrow(/not found/);
  });

  it("attaches docs to items (getOrCreateForItem is idempotent) and follows board permissions", () => {
    const item = items.create(ctx.sys, { boardId: ctx.boardId, name: "Klant A" });
    const a = docs.getOrCreateForItem(ctx.member, { itemId: item.id, columnId: "doc1" });
    const b = docs.getOrCreateForItem(ctx.member, { itemId: item.id, columnId: "doc1" });
    expect(b.id).toBe(a.id);
    expect(a.title).toBe("Klant A");
    expect(a.boardId).toBe(ctx.boardId);
    expect(docs.list(ctx.member, { itemId: item.id })).toHaveLength(1);
  });

  it("notifies newly mentioned users once (docs and comments)", () => {
    const mention = { type: "mention", attrs: { id: ctx.member.id, label: "Builder" } };
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hoi " }, mention] }] };
    const d = docs.create(ctx.admin, { workspaceId: ctx.workspaceId, title: "Mention", blocks: doc });
    const count = () => db.select().from(notifications).where(eq(notifications.userId, ctx.member.id)).all().filter((n) => n.type === "mention");
    expect(count()).toHaveLength(1);
    expect(count()[0].link).toBe(`/docs/${d.id}`);
    docs.update(ctx.admin, d.id, { blocks: doc }); // same mention: no duplicate
    expect(count()).toHaveLength(1);
    docs.addComment(ctx.admin, d.id, { body: `kijk even @${ctx.member.name}`, blockId: (d.blocks.content![0].attrs as { blockId: string }).blockId });
    expect(count()).toHaveLength(2);
    // no self notification
    docs.update(ctx.member, d.id, { blocks: { type: "doc", content: [{ type: "paragraph", content: [mention] }, { type: "paragraph" }] } });
    expect(count()).toHaveLength(2);
  });

  it("comments: thread, resolve, delete rules", () => {
    const d = docs.create(ctx.member, { workspaceId: ctx.workspaceId, markdown: "a" });
    const blockId = String((d.blocks.content![0].attrs as { blockId: string }).blockId);
    const c = docs.addComment(ctx.viewer, d.id, { body: "vraag", blockId });
    const reply = docs.addComment(ctx.member, d.id, { body: "antwoord", parentId: c.id });
    expect(docs.listComments(ctx.member, d.id).map((x) => x.id)).toEqual([c.id, reply.id]);
    expect(docs.resolveComment(ctx.member, d.id, c.id).resolved).toBe(true);
    expect(() => docs.removeComment(ctx.member, d.id, c.id)).toThrow(/own comments/);
    docs.removeComment(ctx.viewer, d.id, c.id);
    expect(docs.listComments(ctx.member, d.id)).toHaveLength(0);
  });
});

describe("whiteboards service", () => {
  it("saves data and bumps the version; patches merge without losing edits", () => {
    const w = whiteboards.create(ctx.member, { workspaceId: ctx.workspaceId, name: "Brainstorm" });
    expect(w.version).toBe(1);
    const note = { id: "n1", type: "note" as const, x: 10, y: 20, w: 160, h: 120, text: "idee", color: "#ffd02b" };
    const v2 = whiteboards.update(ctx.member, w.id, { patch: { upsert: [note] } });
    expect(v2.version).toBe(2);
    // second user adds another element based on the old version: patch keeps both
    const v3 = whiteboards.update(ctx.admin, w.id, { patch: { upsert: [{ id: "r1", type: "rect", x: 0, y: 0, w: 50, h: 50 }, { id: "c1", type: "connector", x: 0, y: 0, from: "n1", to: "r1" }] } });
    expect(v3.data.elements.map((e) => e.id)).toEqual(["n1", "r1", "c1"]);
    expect(whiteboards.getVersion(ctx.member, w.id).version).toBe(3);
    // removing an element drops its connectors
    const v4 = whiteboards.update(ctx.member, w.id, { patch: { remove: ["r1"] } });
    expect(v4.data.elements.map((e) => e.id)).toEqual(["n1"]);
    expect(whiteboards.get(ctx.member, w.id).data.elements[0].text).toBe("idee");
  });

  it("full data replace honours baseVersion; validates and checks permissions", () => {
    const w = whiteboards.create(ctx.member, { workspaceId: ctx.workspaceId });
    whiteboards.update(ctx.member, w.id, { data: { elements: [] }, baseVersion: 1 });
    expect(() => whiteboards.update(ctx.member, w.id, { data: { elements: [] }, baseVersion: 1 })).toThrow(/changed/);
    expect(() => whiteboards.update(ctx.member, w.id, { patch: { upsert: [{ id: "x", type: "bogus", x: 0, y: 0 }] } })).toThrow();
    expect(() => whiteboards.update(ctx.viewer, w.id, { name: "nee" })).toThrow();
    expect(whiteboards.get(ctx.viewer, w.id).canEdit).toBe(false);
    expect(() => whiteboards.get(ctx.guest, w.id)).toThrow();
    whiteboards.update(ctx.member, w.id, { name: "Hernoemd" });
    expect(whiteboards.list(ctx.member, { workspaceId: ctx.workspaceId })[0].name).toBe("Hernoemd");
    whiteboards.remove(ctx.member, w.id);
    expect(whiteboards.list(ctx.member, {})).toHaveLength(0);
  });
});
