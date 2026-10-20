import { account } from "@/server/services";

/** Public account logo for crawlers (og:image) and the favicon. No auth: the logo is not secret. */
export function GET() {
  const img = account.publicLogo();
  if (!img) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mime, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
  });
}
