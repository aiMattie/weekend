import { NextResponse } from "next/server";
import { resetAndSeed } from "@/db/reset";

/** E2E only: wipes all data and re-seeds (~1s). Enabled with E2E_RESET=1 (set by playwright.config.ts). */
export async function POST() {
  if (process.env.E2E_RESET !== "1") return NextResponse.json({ error: "disabled" }, { status: 404 });
  const r = await resetAndSeed();
  return NextResponse.json({ ok: true, userIds: r.userIds, workspaceIds: r.workspaceIds });
}
