import { handleGraphql } from "@/server/graphql/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GraphQL endpoint: schema, filters, cursors and error format of the Weekend API. */
export const GET = handleGraphql;
export const POST = handleGraphql;
export const OPTIONS = () => new Response(null, { status: 204, headers: { Allow: "GET, POST, OPTIONS" } });
