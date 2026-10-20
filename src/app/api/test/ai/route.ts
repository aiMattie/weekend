import { NextResponse } from "next/server";
import { setRuntimeOverride } from "@/server/ai/llm";

/**
 * E2E only (E2E_RESET=1): point the AI layer at a local mock provider at runtime, or switch it off.
 * POST { baseUrl, apiKey } | { disabled: true } | { reset: true }. The real key from the environment is never read or returned.
 */
export async function POST(req: Request) {
  if (process.env.E2E_RESET !== "1") return NextResponse.json({ error: "disabled" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { baseUrl?: string; apiKey?: string; disabled?: boolean; reset?: boolean };
  if (b.reset) setRuntimeOverride(null);
  else if (b.disabled) setRuntimeOverride({ disabled: true });
  else if (b.baseUrl) setRuntimeOverride({ baseUrl: b.baseUrl, apiKey: b.apiKey ?? "mock-key" });
  else return NextResponse.json({ error: "baseUrl, disabled or reset required" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
