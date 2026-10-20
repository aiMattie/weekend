import { api } from "@/server/http";
import { twofactor } from "@/server/services";

export const POST = api(async ({ actor, body }) => { await twofactor.disable(actor, String((await body()).password ?? "")); });
