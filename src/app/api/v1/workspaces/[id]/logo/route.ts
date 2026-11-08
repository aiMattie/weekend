import { readFileSync } from "node:fs";
import { ValidationError } from "@/lib/errors";
import { api } from "@/server/http";
import { workspaces } from "@/server/services";

type P = { id: string };

/** The workspace logo (raster image only, see workspaces.LOGO_TYPES). */
export const GET = api<P>(({ actor, params }) => {
  const { absPath, mimeType } = workspaces.readLogo(actor, params.id);
  return new Response(new Uint8Array(readFileSync(absPath)), {
    headers: { "Content-Type": mimeType, "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=31536000, immutable" },
  });
});

/** Upload a logo: multipart/form-data with `file` (PNG, JPG, WebP or GIF, max 1 MB). Replaces the current logo. */
export const POST = api<P>(async ({ actor, params, req }) => {
  const form = await req.formData().catch(() => { throw new ValidationError("Expected multipart/form-data"); });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ValidationError("Field `file` is required");
  const ws = workspaces.setLogo(actor, params.id, new Uint8Array(await file.arrayBuffer()));
  return { ...ws, logoUrl: workspaces.logoUrl(ws) };
});

export const DELETE = api<P>(({ actor, params }) => {
  const ws = workspaces.removeLogo(actor, params.id);
  return { ...ws, logoUrl: workspaces.logoUrl(ws) };
});
