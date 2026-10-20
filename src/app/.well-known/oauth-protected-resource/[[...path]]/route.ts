import { oauthJson, preflight } from "@/server/oauth/http";
import { protectedResourceMetadata } from "@/server/services/oauth";

export const dynamic = "force-dynamic";

/** RFC 9728 protected resource metadata, at the root and path-suffixed (/.well-known/oauth-protected-resource/api/mcp). */
export const GET = () => oauthJson(protectedResourceMetadata());
export const OPTIONS = preflight;
