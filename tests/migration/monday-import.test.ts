import { mkdtempSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { docs } from "../../src/db/schema/docs";
import { mondayBlocksToTiptap } from "../../src/server/services/migration/monday-docs";
import { assets, boards, columns, groups, items, teamMembers, updates, users, views, workspaces } from "../../src/db/schema/core";
import { externalRefs } from "../../src/db/schema/import-jobs";
import { MondayClient, ReadOnlyViolationError, assertReadOnly, type FetchLike } from "../../src/server/services/migration/monday-client";
import { fetchSnapshot } from "../../src/server/services/migration/monday-queries";
import { cloneKey, planColumn, safeJson, translateFormula, translateValue, type ValueCtx } from "../../src/server/services/migration/monday-values";
import * as importer from "../../src/server/services/import";
import { mockHandler, MockLog } from "../../scripts/fixtures/monday/mock-server";
import { KLANTEN_COLS } from "../../scripts/fixtures/monday/mock-data";
import { freshCtx, type Ctx } from "../helpers";

const FILE_BYTES = new TextEncoder().encode("%PDF-mock");
const mockFetch = (log?: MockLog, calls?: { n: number }): FetchLike => async (_url, init) => {
  if (calls) calls.n++;
  if (init?.method === "GET") return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}), arrayBuffer: async () => FILE_BYTES.buffer.slice(0) as ArrayBuffer };
  const { query, variables } = JSON.parse(init!.body!) as { query: string; variables?: Record<string, unknown> };
  const body = (() => { try { return { data: mockHandler(query, variables ?? {}, log) }; } catch (e) { return { errors: [{ message: (e as Error).message }] }; } })();
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) };
};
const client = (log?: MockLog) => new MondayClient({ apiKey: "k", apiUrl: "http://127.0.0.1:9/v2", fetch: mockFetch(log), sleep: async () => {} });

describe("read-only guard", () => {
  it("rejects every mutation document", () => {
    for (const doc of [
      "mutation { create_item(board_id: 1, item_name: \"x\") { id } }",
      "  MUTATION { delete_item(item_id: 1) { id } }",
      "query { me { id } }\nmutation M { archive_board(board_id: 1) { id } }",
      "# comment\nmutation($b: ID!) { create_board(board_name: \"x\", board_kind: public) { id } }",
      "subscription { x }",
      "",
    ]) expect(() => assertReadOnly(doc), doc).toThrow(ReadOnlyViolationError);
  });
  it("allows queries (comments mentioning the word are stripped)", () => {
    expect(() => assertReadOnly("query { boards { id } }")).not.toThrow();
    expect(() => assertReadOnly("# no mutation here\n{ users { id } }")).not.toThrow();
  });
  it("client throws before any network call", async () => {
    const calls = { n: 0 };
    const c = new MondayClient({ apiKey: "k", apiUrl: "http://127.0.0.1:9/v2", fetch: mockFetch(undefined, calls) });
    await expect(c.query("mutation { create_item(board_id: 1, item_name: \"x\") { id } }")).rejects.toBeInstanceOf(ReadOnlyViolationError);
    expect(calls.n).toBe(0);
  });
  it("never sends the key to a foreign host", () => {
    expect(() => new MondayClient({ apiKey: "k", apiUrl: "https://evil.example.com/v2" })).toThrow(/Refusing/);
    expect(() => new MondayClient({ apiKey: "k" })).not.toThrow();
  });
  it("retries on rate limits with backoff", async () => {
    let n = 0;
    const waits: number[] = [];
    const f: FetchLike = async () => {
      n++;
      const rate = n < 3;
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => (rate ? { errors: [{ message: "limit", extensions: { code: "RATE_LIMIT_EXCEEDED", retry_in_seconds: 3 } }] } : { data: { ok: 1 } }), arrayBuffer: async () => new ArrayBuffer(0) };
    };
    const c = new MondayClient({ apiKey: "k", apiUrl: "http://127.0.0.1:9/v2", fetch: f, sleep: async (ms) => { waits.push(ms); } });
    expect(await c.query("query { a }")).toEqual({ ok: 1 });
    expect(waits).toEqual([3000, 3000]);
  });
});

describe("value translation per column type", () => {
  const colRef = (p: { key: string; title: string; type: string; settings: Record<string, unknown> }) => ({ id: p.key, ...p });
  const ctx: ValueCtx = { userId: (id) => (String(id) === "9001" ? "2000000001" : undefined), assetId: (id) => (String(id) === "4001" ? "2000000050" : undefined), itemId: (id) => (String(id) === "6101" ? "2000000100" : undefined), columnRef: colRef };
  const plan = (id: string) => planColumn(KLANTEN_COLS.find((c) => c.id === id)!, "item");
  const tr = (id: string, value: unknown) => translateValue(plan(id), { value: value === null ? null : JSON.stringify(value), text: "" }, ctx);

  it("status keeps label index, colors and done flag in settings", () => {
    const p = plan("status");
    const labels = p.settings.labels as { id: number; text: string; color: string; isDone: boolean }[];
    expect(labels.find((l) => l.id === 1)).toMatchObject({ text: "Done", color: "#00c875", isDone: true });
    expect(labels.some((l) => l.id === 5)).toBe(true);
    expect(tr("status", { index: 2, post_id: null, changed_at: "x" }).value).toEqual({ index: 2 });
  });
  it("people remaps users and drops unknown ones with a warning", () => {
    const r = tr("people", { personsAndTeams: [{ id: 9001, kind: "person" }, { id: 5, kind: "person" }] });
    expect(r.value).toEqual({ personsAndTeams: [{ id: "2000000001", kind: "person" }] });
    expect(r.warning).toMatch(/unknown monday user 5/);
  });
  it("date, numbers, text, long_text, checkbox, link, dropdown, timeline", () => {
    expect(tr("date4", { date: "2026-03-01", changed_at: "x" }).value).toEqual({ date: "2026-03-01" });
    expect(tr("numbers", "95.5").value).toBe(95.5);
    expect(tr("text", "hallo").value).toBe("hallo");
    expect(tr("long_text", { text: "abc", changed_at: "x" }).value).toEqual({ text: "abc" });
    expect(tr("checkbox", { checked: "true" }).value).toEqual({ checked: true });
    expect(tr("link", { url: "https://example.test", text: "x" }).value).toMatchObject({ url: "https://example.test" });
    expect(tr("dropdown", { ids: [1, 2] }).value).toEqual({ ids: [1, 2] });
    expect(tr("timeline", { from: "2026-01-01", to: "2026-02-01" }).value).toMatchObject({ from: "2026-01-01", to: "2026-02-01" });
  });
  it("board_relation and file remap ids", () => {
    expect(tr("board_relation_a", { linkedPulseIds: [{ linkedPulseId: 6101 }, { linkedPulseId: 1 }] }).value).toEqual({ linkedPulseIds: [{ linkedPulseId: "2000000100" }] });
    expect(tr("files", { files: [{ assetId: 4001, name: "a.pdf", isImage: "false" }, { fileType: "MONDAY_DOC", linkToFile: "https://x.monday.com/docs/1" }] }).value).toMatchObject({ files: [{ assetId: "2000000050", name: "a.pdf" }, { fileType: "LINK", linkToFile: "https://x.monday.com/docs/1" }] });
  });
  it("numbers settings map custom units; dropdown labels map names", () => {
    expect(plan("numbers").settings).toEqual({ unit: "€", unitPosition: "left" });
    expect(plan("dropdown").settings).toMatchObject({ labels: [{ id: 1, text: "Fixed price" }, { id: 2, text: "Strippenkaart" }], allowMultiple: true });
  });
  it("unknown types are stored raw with a warning; computed types are skipped", () => {
    const r = tr("weird", { foo: "bar" });
    expect(r.value).toEqual({ foo: "bar" });
    expect(r.warning).toMatch(/unknown column type/);
    expect(tr("mirror_a", { x: 1 }).skipped).toBe(true);
  });
  it("invalid values give a warning instead of throwing", () => {
    const r = tr("status", { index: 42 });
    expect(r.value).toBeUndefined();
    expect(r.warning).toMatch(/skipped/);
  });
  it("helpers", () => {
    expect(cloneKey("Board_Relation.X1")).toBe("board_relation_x1");
    expect(cloneKey("1abc")).toBe("c_1abc");
    expect(safeJson("{bad", 5)).toBe(5);
    expect(translateFormula("{numbers}*{zz}", (id) => (id === "numbers" ? "Uurtarief" : undefined))).toEqual({ formula: "{Uurtarief}*{zz}", unresolved: ["zz"] });
  });
});

describe("importer", () => {
  let ctx: Ctx;
  const sizes = () => ({ ws: db.select().from(workspaces).all().length, boards: db.select().from(boards).all().length, items: db.select().from(items).all().length, cols: db.select().from(columns).all().length, users: db.select().from(users).all().length, refs: db.select().from(externalRefs).all().length });
  beforeEach(async () => { ctx = await freshCtx(); });

  it("dry-run writes nothing and reports counts", async () => {
    const before = sizes();
    const rep = await importer.runImport(ctx.admin, { apply: false }, { client: client() });
    expect(sizes()).toEqual(before);
    expect(rep.mode).toBe("dry_run");
    expect(rep.counts.board.create + rep.counts.board.update).toBe(3);
    expect(rep.counts.item.create).toBe(7);
    expect(rep.counts.subitem.create).toBe(2);
    expect(rep.counts.update.create).toBe(2);
    expect(rep.counts.asset.create).toBe(1);
    expect(rep.skipped).toMatchObject({ customObjects: 1, documentBoards: 1 });
    expect(rep.diff.some((l) => l.startsWith("+ item"))).toBe(true);
    expect(rep.warnings.some((w) => /unknown column type/.test(w))).toBe(true);
    expect(rep.warnings.some((w) => /item not imported/.test(w))).toBe(true);
  });

  it("only ever sends queries to the (mock) server", async () => {
    const log: MockLog = { queries: [] };
    await importer.runImport(ctx.admin, { apply: false }, { client: client(log) });
    expect(log.queries.length).toBeGreaterThan(5);
    expect(log.queries.every((q) => !/\bmutation\b/i.test(q))).toBe(true);
  });

  it("apply creates structure and content with translated values", async () => {
    const rep = await importer.runImport(ctx.admin, { apply: true, downloadFiles: false }, { client: client() });
    expect(rep.mode).toBe("apply");
    const klanten = db.select().from(boards).where(eq(boards.name, "Klanten")).all().find((b) => (b.settings as { mondayBoardId?: string }).mondayBoardId === "5001")!;
    expect(klanten).toBeTruthy();
    expect(db.select().from(groups).where(eq(groups.boardId, klanten.id)).all().map((g) => g.title).sort()).toEqual(["Actieve klanten", "Support"]);
    const cols = db.select().from(columns).where(eq(columns.boardId, klanten.id)).all();
    expect(cols.find((c) => c.key === "status")?.type).toBe("status");
    expect(cols.some((c) => c.scope === "subitem" && c.key === "people")).toBe(true);
    expect(db.select().from(views).where(eq(views.boardId, klanten.id)).all().map((v) => v.type).sort()).toEqual(["kanban", "table"]);
    const k1 = db.select().from(items).where(and(eq(items.boardId, klanten.id), eq(items.name, "Klant 1"))).get()!;
    const col = (key: string) => cols.find((c) => c.key === key && c.scope === "item")!.id;
    const admin = db.select().from(users).where(eq(users.email, "admin@example.com")).get()!;
    expect(k1.values[col("people")]).toEqual({ personsAndTeams: [{ id: admin.id, kind: "person" }] });
    expect(k1.values[col("numbers")]).toBe(91);
    expect(k1.values[col("date4")]).toEqual({ date: "2026-03-01" });
    expect(k1.values[col("checkbox")]).toEqual({ checked: true });
    expect(k1.createdAt).toBe("2026-01-01T10:00:00Z");
    // relation resolved to the clone item of "Fase 1"
    const fase = db.select().from(items).where(eq(items.name, "Fase 1")).get()!;
    expect(k1.values[col("board_relation_a")]).toEqual({ linkedPulseIds: [{ linkedPulseId: fase.id }] });
    const faseBoard = db.select().from(boards).where(eq(boards.id, fase.boardId)).get()!;
    expect(faseBoard.visibility).toBe("private");
    const relCol = cols.find((c) => c.key === "board_relation_a")!;
    expect(relCol.settings.boardIds).toEqual([faseBoard.id]);
    const mirror = cols.find((c) => c.key === "mirror_a")!;
    expect(mirror.settings).toMatchObject({ relationColumnId: relCol.id, aggregate: "sum" });
    expect(cols.find((c) => c.key === "calc")!.settings.formula).toBe("{Uurtarief}*2");
    // subitems
    const subs = db.select().from(items).where(eq(items.parentItemId, k1.id)).all();
    expect(subs.map((s) => s.name).sort()).toEqual(["Sub 1", "Sub 2"]);
    // updates: sanitized, reply threaded, orphan skipped
    const ups = db.select().from(updates).all();
    expect(ups).toHaveLength(2);
    expect(ups.find((u) => u.body.includes("script"))).toBeUndefined();
    expect(ups.find((u) => u.parentUpdateId)?.bodyText).toBe("Antwoord");
    // asset metadata + linked to item
    const a = db.select().from(assets).all();
    expect(a).toHaveLength(1);
    expect(a[0].itemId).toBe(k1.id);
    // users: adopted by email (Admin), new ones created, guest mapped
    expect(db.select().from(users).where(eq(users.email, "nieuw@example.test")).get()?.role).toBe("member");
    expect(db.select().from(users).where(eq(users.email, "gast@example.test")).get()?.role).toBe("guest");
    expect(db.select().from(teamMembers).all().length).toBeGreaterThan(0);
    // workspaces: Delivery adopted (not duplicated), main workspace created
    expect(db.select().from(workspaces).where(eq(workspaces.name, "Delivery")).all()).toHaveLength(1);
    expect(db.select().from(workspaces).where(eq(workspaces.name, "Main workspace")).all()).toHaveLength(1);
  });

  it("is idempotent: a second apply changes nothing; changed source data is updated, not duplicated", async () => {
    await importer.runImport(ctx.admin, { apply: true, downloadFiles: false }, { client: client() });
    const first = sizes();
    const rep2 = await importer.runImport(ctx.admin, { apply: true, downloadFiles: false }, { client: client() });
    expect(sizes()).toEqual(first);
    for (const [type, c] of Object.entries(rep2.counts)) expect({ type, create: c.create, update: c.update }).toEqual({ type, create: 0, update: 0 });
    // modify the source and re-run through a snapshot
    const snap = await fetchSnapshot(client());
    const b = snap.boards.find((x) => x.id === "5001")!;
    b.items[0].name = "Klant 1 hernoemd";
    b.items[0].column_values = b.items[0].column_values.map((c) => (c.id === "numbers" ? { ...c, value: '"500"' } : c));
    const rep3 = await importer.runImport(ctx.admin, { apply: true, downloadFiles: false }, { snapshot: snap });
    expect(rep3.counts.item).toMatchObject({ create: 0, update: 1 });
    expect(sizes().items).toBe(first.items);
    const it = db.select().from(items).where(eq(items.name, "Klant 1 hernoemd")).get()!;
    const numCol = db.select().from(columns).where(and(eq(columns.boardId, it.boardId), eq(columns.key, "numbers"))).get()!;
    expect(it.values[numCol.id]).toBe(500);
  });

  it("downloads asset files into the files dir (same layout as the assets service)", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "mon-files-"));
    process.env.FILES_DIR = dir;
    try {
      const rep = await importer.runImport(ctx.admin, { apply: true, downloadFiles: true }, { client: client() });
      expect(rep.files).toMatchObject({ downloaded: 1, failed: 0 });
      const a = db.select().from(assets).all()[0];
      expect(a.path).toBe(`${a.id}-contract.pdf`);
      expect(existsSync(path.join(dir, a.path))).toBe(true);
      expect(a.size).toBe(FILE_BYTES.byteLength);
    } finally { delete process.env.FILES_DIR; rmSync(dir, { recursive: true, force: true }); }
  });

  it("imports docs as Tiptap WorkDocs, idempotently", async () => {
    const rep = await importer.runImport(ctx.admin, { apply: true, downloadFiles: false }, { client: client() });
    expect(rep.counts.doc).toMatchObject({ create: 1 });
    const d = db.select().from(docs).all().find((x) => x.title === "Verslag")!;
    expect(d.blocks.content?.[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    const rep2 = await importer.runImport(ctx.admin, { apply: true, downloadFiles: false }, { client: client() });
    expect(rep2.counts.doc).toMatchObject({ create: 0, update: 0, skip: 1 });
    expect(db.select().from(docs).all().filter((x) => x.title === "Verslag")).toHaveLength(1);
  });

  it("converts monday doc blocks (titles, lists, marks, links)", () => {
    const j = (o: unknown) => JSON.stringify(o);
    const doc = mondayBlocksToTiptap([
      { id: "1", type: "large_title", content: j({ deltaFormat: [{ insert: "Kop" }] }), position: 1, parent_block_id: null },
      { id: "2", type: "bulleted_list", content: j({ deltaFormat: [{ insert: "een", attributes: { bold: true } }] }), position: 2, parent_block_id: null },
      { id: "3", type: "bulleted_list", content: j({ deltaFormat: [{ insert: "twee", attributes: { link: "https://x.test" } }] }), position: 3, parent_block_id: null },
      { id: "4", type: "check_list", content: j({ deltaFormat: [{ insert: "taak" }], checked: true }), position: 4, parent_block_id: null },
    ]);
    expect(doc.content.map((n) => n.type)).toEqual(["heading", "bulletList", "paragraph"]);
    expect(doc.content[1].content).toHaveLength(2);
    expect(doc.content[1].content![0].content![0].content![0].marks).toEqual([{ type: "bold" }]);
    expect(doc.content[2].content![0].text).toBe("☑ ");
  });

  it("workspace filter limits the import", async () => {
    const rep = await importer.runImport(ctx.admin, { apply: false, workspaces: ["100"] }, { client: client() });
    expect(rep.counts.board.create + rep.counts.board.update).toBe(2);
    expect(rep.skipped.customObjects).toBeUndefined();
  });

  it("job history records dry runs and failures, admin only", async () => {
    const job = await importer.runImportJob(ctx.admin, { apply: false }, { client: client() });
    expect(job.status).toBe("done");
    expect((job.counts as { board: unknown }).board).toBeTruthy();
    const bad = await importer.runImportJob(ctx.admin, { apply: false }, { client: new MondayClient({ apiKey: "k", apiUrl: "http://127.0.0.1:9/v2", fetch: async () => { throw new Error("boom"); }, sleep: async () => {}, maxRetries: 1 }) });
    expect(bad.status).toBe("failed");
    expect(importer.listJobs(ctx.admin).length).toBe(2);
    await expect(importer.runImport(ctx.member, { apply: false }, { client: client() })).rejects.toThrow();
    expect(() => importer.listJobs(ctx.member)).toThrow();
  });
});
