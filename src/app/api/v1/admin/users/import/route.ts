import { api } from "@/server/http";
import { members } from "@/server/services";
import { originOf } from "@/modules/admin/http";

/** body: { csv: "name,email,role\n..." } */
export const POST = api(async ({ actor, body, req }) => members.importCsv(actor, String((await body()).csv ?? ""), { origin: originOf(req) }), { status: 201 });
