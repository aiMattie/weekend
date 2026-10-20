import { readFileSync } from "node:fs";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { imagePath } from "@/modules/help/content";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };

/** Serves docs/handleiding/img/<name> to logged-in users (no external CDN, no copy into public/). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  if (!(await getCurrentUser())) return new NextResponse("Not authenticated", { status: 401 });
  const { name } = await ctx.params;
  const file = imagePath(name);
  if (!file) return new NextResponse("Not found", { status: 404 });
  const ext = name.split(".").pop()!.toLowerCase();
  return new NextResponse(new Uint8Array(readFileSync(/*turbopackIgnore: true*/ file)), { headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "private, max-age=60" } });
}
