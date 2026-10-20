import { NextResponse } from "next/server";

/** E2E only (E2E_RESET=1): point the SMTP transport at a local mail catcher mock. Body: { port: number | null }. */
export async function POST(req: Request) {
  if (process.env.E2E_RESET !== "1") return NextResponse.json({ error: "disabled" }, { status: 404 });
  const { port } = (await req.json().catch(() => ({}))) as { port?: number | null };
  if (port) { process.env.SMTP_HOST = "127.0.0.1"; process.env.SMTP_PORT = String(port); } else { delete process.env.SMTP_PORT; delete process.env.SMTP_HOST; }
  return NextResponse.json({ ok: true });
}
