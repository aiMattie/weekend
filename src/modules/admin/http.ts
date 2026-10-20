/** Small helpers for the admin REST routes. */
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionClaims } from "@/lib/auth/session";
import { ValidationError } from "@/lib/errors";
import { clientIp } from "./lib/ip";

export const originOf = (req: NextRequest): string => req.nextUrl.origin;
export const ipOf = (req: NextRequest): string => clientIp(req.headers);
export async function sidOf(req: NextRequest): Promise<string | null> {
  return (await verifySessionClaims(req.cookies.get(SESSION_COOKIE)?.value))?.sid ?? null;
}

/** Read one uploaded file ("file" field) from a multipart request. */
export async function fileOf(req: NextRequest): Promise<Buffer> {
  const form = await req.formData().catch(() => null);
  const f = form?.get("file");
  if (!f || typeof f === "string") throw new ValidationError("Upload a file in the 'file' field");
  return Buffer.from(await f.arrayBuffer());
}

export const imageResponse = (img: { data: Buffer; mime: string } | null): Response =>
  img
    ? new Response(new Uint8Array(img.data), { headers: { "Content-Type": img.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } })
    : new Response(null, { status: 404 });
