import { authenticateRequest } from "@/server/graphql/server";
import { schemaSdl } from "@/server/graphql/schema";

export const dynamic = "force-dynamic";

/** SDL of the API. */
export async function GET(req: Request): Promise<Response> {
  const { actor } = await authenticateRequest(req);
  if (!actor) return Response.json({ error_message: "Not Authenticated", error_code: "UserUnauthorizedException", status_code: 401 }, { status: 401 });
  return new Response(schemaSdl(), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
