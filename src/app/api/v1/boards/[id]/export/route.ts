import { NextResponse } from "next/server";
import { api } from "@/server/http";
import * as boardExport from "@/server/services/export";

/** body: { format: "xlsx"|"csv", itemIds?, groupId?, includeSubitems? } -> file download */
export const POST = api<{ id: string }>(async ({ actor, params, body }) => {
  const f = await boardExport.exportBoard(actor, params.id, await body());
  return new NextResponse(new Uint8Array(f.bytes), { headers: { "Content-Type": f.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`, "X-Filename": encodeURIComponent(f.filename) } });
});
