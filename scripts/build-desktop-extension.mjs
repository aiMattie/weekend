/**
 * Bundles the Claude Desktop proxy (src/desktop-extension/proxy.ts) with the MCP SDK into one
 * file, so the extension (.mcpb) carries no node_modules. The server packs it with a manifest on
 * download (src/server/mcp/desktop-extension.ts). Usage: npm run build:desktop
 */
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_OUTFILE = path.join(root, "dist", "desktop-extension", "server", "index.mjs");

export async function buildProxy(outfile = DEFAULT_OUTFILE) {
  await esbuild.build({
    entryPoints: [path.join(root, "src", "desktop-extension", "proxy.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: ["node18"],
    outfile,
    minify: true,
    sourcemap: false,
    legalComments: "none",
    logLevel: "warning",
    // Some dependencies still call require() for Node built-ins; give them one in ESM.
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  });
  return outfile;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = await buildProxy();
  console.log(`built ${path.relative(root, out)}`);
}
