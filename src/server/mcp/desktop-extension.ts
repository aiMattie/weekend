/**
 * Claude Desktop extension (MCP Bundle, .mcpb) for this environment. A person installs the file
 * under Settings > Extensions > Advanced settings > Install Extension; Claude Desktop then starts
 * the bundled proxy (src/desktop-extension/proxy.ts) on their own computer, and the proxy signs in
 * through the browser (OAuth, the consent page) the first time. The address of this environment is
 * in the manifest; the file holds no token, so one file serves everyone.
 *
 * The .mcpb format is a zip with manifest.json at the root, written here with node:zlib.
 * The proxy is built by `npm run build:desktop` (part of `npm run build`); without it the download
 * is off and the UI hides the button.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { claudeConnectorsAllowed, mcpResource } from "@/server/services/oauth";

export const DESKTOP_EXTENSION_VERSION = "1.0.0";
export const BUNDLE_ENTRY = "server/index.mjs";
export const BUNDLE_FILENAME = "weekend.mcpb";

/** The built proxy; DESKTOP_PROXY_FILE overrides the path. */
export const proxyFile = (): string => process.env.DESKTOP_PROXY_FILE || path.join(process.cwd(), "dist", "desktop-extension", BUNDLE_ENTRY);

export interface BundleInput {
  url: string;
  version: string;
}

function check(input: BundleInput): URL {
  if (!/^https?:\/\/[^\s"'%]+$/.test(input.url)) throw new Error("bundle url must be http(s) without spaces or quotes");
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(input.version)) throw new Error("bundle version must be semver");
  return new URL(input.url.replace(/\/+$/, "").replace(/\/api\/mcp$/, "") + "/api/mcp");
}

export function renderBundleManifest(input: BundleInput): Record<string, unknown> {
  const url = check(input);
  return {
    manifest_version: "0.3",
    name: "weekend",
    display_name: `Weekend (${url.host})`,
    version: input.version,
    description: `Boards, items, docs and dashboards of Weekend at ${url.origin}, with your own permissions.`,
    author: { name: "Weekend" },
    server: {
      type: "node",
      entry_point: BUNDLE_ENTRY,
      mcp_config: {
        command: "node",
        args: ["${__dirname}/" + BUNDLE_ENTRY],
        // WEEKEND_TOKEN is emptied so an API token in the person's own environment cannot replace the sign-in.
        env: { WEEKEND_URL: url.href, WEEKEND_TOKEN: "" },
      },
    },
    compatibility: {
      claude_desktop: ">=0.10.0",
      platforms: ["darwin", "win32", "linux"],
      runtimes: { node: ">=18.0.0" },
    },
  };
}

export interface ZipEntry {
  name: string;
  data: Buffer;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  };
}

/** A plain zip (deflate where it helps, stored otherwise), UTF-8 names, no zip64. */
export function zip(entries: ZipEntry[], now = new Date()): Buffer {
  const { date, time } = dosDateTime(now);
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    if (!/^[A-Za-z0-9._/-]+$/.test(e.name) || e.name.startsWith("/") || e.name.includes("..")) throw new Error(`zip entry name: ${e.name}`);
    const name = Buffer.from(e.name, "utf8");
    const deflated = zlib.deflateRawSync(e.data, { level: 9 });
    const method = deflated.length < e.data.length ? 8 : 0;
    const body = method === 8 ? deflated : e.data;
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, body);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, directory, end]);
}

/** The complete .mcpb: manifest plus the built proxy. */
export function renderBundle(input: BundleInput, proxy: Buffer, now = new Date()): Buffer {
  const manifest = Buffer.from(JSON.stringify(renderBundleManifest(input), null, 2) + "\n", "utf8");
  return zip([{ name: "manifest.json", data: manifest }, { name: BUNDLE_ENTRY, data: proxy }], now);
}

const cache = new Map<string, Buffer>();

/** True when the proxy is built, so the extension can be downloaded. */
export function desktopExtensionAvailable(): boolean {
  return fs.existsSync(proxyFile());
}

/** What the "Connect Claude" card offers on this environment. */
export const claudeConnectOptions = (): { connector: boolean; desktop: boolean } => ({ connector: claudeConnectorsAllowed(), desktop: desktopExtensionAvailable() });

/** The extension for this environment's MCP address, or null when the proxy is not built. */
export function desktopExtension(): Buffer | null {
  const file = proxyFile();
  const key = `${file}\n${mcpResource()}`;
  const cached = cache.get(key);
  if (cached) return cached;
  if (!fs.existsSync(file)) return null;
  const bundle = renderBundle({ url: mcpResource(), version: DESKTOP_EXTENSION_VERSION }, fs.readFileSync(file));
  cache.set(key, bundle);
  return bundle;
}
