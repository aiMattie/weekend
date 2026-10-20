import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateRequest } from "@/server/graphql/server";
import { createMcpServer } from "@/server/mcp/server";
import { issuer } from "@/server/services/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * MCP over Streamable HTTP (stateless, JSON responses). Auth: `Authorization: Bearer <api token>`
 * (the raw token without "Bearer" works too) or an OAuth access token (see /.well-known/oauth-protected-resource).
 * Browser sessions are NOT accepted here.
 */
async function handle(req: Request): Promise<Response> {
  const { actor, viaCookie } = await authenticateRequest(req);
  if (!actor || viaCookie) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: send an API token as 'Authorization: Bearer <token>'" }, id: null },
      { status: 401, headers: { "WWW-Authenticate": `Bearer realm="weekend-mcp", resource_metadata="${issuer()}/.well-known/oauth-protected-resource/api/mcp"` } },
    );
  }
  if (req.method !== "POST") {
    return Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed: this server is stateless, use POST" }, id: null }, { status: 405, headers: { Allow: "POST" } });
  }
  const server = createMcpServer(actor);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req);
    const headers = new Headers(res.headers);
    headers.delete("content-length"); // Next may compress the body: a stale length would truncate it
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } finally {
    // the JSON response is complete once handleRequest resolves
    void transport.close().catch(() => undefined);
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
