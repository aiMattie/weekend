import { api } from "@/server/http";
import { audit } from "@/server/services";

/**
 * Audit log as JSON (SIEM). Session or API token of a user with account:audit.
 * Query: q, event (exact, or prefix with trailing "*"), category, actorId, from, to (ISO), limit (<=1000), cursor.
 * Response: { rows, nextCursor, total }.
 */
export const GET = api(({ actor, query }) => audit.list(actor, Object.fromEntries(query.entries())));
