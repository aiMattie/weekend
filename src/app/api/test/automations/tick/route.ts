import { NextResponse } from "next/server";
import { drain } from "@/server/automations/engine";
import { tick } from "@/server/automations/scheduler";
import { bootAutomations } from "@/server/automations/boot";

/** E2E only (E2E_RESET=1): run one scheduler pass at an injected clock. Body: { now?: ISO string }. */
export async function POST(req: Request) {
  if (process.env.E2E_RESET !== "1") return NextResponse.json({ error: "disabled" }, { status: 404 });
  bootAutomations();
  const body = (await req.json().catch(() => ({}))) as { now?: string };
  await drain();
  const result = await tick(body.now ? new Date(body.now) : new Date());
  return NextResponse.json(result);
}
