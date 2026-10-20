import { oauthJson, preflight } from "@/server/oauth/http";
import { authorizationServerMetadata } from "@/server/services/oauth";

export const dynamic = "force-dynamic";

/** RFC 8414 authorization server metadata (MCP clients discover the OAuth endpoints here). */
export const GET = () => oauthJson(authorizationServerMetadata());
export const OPTIONS = preflight;
