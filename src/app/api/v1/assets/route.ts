import { ValidationError } from "@/lib/errors";
import { api } from "@/server/http";
import { assets } from "@/server/services";

/** List: GET ?itemId=|updateId=|boardId= (&columnId=). */
export const GET = api(({ actor, query }) => assets.list(actor, Object.fromEntries(query.entries())));

/** Upload ONE file: multipart/form-data with `file` and `itemId` | `updateId` | `boardId` (+ optional `columnId` of a file column). */
export const POST = api(async ({ actor, req }) => {
  const form = await req.formData().catch(() => { throw new ValidationError("Expected multipart/form-data"); });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ValidationError("Field `file` is required");
  const field = (k: string) => { const v = form.get(k); return typeof v === "string" && v ? v : undefined; };
  const dto = assets.upload(actor, { itemId: field("itemId"), updateId: field("updateId"), boardId: field("boardId"), columnId: field("columnId"), name: file.name || "file", mimeType: file.type || undefined }, new Uint8Array(await file.arrayBuffer()));
  return Response.json(dto, { status: 201 });
});
