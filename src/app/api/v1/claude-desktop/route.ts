import { ServiceError } from "@/lib/errors";
import { api } from "@/server/http";
import { BUNDLE_FILENAME, desktopExtension } from "@/server/mcp/desktop-extension";

/** Claude Desktop extension (.mcpb) for this environment, for anyone signed in. It holds no token. */
export const GET = api(() => {
  const bundle = desktopExtension();
  if (!bundle) throw new ServiceError("The Claude Desktop extension is not built on this server (npm run build:desktop)", "not_found", 404);
  return new Response(new Uint8Array(bundle), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${BUNDLE_FILENAME}"`, "Cache-Control": "no-store" },
  });
});
