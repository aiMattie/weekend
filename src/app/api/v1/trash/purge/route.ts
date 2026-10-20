import { api } from "@/server/http";
import * as trash from "@/server/services/trash";

export const POST = api(async ({ actor, body }) => trash.purge(actor, await body()));
