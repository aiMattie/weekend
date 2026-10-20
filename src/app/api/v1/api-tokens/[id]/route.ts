import { api } from "@/server/http";
import { apiTokens } from "@/server/services";

type P = { id: string };

/** Revoke a token (it stays listed as revoked). */
export const DELETE = api<P>(({ actor, params }) => {
  const row = apiTokens.revoke(actor, params.id);
  return row;
});
