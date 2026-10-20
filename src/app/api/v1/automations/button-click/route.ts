import { api } from "@/server/http";
import { automations } from "@/server/services";

/** POST { itemId, columnId }: fires the button_clicked trigger (API use; the button cell has its own column action route). */
export const POST = api(async ({ actor, body }) => automations.clickButton(actor, await body()));
