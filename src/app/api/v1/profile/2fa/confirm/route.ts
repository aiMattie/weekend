import { api } from "@/server/http";
import { twofactor } from "@/server/services";

export const POST = api(async ({ actor, body }) => twofactor.confirmSetup(actor, String((await body()).code ?? "")));
