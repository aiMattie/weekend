/** request_change / list_change_requests: change requests for this app on the dev tasks board (or CHANGE_REQUEST_BOARD_ID). */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { platformCtx, type PCtx } from "../platform/helpers";
import { mcpClient } from "../platform/mcp-helpers";
import { devSetup } from "../dev/helpers";
import * as services from "../../src/server/services";

/* eslint-disable @typescript-eslint/no-explicit-any */
let c: PCtx;
let m: Awaited<ReturnType<typeof mcpClient>>;
const call = async (name: string, args: Record<string, unknown> = {}): Promise<any> => {
  const r = await m.call(name, args);
  expect(r.isError, `${name}: ${r.text}`).toBe(false);
  return r.json;
};

beforeEach(async () => {
  c = await platformCtx();
  m = await mcpClient(c.member);
});
afterEach(async () => {
  delete process.env.CHANGE_REQUEST_BOARD_ID;
  await m.close();
});

describe("request_change", () => {
  it("fails clearly when no change request board exists", async () => {
    const r = await m.call("request_change", { title: "Dark mode", description: "please" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("CHANGE_REQUEST_BOARD_ID");
  });

  it("files a request on the dev tasks board with type, priority, Backlog status and the description as update", async () => {
    const { t } = devSetup(c);
    process.env.APP_URL = "https://weekend.example.com";
    const r = await call("request_change", { title: "Export to PDF", description: "Line one\n\nSteps: <b>x</b>", type: "bug", priority: "high" });
    expect(r).toMatchObject({ board_id: t.boards.taken, name: "Export to PDF", status: "Backlog", type: "bug", priority: "high" });
    expect(r.url).toBe(`https://weekend.example.com/boards/${t.boards.taken}?item=${r.item_id}`);
    delete process.env.APP_URL;

    const item = await call("get_item", { item_id: r.item_id });
    expect(item.column_values.status.text).toBe("Backlog");
    expect(item.column_values.type.text).toBe("Bug");
    expect(item.column_values.prioriteit.text).toBe("P2");
    const ups = services.updates.list(c.member, r.item_id);
    expect(ups).toHaveLength(1);
    expect(ups[0].bodyText).toContain("Steps: <b>x</b>"); // escaped, not rendered as HTML
    expect(ups[0].body).not.toContain("<b>");
  });

  it("lists requests, filters by status and type, and hides Done by default", async () => {
    const { t, mkTask } = devSetup(c);
    const a = await call("request_change", { title: "Feature A", description: "a" });
    const b = await call("request_change", { title: "Bug B", description: "b", type: "bug" });
    services.items.changeMultipleColumnValues(c.sys, b.item_id, { status: { label: "Ready" } });
    mkTask("Old work", 1, "Done");

    const all = await call("list_change_requests");
    expect(all.board_id).toBe(t.boards.taken);
    expect(all.ready_status).toBe("Ready");
    expect(all.statuses).toContain("Ready");
    expect(all.requests.map((x: any) => x.name)).toEqual(expect.arrayContaining(["Feature A", "Bug B"]));
    expect(all.requests.map((x: any) => x.name)).not.toContain("Old work");

    const ready = await call("list_change_requests", { status: "ready", include_description: true });
    expect(ready.requests).toHaveLength(1);
    expect(ready.requests[0]).toMatchObject({ item_id: b.item_id, status: "Ready", type: "Bug", priority: "P3" });
    expect(ready.requests[0].description).toContain("b");
    expect((await call("list_change_requests", { status: ["Backlog", "Done"] })).requests.map((x: any) => x.name).sort()).toEqual(["Feature A", "Old work"]);
    expect((await call("list_change_requests", { type: "feature" })).requests.map((x: any) => x.item_id)).toEqual([a.item_id]);
  });

  it("uses CHANGE_REQUEST_BOARD_ID and copes with boards without type/priority columns", async () => {
    devSetup(c);
    process.env.CHANGE_REQUEST_BOARD_ID = c.boardId;
    const r = await call("request_change", { title: "On the test board", description: "x", type: "chore" });
    expect(r.board_id).toBe(c.boardId);
    expect(r.status).toBeNull(); // default board status labels have no "Backlog"
    expect((await call("list_change_requests")).requests.map((x: any) => x.item_id)).toContain(r.item_id);
  });

  it("is a write tool: read-only tokens are refused", async () => {
    devSetup(c);
    const ro = await mcpClient(c.member, { scopes: ["read"] });
    expect((await ro.call("request_change", { title: "Nope", description: "x" })).isError).toBe(true);
    expect((await ro.call("list_change_requests")).isError).toBe(false);
    await ro.close();
  });
});
