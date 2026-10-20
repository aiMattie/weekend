/**
 * Local mock of the Anthropic Messages API for the AI e2e specs (never the real API).
 * Implements POST /v1/messages, plain JSON and SSE streaming, with a small deterministic "brain":
 * it recognises the feature from the system prompt (Sidekick, Weekend magic, AI blocks, agents,
 * Notetaker) and answers like Claude would: tool calls first, then a final text.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
interface Reply { content: Block[]; stop: "end_turn" | "tool_use" }

const text = (t: string): Reply => ({ content: [{ type: "text", text: t }], stop: "end_turn" });
let n = 0;
const tool = (name: string, input: Record<string, unknown>, pre?: string): Reply => ({ content: [...(pre ? [{ type: "text" as const, text: pre }] : []), { type: "tool_use", id: `toolu_mock_${++n}`, name, input }], stop: "tool_use" });

const flat = (c: unknown): string => (typeof c === "string" ? c : Array.isArray(c) ? c.map((b) => (b?.type === "text" ? b.text : b?.type === "tool_result" ? flat(b.content) : b?.type === "tool_use" ? JSON.stringify(b.input) : "")).join("\n") : "");
const lastUser = (msgs: any[]): string => flat([...msgs].reverse().find((m) => m.role === "user" && !(Array.isArray(m.content) && m.content.some((b: any) => b.type === "tool_result")))?.content);
const lastToolResult = (msgs: any[]): string | null => { const l = msgs[msgs.length - 1]; return l?.role === "user" && Array.isArray(l.content) && l.content[0]?.type === "tool_result" ? flat(l.content) : null; };

function sidekick(system: string, msgs: any[]): Reply {
  const ask = lastUser(msgs);
  const result = lastToolResult(msgs);
  const boardId = /board "[^"]*" \(id (\d+)\)/.exec(system)?.[1];
  if (result !== null) {
    if (/VOORGESTELD|Voorgesteld aan de gebruiker/i.test(result)) return text("Ik heb het voorgesteld. Bevestig de kaart hieronder om het uit te voeren.");
    const j = /<tool_data[^>]*>\n([\s\S]*?)\n<\/tool_data>/.exec(result)?.[1];
    if (j) { try { const d = JSON.parse(j); if (d.items) return text(`Het board "${d.board.name}" heeft ${d.itemCount} items: ${d.items.map((i: any) => i.name).join(", ")}.`); } catch { /* fall through */ } }
    if (/Niet toegestaan/i.test(result)) return text("Dat mag je niet doen met jouw rechten.");
    return text("Klaar.");
  }
  const create = /maak (?:een )?item (.+)/i.exec(ask);
  if (create && boardId) return tool("create_item", { boardId, name: create[1].trim() }, "Ik stel dat voor.");
  if (/board|samenvat|wat staat/i.test(ask) && boardId) return tool("get_board", { boardId }, "Ik kijk even naar het board.");
  return text("Hallo! Ik ben Sidekick (mock). Waarmee kan ik helpen?");
}

function magic(msgs: any[]): Reply {
  const desc = lastUser(msgs);
  const name = /recruit/i.test(desc) ? "Recruitment pipeline" : "Nieuw proces";
  return text("```json\n" + JSON.stringify({
    name, description: "Gegenereerd door de mock",
    columns: [{ title: "Fase", type: "status", labels: ["Nieuw", "Gesprek", "Aangenomen"] }, { title: "Recruiter", type: "people" }, { title: "Startdatum", type: "date" }],
    groups: [{ title: "Open", items: [{ name: "Anna de Vries", values: { Fase: "Gesprek", Startdatum: "2026-11-01" } }, { name: "Bram Jansen", values: { Fase: "Nieuw" } }] }, { title: "Afgerond", items: [{ name: "Carla Smit", values: { Fase: "Aangenomen" } }] }],
  }) + "\n```");
}

function block(msgs: any[]): Reply {
  const p = lastUser(msgs);
  const opts = /uit: (\[[^\]]*\])/.exec(p)?.[1];
  const body = /<invoer>\n([\s\S]*?)\n<\/invoer>/.exec(p)?.[1] ?? "";
  if (p.includes('"category"') && opts) { const list = JSON.parse(opts) as string[]; const pick = /crash|fout|bug|kapot/i.test(body) ? list.find((x) => /bug/i.test(x)) : undefined; return text(JSON.stringify({ category: pick ?? list[0] })); }
  if (p.includes('"sentiment"')) return text(JSON.stringify({ sentiment: opts ? (JSON.parse(opts) as string[])[0] : "neutraal" }));
  if (p.includes('"summary"')) return text(JSON.stringify({ summary: `Samenvatting (mock): ${body.slice(0, 60)}` }));
  if (p.includes('"translation"')) return text(JSON.stringify({ translation: `[EN] ${body.slice(0, 80)}` }));
  return text(JSON.stringify({ value: null }));
}

function agent(msgs: any[]): Reply {
  const first = flat(msgs[0]?.content);
  const result = lastToolResult(msgs);
  if (result !== null) return text(/Niet toegestaan|is_error/i.test(result) ? "De actie werd geweigerd door mijn rechten." : "Klaar: ik heb het board bekeken en de update geplaatst.");
  const item = /item (\d+)/.exec(first)?.[1];
  const board = /board (\d+)/.exec(first)?.[1];
  if (item) return tool("create_update", { itemId: item, text: "Score: 80/100 (mock-agent)" }, "Ik plaats een update.");
  if (board) return tool("get_board", { boardId: board }, "Ik lees het board.");
  return text("Er was niets te doen.");
}

function notetaker(msgs: any[]): Reply {
  const t = /<transcript>\n([\s\S]*?)\n<\/transcript>/.exec(lastUser(msgs))?.[1] ?? "";
  const lines = t.split("\n").map((l) => l.trim());
  return text(JSON.stringify({
    summary: "Mock-samenvatting van het gesprek over de migratie.",
    decisions: lines.filter((l) => /^besluit:/i.test(l)).map((l) => l.replace(/^besluit:\s*/i, "")),
    actionItems: lines.filter((l) => /^actie:/i.test(l)).map((l) => { const m = /^actie:\s*(\w+)\s*-\s*(.+)$/i.exec(l); return m ? { text: m[2], assignee: m[1], due: null } : { text: l.replace(/^actie:\s*/i, ""), assignee: null, due: null }; }),
    attendees: [],
  }));
}

export function brain(body: any): Reply {
  const system = typeof body.system === "string" ? body.system : flat(body.system);
  const msgs = body.messages ?? [];
  if (system.includes("Je bent Sidekick")) return sidekick(system, msgs);
  if (system.includes('Je bent "Weekend magic"')) return magic(msgs);
  if (system.includes("AI-blok")) return block(msgs);
  if (system.includes("Je bent de AI-agent")) return agent(msgs);
  if (system.includes("Je bent de Notetaker")) return notetaker(msgs);
  return text("OK (mock)");
}

/* ------------------------------------------------------------ http + SSE */

const tokens = (b: any) => ({ input: Math.ceil(JSON.stringify(b.messages ?? []).length / 4) + 200, output: 60 });

function sse(res: import("node:http").ServerResponse, r: Reply, usage: { input: number; output: number }): void {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  const send = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...(data as object) })}\n\n`);
  send("message_start", { message: { id: `msg_mock_${++n}`, type: "message", role: "assistant", model: "mock", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: usage.input, output_tokens: 1 } } });
  r.content.forEach((b, index) => {
    if (b.type === "text") {
      send("content_block_start", { index, content_block: { type: "text", text: "" } });
      const mid = Math.ceil(b.text.length / 2);
      for (const part of [b.text.slice(0, mid), b.text.slice(mid)]) if (part) send("content_block_delta", { index, delta: { type: "text_delta", text: part } });
    } else {
      send("content_block_start", { index, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } });
      send("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
    }
    send("content_block_stop", { index });
  });
  send("message_delta", { delta: { stop_reason: r.stop, stop_sequence: null }, usage: { output_tokens: usage.output } });
  send("message_stop", {});
  res.end();
}

export interface MockAnthropic { url: string; requests: any[]; close(): Promise<void> }

export async function startMockAnthropic(): Promise<MockAnthropic> {
  const requests: any[] = [];
  const server: Server = createServer((req: IncomingMessage, res) => {
    if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "not found" } })); return; }
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      const body = JSON.parse(raw || "{}");
      requests.push(body);
      const r = brain(body);
      const u = tokens(body);
      if (body.stream) { sse(res, r, u); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: `msg_mock_${++n}`, type: "message", role: "assistant", model: "mock", content: r.content, stop_reason: r.stop, stop_sequence: null, usage: { input_tokens: u.input, output_tokens: u.output } }));
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as AddressInfo).port;
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise((ok) => server.close(() => ok())) };
}
