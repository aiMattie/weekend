import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getNavData } from "../../src/server/services/board-data";
import * as docs from "../../src/server/services/docs";
import * as folders from "../../src/server/services/folders";
import * as workspaces from "../../src/server/services/workspaces";
import { freshCtx, type Ctx } from "../helpers";

let c: Ctx;
beforeEach(async () => {
  process.env.FILES_DIR = mkdtempSync(path.join(os.tmpdir(), "weekend-logo-"));
  c = await freshCtx();
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("workspace logo", () => {
  it("stores a raster image, exposes a cache-busting url in nav data and can be replaced and removed", () => {
    const ws = workspaces.setLogo(c.admin, c.workspaceId, PNG);
    expect(ws.logo).toMatch(/\.png$/);
    const url = getNavData(c.admin).workspaces.find((w) => w.id === c.workspaceId)?.logoUrl;
    expect(url).toBe(`/api/v1/workspaces/${c.workspaceId}/logo?v=${encodeURIComponent(ws.logo!)}`);
    expect(workspaces.readLogo(c.member, c.workspaceId).mimeType).toBe("image/png");

    const again = workspaces.setLogo(c.admin, c.workspaceId, PNG);
    expect(again.logo).not.toBe(ws.logo);
    expect(workspaces.removeLogo(c.admin, c.workspaceId).logo).toBeNull();
    expect(() => workspaces.readLogo(c.admin, c.workspaceId)).toThrow();
  });

  it("refuses non-images, SVG, oversized files and members without manage rights", () => {
    expect(() => workspaces.setLogo(c.admin, c.workspaceId, new TextEncoder().encode("<svg onload=alert(1)>"))).toThrow(/PNG/);
    const big = new Uint8Array(workspaces.MAX_LOGO_BYTES + 1); big.set(PNG);
    expect(() => workspaces.setLogo(c.admin, c.workspaceId, big)).toThrow(/large/);
    expect(() => workspaces.setLogo(c.member, c.workspaceId, PNG)).toThrow();
  });
});

describe("workspace docs in the tree", () => {
  it("creates docs in a folder, moves them, lists them in nav data and drops the folder link when the folder goes", () => {
    const f = folders.create(c.admin, { workspaceId: c.workspaceId, name: "Notities" });
    const d = docs.create(c.admin, { workspaceId: c.workspaceId, folderId: f.id, title: "Kick-off" });
    expect(d.folderId).toBe(f.id);
    expect(getNavData(c.member).docs).toContainEqual({ id: d.id, title: "Kick-off", workspaceId: c.workspaceId, folderId: f.id, icon: null });

    expect(docs.update(c.admin, d.id, { folderId: null }).folderId).toBeNull();
    docs.update(c.admin, d.id, { folderId: f.id });
    folders.remove(c.admin, f.id);
    expect(docs.get(c.admin, d.id).folderId).toBeNull();
  });

  it("rejects a folder from another workspace", () => {
    const other = workspaces.create(c.admin, { name: "Other" });
    const f = folders.create(c.admin, { workspaceId: other.id, name: "Elders" });
    expect(() => docs.create(c.admin, { workspaceId: c.workspaceId, folderId: f.id })).toThrow(/another workspace/);
  });

  it("keeps private docs of others out of the nav", () => {
    const d = docs.create(c.admin, { workspaceId: c.workspaceId, title: "Geheim", visibility: "private" });
    expect(getNavData(c.member).docs.some((x) => x.id === d.id)).toBe(false);
    expect(getNavData(c.admin).docs.some((x) => x.id === d.id)).toBe(true);
  });
});
