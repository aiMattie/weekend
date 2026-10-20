import { api } from "@/server/http";
import { security } from "@/server/services";

export const POST = api(({ actor }) => { security.unlock(actor); });
