/** File upload mutations (GraphQL multipart request spec, handled by graphql-yoga). */
import { GraphQLError } from "graphql";
import * as services from "@/server/services";
import { mutation } from "./mutation-helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const assetsService = (): any => services.assets;

async function bytesOf(file: unknown): Promise<{ name: string; type: string; bytes: Buffer }> {
  const f = file as { name?: string; type?: string; arrayBuffer?: () => Promise<ArrayBuffer> };
  if (!f?.arrayBuffer) throw new GraphQLError("file must be sent as a multipart upload", { extensions: { code: "InvalidArgumentException" } });
  return { name: f.name || "upload", type: f.type || "application/octet-stream", bytes: Buffer.from(await f.arrayBuffer()) };
}

export const fileMutations = {
  add_file_to_column: mutation(async (a, ctx) => {
    const svc = assetsService();
    if (!svc?.upload) throw new GraphQLError("Asset uploads are not available yet", { extensions: { code: "NotImplemented" } });
    const item = services.items.get(ctx.actor, String(a.item_id));
    const col = services.columns.list(ctx.actor, item.boardId).find((c) => c.key === a.column_id || c.id === a.column_id);
    if (!col) throw new GraphQLError(`Column "${a.column_id}" not found`, { extensions: { code: "InvalidColumnIdException" } });
    const f = await bytesOf(a.file);
    return svc.upload(ctx.actor, { itemId: item.id, columnId: col.id, name: f.name, mimeType: f.type }, f.bytes);
  }, { itemArg: "item_id" }),
  add_file_to_update: mutation(async (a, ctx) => {
    const svc = assetsService();
    if (!svc?.upload) throw new GraphQLError("Asset uploads are not available yet", { extensions: { code: "NotImplemented" } });
    const u = services.updates.getDto(ctx.actor, String(a.update_id));
    const f = await bytesOf(a.file);
    return svc.upload(ctx.actor, { itemId: u.itemId, updateId: u.id, name: f.name, mimeType: f.type }, f.bytes);
  }),
};
