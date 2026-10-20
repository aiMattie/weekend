import { api } from "@/server/http";
import { listGrants } from "@/server/services/oauth";

export const GET = api(({ actor, query }) => listGrants(actor, { all: query.get("all") === "1" }));
