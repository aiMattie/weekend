import { api } from "@/server/http";
import * as trash from "@/server/services/trash";

/** body: { kind: "board"|"group"|"item"|"workspace", id } */
export const POST = api(async ({ actor, body }) => trash.restore(actor, await body()));
