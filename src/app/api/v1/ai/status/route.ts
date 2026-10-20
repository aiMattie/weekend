/** AI status for the UI: configured, credits. Never contains a key. */
import { api } from "@/server/http";
import { ai } from "@/server/services";

export const GET = api(({ actor }) => ai.status(actor));
