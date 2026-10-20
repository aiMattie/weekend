/**
 * Thin LLM layer over `@anthropic-ai/sdk` (module ai). Everything else in the app talks to the
 * `LlmClient` interface, so tests inject a mock and the app never needs the network.
 *
 * Configuration (env, never logged): ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL (company proxy), AI_MODEL.
 * No key = `getLlm()` returns null and every AI feature shows "AI niet geconfigureerd".
 */
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { z } from "zod";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export interface LlmTool { name: string; description: string; input_schema: Record<string, unknown> }
export type LlmMessage = Anthropic.MessageParam;
export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools?: LlmTool[];
  maxTokens?: number;
  model?: string;
}
export interface LlmToolUse { id: string; name: string; input: Record<string, unknown> }
export interface LlmResult {
  /** raw content blocks (stored and replayed verbatim in a tool loop) */
  content: unknown[];
  text: string;
  toolUses: LlmToolUse[];
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  model: string;
}
export interface LlmCallOptions { onText?: (delta: string) => void; signal?: AbortSignal }
export interface LlmClient { complete(req: LlmRequest, opts?: LlmCallOptions): Promise<LlmResult> }

/* ------------------------------------------------------------ configuration */

interface Override { apiKey?: string; baseUrl?: string; disabled?: boolean }
const g = globalThis as unknown as { __aiLlm?: LlmClient | null; __aiOverride?: Override | null; __aiReal?: { sig: string; client: LlmClient } };

/** Tests: inject a client (null removes it). */
export function setLlmClient(c: LlmClient | null): void { g.__aiLlm = c; }
/** e2e only (E2E_RESET=1, see /api/v1/ai/e2e-config): point the server at a local mock provider at runtime. */
export function setRuntimeOverride(o: Override | null): void { g.__aiOverride = o; g.__aiReal = undefined; }

export interface AiProviderInfo { configured: boolean; baseUrl: string | null; defaultModel: string; source: "injected" | "override" | "env" | "none" }

export function providerInfo(): AiProviderInfo {
  const model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
  const o = g.__aiOverride;
  if (g.__aiLlm) return { configured: true, baseUrl: null, defaultModel: model, source: "injected" };
  if (o?.disabled) return { configured: false, baseUrl: null, defaultModel: model, source: "none" };
  if (o?.apiKey) return { configured: true, baseUrl: o.baseUrl ?? null, defaultModel: model, source: "override" };
  if (process.env.VITEST) return { configured: false, baseUrl: null, defaultModel: model, source: "none" };
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return { configured: !!key, baseUrl: key ? process.env.ANTHROPIC_BASE_URL?.trim() || null : null, defaultModel: model, source: key ? "env" : "none" };
}

export function getLlm(): LlmClient | null {
  if (g.__aiLlm) return g.__aiLlm;
  const info = providerInfo();
  if (!info.configured) return null;
  const o = g.__aiOverride;
  const apiKey = o?.apiKey ?? process.env.ANTHROPIC_API_KEY!.trim();
  const baseURL = o?.apiKey ? o.baseUrl : process.env.ANTHROPIC_BASE_URL?.trim() || undefined;
  const sig = createHash("sha256").update(`${apiKey}|${baseURL ?? ""}`).digest("hex");
  if (g.__aiReal?.sig !== sig) g.__aiReal = { sig, client: new AnthropicLlm(new Anthropic({ apiKey, baseURL, maxRetries: 1, timeout: 120_000 })) };
  return g.__aiReal.client;
}

/* ------------------------------------------------------------ real client */

class AnthropicLlm implements LlmClient {
  constructor(private readonly sdk: Anthropic) {}

  async complete(req: LlmRequest, opts: LlmCallOptions = {}): Promise<LlmResult> {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: req.model || process.env.AI_MODEL?.trim() || DEFAULT_MODEL,
      max_tokens: req.maxTokens ?? 4096,
      system: req.system,
      messages: req.messages,
      ...(req.tools?.length ? { tools: req.tools as Anthropic.Tool[] } : {}),
    };
    let msg: Anthropic.Message;
    if (opts.onText) {
      const stream = this.sdk.messages.stream(params, { signal: opts.signal });
      stream.on("text", (d) => opts.onText?.(d));
      msg = await stream.finalMessage();
    } else {
      msg = await this.sdk.messages.create(params, { signal: opts.signal });
    }
    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }));
    return { content: msg.content, text, toolUses, stopReason: msg.stop_reason ?? null, inputTokens: msg.usage?.input_tokens ?? 0, outputTokens: msg.usage?.output_tokens ?? 0, model: msg.model };
  }
}

/* ------------------------------------------------------------ JSON helper */

/** First JSON object/array in a model answer (handles ```json fences and prose around it). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error("no JSON in the answer");
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return JSON.parse(body.slice(start, i + 1));
  }
  throw new Error("unterminated JSON in the answer");
}

export type JsonCall = (req: LlmRequest) => Promise<LlmResult>;

/**
 * Ask for JSON and validate it against a zod schema. One repair round: the validation error goes back
 * to the model. `call` is the metered wrapper (credits are recorded per round).
 */
export async function completeJson<S extends z.ZodType>(call: JsonCall, schema: S, req: LlmRequest): Promise<{ value: z.output<S>; rounds: number }> {
  let messages = req.messages;
  let lastError = "";
  for (let round = 1; round <= 2; round++) {
    const r = await call({ ...req, messages });
    try {
      const parsed = schema.safeParse(extractJson(r.text));
      if (parsed.success) return { value: parsed.data, rounds: round };
      lastError = parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ");
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    messages = [...req.messages, { role: "assistant", content: r.text || "{}" }, { role: "user", content: `Dat antwoord was ongeldig (${lastError}). Antwoord alleen met geldige JSON volgens het gevraagde schema.` }];
  }
  throw new Error(`Model gaf geen geldige JSON: ${lastError}`);
}
