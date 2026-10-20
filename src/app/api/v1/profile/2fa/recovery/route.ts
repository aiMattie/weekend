import { api } from "@/server/http";
import { twofactor } from "@/server/services";

export const POST = api(({ actor }) => twofactor.regenerateRecoveryCodes(actor));
