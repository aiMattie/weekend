import { api } from "@/server/http";
import { agents } from "@/server/services";

export const GET = api(({ actor }) => agents.identities(actor));
