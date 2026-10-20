import { api } from "@/server/http";
import { members } from "@/server/services";

export const GET = api(({ actor, query }) => members.listInvitations(actor, { status: (query.get("status") as "pending" | null) ?? undefined, guests: query.get("guests") === null ? undefined : query.get("guests") === "true" }));
