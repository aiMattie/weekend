/** Scripted LLM for tests: no network, deterministic answers, records every request. */
import type { LlmCallOptions, LlmClient, LlmRequest, LlmResult } from "../../src/server/ai/llm";

export type Part = { text: string } | { tool: string; input: Record<string, unknown> };
export const say = (text: string): Part => ({ text });
export const call = (tool: string, input: Record<string, unknown>): Part => ({ tool, input });

export type Step = Part[] | string | Error;

let counter = 0;

export class ScriptedLlm implements LlmClient {
  calls: LlmRequest[] = [];
  inputTokens = 1000;
  outputTokens = 200;
  steps: Step[] | ((req: LlmRequest, n: number) => Step);
  constructor(steps: Step[] | ((req: LlmRequest, n: number) => Step)) { this.steps = steps; }

  async complete(req: LlmRequest, opts: LlmCallOptions = {}): Promise<LlmResult> {
    const n = this.calls.length;
    this.calls.push(req);
    const step = typeof this.steps === "function" ? this.steps(req, n) : this.steps[Math.min(n, this.steps.length - 1)];
    if (step instanceof Error) throw step;
    const parts: Part[] = typeof step === "string" ? [{ text: step }] : step;
    const content = parts.map((p) => ("text" in p ? { type: "text", text: p.text } : { type: "tool_use", id: `toolu_${++counter}`, name: p.tool, input: p.input }));
    const text = parts.filter((p): p is { text: string } => "text" in p).map((p) => p.text).join("");
    if (opts.onText && text) opts.onText(text);
    const toolUses = content.filter((c) => c.type === "tool_use").map((c) => ({ id: (c as { id: string }).id, name: (c as { name: string }).name, input: (c as { input: Record<string, unknown> }).input }));
    return { content, text, toolUses, stopReason: toolUses.length ? "tool_use" : "end_turn", inputTokens: this.inputTokens, outputTokens: this.outputTokens, model: "mock-model" };
  }
}
