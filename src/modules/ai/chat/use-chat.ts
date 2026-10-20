"use client";

/** Sidekick chat state: SSE stream from POST /api/v1/ai/chat, history, confirmation cards. */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";

export interface AiStatus {
  configured: boolean; enabled: boolean; agentsEnabled: boolean; model: string; baseUrl: string | null;
  credits: { userUsed: number; userLimit: number | null; accountUsed: number; accountLimit: number | null };
}
export interface ChatContext { kind: "board" | "item" | "doc"; id: string }
export interface UiMessage { id: string; role: "user" | "assistant" | "note"; text: string; streaming?: boolean; createdAt?: string }
export interface UiAction { id: string; toolName: string; summary: string; preview: unknown; status: "pending" | "confirmed" | "rejected" | "failed"; result: unknown; error: string | null; createdAt?: string }
export interface ToolNote { name: string; status: "running" | "done" | "error"; detail?: string }
export interface ConversationRow { id: string; title: string; updatedAt: string }

let seq = 0;
const uid = () => `c${Date.now()}-${++seq}`;

/** Parse an SSE byte stream into (event, data) pairs. */
async function readSse(res: Response, onEvent: (type: string, data: Record<string, unknown>) => void): Promise<void> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const type = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (type && data) { try { onEvent(type, JSON.parse(data)); } catch { /* ignore a broken frame */ } }
    }
  }
}

export function useChat(context: ChatContext | null) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [actions, setActions] = useState<UiAction[]>([]);
  const [tools, setTools] = useState<ToolNote[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convRef = useRef<string | null>(null);

  const refreshStatus = useCallback(() => { api.get<AiStatus>("/api/v1/ai/status").then(setStatus).catch(() => undefined); }, []);
  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  const newChat = useCallback(() => { convRef.current = null; setConversationId(null); setMessages([]); setActions([]); setTools([]); setError(null); }, []);

  const load = useCallback(async (id: string) => {
    const r = await api.get<{ conversation: { id: string }; messages: UiMessage[]; actions: UiAction[] }>(`/api/v1/ai/conversations/${id}`);
    convRef.current = id; setConversationId(id); setMessages(r.messages); setActions(r.actions); setTools([]); setError(null);
  }, []);

  const send = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    setError(null); setBusy(true); setTools([]);
    const assistantId = uid();
    setMessages((m) => [...m, { id: uid(), role: "user", text: msg }, { id: assistantId, role: "assistant", text: "", streaming: true }]);
    try {
      const res = await fetch("/api/v1/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ message: msg, conversationId: convRef.current ?? undefined, context: context ?? undefined }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        setError(j?.error?.message ?? res.statusText);
        setMessages((m) => m.filter((x) => x.id !== assistantId));
        refreshStatus();
        return;
      }
      let sawText = false;
      let breakNext = false; // after a tool step the next text starts a new paragraph
      await readSse(res, (type, d) => {
        if (type === "conversation") { convRef.current = d.id as string; setConversationId(d.id as string); }
        else if (type === "text") { const br = breakNext; breakNext = false; sawText = true; setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, text: x.text + (br && x.text ? "\n\n" : "") + (d.delta as string) } : x))); }
        else if (type === "tool") { breakNext = true; setTools((t) => { const n = d as unknown as ToolNote; const i = t.findIndex((x) => x.name === n.name && x.status === "running"); return i >= 0 && n.status !== "running" ? t.map((x, j) => (j === i ? n : x)) : [...t, n]; }); }
        else if (type === "pending") setActions((a) => [...a, d.action as UiAction]);
        else if (type === "error") setError(d.message as string);
        else if (type === "done") setMessages((m) => (sawText ? m.map((x) => (x.id === assistantId ? { ...x, streaming: false } : x)) : m.filter((x) => x.id !== assistantId || x.text)));
      });
    } catch {
      setError("Verbinding verbroken");
    } finally {
      setMessages((m) => m.map((x) => (x.streaming ? { ...x, streaming: false } : x)).filter((x) => x.role !== "assistant" || x.text));
      setBusy(false);
      refreshStatus();
    }
  }, [busy, context, refreshStatus]);

  const decide = useCallback(async (id: string, ok: boolean) => {
    try {
      const r = await api.post<{ action?: UiAction; status?: string }>(`/api/v1/ai/actions/${id}/${ok ? "confirm" : "reject"}`);
      const row = ok ? (r.action as UiAction) : (r as unknown as UiAction);
      setActions((a) => a.map((x) => (x.id === id ? { ...x, ...row, ...(ok ? { result: (r as { result?: unknown }).result } : {}) } : x)));
      setMessages((m) => [...m, { id: uid(), role: "note", text: ok ? `Uitgevoerd: ${row.summary}` : `Geweigerd: ${row.summary}` }]);
      refreshStatus();
    } catch (e) {
      setActions((a) => a.map((x) => (x.id === id ? { ...x, status: "failed", error: e instanceof Error ? e.message : "Mislukt" } : x)));
    }
  }, [refreshStatus]);

  return { status, conversationId, messages, actions, tools, busy, error, send, newChat, load, decide, refreshStatus };
}
