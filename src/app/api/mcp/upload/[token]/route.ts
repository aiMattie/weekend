import { assets } from "@/server/services";
import { verifyUploadToken } from "@/server/mcp/tools/platform-workspaces";
import { userToActorLite } from "@/server/platform/actor-lite";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Step 2 of the MCP asset upload: PUT the raw bytes to the URL from get_asset_upload_url. */
export async function PUT(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  let claims;
  try { claims = await verifyUploadToken(token); } catch { return Response.json({ error: "Upload token is invalid or expired" }, { status: 401 }); }
  const actor = userToActorLite(claims.userId);
  if (!actor) return Response.json({ error: "Unknown user" }, { status: 401 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  try {
    const asset = assets.upload(actor, { itemId: claims.itemId ?? undefined, updateId: claims.updateId ?? undefined, columnId: claims.columnId ?? undefined, name: claims.name, mimeType: req.headers.get("content-type") ?? claims.mime ?? undefined }, bytes);
    return Response.json({ asset_id: asset.id, name: asset.name, size: asset.size, url: asset.url }, { status: 201 });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return Response.json({ error: err.message ?? "Upload failed" }, { status: err.status ?? 500 });
  }
}
