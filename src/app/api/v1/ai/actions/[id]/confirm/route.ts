/** Confirm a Sidekick write card: runs it as the user. */
import { api } from "@/server/http";
import { ai } from "@/server/services";

type P = { id: string };
export const POST = api<P>(async ({ actor, params }) => ai.confirmAction(actor, params.id));
