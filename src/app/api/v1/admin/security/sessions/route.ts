import { api } from "@/server/http";
import { sessions } from "@/server/services";

/** ?userId=... : active sessions of a user (account:security) */
export const GET = api(({ actor, query }) => sessions.list(actor, query.get("userId") ?? actor.id));
