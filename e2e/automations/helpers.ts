import { createServer, type IncomingMessage, type Server } from "node:http";
import net from "node:net";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "./fixtures";

export interface TestBoard {
  boardId: string;
  groups: Record<string, string>;
  columns: Record<string, { id: string; settings: Record<string, unknown> }>;
  itemId: string;
}

/** Board with groups Todo + Afgerond, default Owner/Status/Date columns and one item "Taak 1". */
export async function createTestBoard(request: APIRequestContext, workspaceId: string, name = "Auto test"): Promise<TestBoard> {
  const b = await (await request.post("/api/v1/boards", { data: { workspaceId, name } })).json();
  const groupsList = (await (await request.get(`/api/v1/boards/${b.id}/groups`)).json()) as { id: string; title: string }[];
  const todo = groupsList[0];
  await request.patch(`/api/v1/groups/${todo.id}`, { data: { title: "Todo" } });
  const done = await (await request.post(`/api/v1/boards/${b.id}/groups`, { data: { title: "Afgerond" } })).json();
  const cols = (await (await request.get(`/api/v1/boards/${b.id}/columns`)).json()) as { id: string; key: string; settings: Record<string, unknown> }[];
  const columns = Object.fromEntries(cols.map((c) => [c.key, { id: c.id, settings: c.settings }]));
  const item = await (await request.post("/api/v1/items", { data: { boardId: b.id, groupId: todo.id, name: "Taak 1" } })).json();
  return { boardId: b.id, groups: { Todo: todo.id, Afgerond: done.id }, columns, itemId: item.id };
}

export async function setStatus(request: APIRequestContext, itemId: string, columnId: string, label: string): Promise<void> {
  const r = await request.put(`/api/v1/items/${itemId}/values/${columnId}`, { data: { value: label } });
  expect(r.ok()).toBeTruthy();
}

export async function getItem(request: APIRequestContext, itemId: string): Promise<{ id: string; name: string; groupId: string; values: Record<string, unknown> }> {
  return (await request.get(`/api/v1/items/${itemId}`)).json();
}

export async function openCenter(page: Page, boardId: string): Promise<void> {
  await page.goto(`/boards/${boardId}`);
  await expect(page.getByTestId("board-page")).toBeVisible();
  await page.getByTestId("automate-button").click();
  await expect(page.getByTestId("automation-center")).toBeVisible();
}

export async function tick(request: APIRequestContext, now?: string): Promise<{ fired: number; retried: number; deliveries: number }> {
  const r = await request.post("/api/test/automations/tick", { data: now ? { now } : {} });
  expect(r.ok()).toBeTruthy();
  return r.json();
}

/** Local receiver for outgoing webhooks. */
export async function startReceiver(): Promise<{ url: string; requests: { headers: IncomingMessage["headers"]; body: string }[]; close: () => Promise<void> }> {
  const requests: { headers: IncomingMessage["headers"]; body: string }[] = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => { requests.push({ headers: req.headers, body }); res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}'); });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;
  return { url: `http://127.0.0.1:${port}/hook`, requests, close: () => new Promise((r) => server.close(() => r())) };
}

/** Tiny SMTP sink = the "mail catcher" mock. */
export async function startMailCatcher(): Promise<{ port: number; mails: string[]; close: () => Promise<void> }> {
  const mails: string[] = [];
  const server = net.createServer((sock) => {
    sock.write("220 catcher ESMTP\r\n");
    let data = false;
    let buf = "";
    sock.on("data", (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (data) { if (line === ".") { data = false; sock.write("250 queued\r\n"); } else mails[mails.length - 1] += line + "\n"; continue; }
        if (/^EHLO/i.test(line)) sock.write("250 catcher\r\n");
        else if (/^MAIL/i.test(line)) { mails.push(`${line}\n`); sock.write("250 ok\r\n"); }
        else if (/^RCPT/i.test(line)) { mails[mails.length - 1] += `${line}\n`; sock.write("250 ok\r\n"); }
        else if (/^DATA/i.test(line)) { data = true; sock.write("354 go\r\n"); }
        else if (/^QUIT/i.test(line)) { sock.write("221 bye\r\n"); sock.end(); }
        else sock.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { port: (server.address() as net.AddressInfo).port, mails, close: () => new Promise((r) => server.close(() => r())) };
}

/** Manage > Run log (the log lives under the Manage tab of the Automation Center). */
export async function openLog(page: Page): Promise<void> {
  await page.getByTestId("auto-tab-manage").click();
  await page.getByTestId("auto-tab-log").click();
}
