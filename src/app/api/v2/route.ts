import { handleGraphql } from "@/server/graphql/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Alias of /api/graphql (versioned path). */
export const GET = handleGraphql;
export const POST = handleGraphql;
