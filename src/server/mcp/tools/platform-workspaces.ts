/** MCP tools: workspaces, folders, move_object, search, users, updates, notifications, assets. */
import { z } from "zod";
import { SignJWT, jwtVerify } from "jose";
import { ValidationError } from "@/lib/errors";
import * as services from "@/server/services";
import { filterByWorkspace, assertWorkspaceInScope, inWorkspaceScope } from "@/server/platform/scope";
import { id, idList } from "../util";
import type { McpToolDefinition } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tool<T = any> = McpToolDefinition<T>;

const ws = (w: { id: string; name: string; kind: string; description: string | null; state: string }) => ({ id: w.id, name: w.name, kind: w.kind, description: w.description, state: w.state });

const listWorkspaces: Tool = {
  name: "list_workspaces", description: "List the workspaces the token can see.",
  inputSchema: z.object({ search_term: z.string().optional(), limit: z.number().int().min(1).max(500).default(100) }),
  handler: (actor, i) => ({
    workspaces: filterByWorkspace(actor, services.workspaces.list(actor), "id")
      .filter((w) => !i.search_term || w.name.toLowerCase().includes(i.search_term.toLowerCase())).slice(0, i.limit).map(ws),
  }),
};

const workspaceInfo: Tool = {
  name: "workspace_info", description: "Workspace details: members, folders and boards inside, docs and dashboards.",
  inputSchema: z.object({ workspace_id: id }),
  handler(actor, i) {
    const w = services.workspaces.get(actor, i.workspace_id);
    return {
      ...ws(w),
      members: services.workspaces.listMembers(actor, w.id),
      folders: services.folders.list(actor, w.id).map((f) => ({ id: f.id, name: f.name, parent_folder_id: f.parentFolderId, color: f.color })),
      boards: services.boards.list(actor, { workspaceId: w.id }).map((b) => ({ id: b.id, name: b.name, folder_id: b.folderId, kind: b.visibility, type: b.kind })),
      docs: services.docs.list(actor, { workspaceId: w.id }).map((d) => ({ id: d.id, title: d.title })),
      dashboards: services.dashboards.list(actor, { workspaceId: w.id }).map((d) => ({ id: d.id, name: d.name })),
    };
  },
};

const createWorkspace: Tool = {
  name: "create_workspace", description: "Create a workspace (kind open or closed).",
  inputSchema: z.object({ name: z.string().min(1), kind: z.enum(["open", "closed"]).default("open"), description: z.string().optional() }),
  handler: (actor, i) => ws(services.workspaces.create(actor, { name: i.name, kind: i.kind, description: i.description ?? null })),
};

const updateWorkspace: Tool = {
  name: "update_workspace", description: "Rename a workspace or change its description/kind.",
  inputSchema: z.object({ workspace_id: id, name: z.string().optional(), kind: z.enum(["open", "closed"]).optional(), description: z.string().optional() }),
  handler(actor, i) {
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "kind", "description"] as const) if (i[k] !== undefined) patch[k] = i[k];
    return ws(services.workspaces.update(actor, i.workspace_id, patch));
  },
};

const createFolder: Tool = {
  name: "create_folder", description: "Create a folder in a workspace (optionally nested in a parent folder).",
  inputSchema: z.object({ workspace_id: id, name: z.string().min(1), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), parent_folder_id: id.optional() }),
  handler: (actor, i) => { const f = services.folders.create(actor, { workspaceId: i.workspace_id, name: i.name, color: i.color, parentFolderId: i.parent_folder_id }); return { id: f.id, name: f.name, workspace_id: f.workspaceId, parent_folder_id: f.parentFolderId }; },
};

const updateFolder: Tool = {
  name: "update_folder", description: "Rename or recolor a folder, or move it into another parent folder.",
  inputSchema: z.object({ folder_id: id, name: z.string().optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), parent_folder_id: id.nullish() }),
  handler(actor, i) {
    const patch: Record<string, unknown> = {};
    if (i.name) patch.name = i.name;
    if (i.color) patch.color = i.color;
    if (i.parent_folder_id !== undefined) patch.parentFolderId = i.parent_folder_id;
    const f = services.folders.update(actor, i.folder_id, patch);
    return { id: f.id, name: f.name, color: f.color, parent_folder_id: f.parentFolderId };
  },
};

const moveObject: Tool = {
  name: "move_object", description: "Move a board or folder into a folder and/or another workspace (parent_folder_id null = workspace root).",
  inputSchema: z.object({ object_id: id, object_type: z.enum(["board", "folder"]).default("board"), parent_folder_id: id.nullish(), workspace_id: id.optional(), position_after_id: id.optional() }),
  handler(actor, i) {
    if (i.workspace_id) assertWorkspaceInScope(actor, i.workspace_id);
    if (i.object_type === "folder") {
      const f = services.folders.update(actor, i.object_id, { parentFolderId: i.parent_folder_id ?? null });
      return { moved: true, object_type: "folder", id: f.id, parent_folder_id: f.parentFolderId };
    }
    const b = services.boards.move(actor, i.object_id, { workspaceId: i.workspace_id, folderId: i.parent_folder_id ?? null, afterId: i.position_after_id });
    return { moved: true, object_type: "board", id: b.id, workspace_id: b.workspaceId, folder_id: b.folderId };
  },
};

/* ---------------------------------------------------------------- people + updates */

const getUserContext: Tool = {
  name: "get_user_context", description: "Who am I: the current user, their teams, favourite and recently used boards. Call this first.",
  inputSchema: z.object({}),
  handler(actor) {
    const me = services.users.me(actor);
    const teams = services.users.listTeams(actor).filter((t) => t.memberIds.includes(actor.id)).map((t) => ({ id: t.id, name: t.name }));
    return {
      user: { id: me.id, name: me.name, email: me.email, title: me.title, role: me.role, time_zone: me.timeZone, locale: me.locale },
      teams, token: actor.token ? { scopes: actor.token.scopes, workspace_ids: actor.token.workspaceIds } : null,
      favorites: filterByWorkspace(actor, services.boards.listFavorites(actor)).map((b) => ({ id: b.id, name: b.name })),
      workspaces: filterByWorkspace(actor, services.workspaces.list(actor), "id").map((w) => ({ id: w.id, name: w.name })),
    };
  },
};

const listUsersAndTeams: Tool = {
  name: "list_users_and_teams", description: "List users and teams, optionally filtered by name/email.",
  inputSchema: z.object({ query: z.string().optional(), type: z.enum(["users", "teams", "all"]).default("all"), user_ids: idList.optional() }),
  handler(actor, i) {
    const q = i.query?.toLowerCase();
    const users = i.type === "teams" ? [] : services.users.list(actor)
      .filter((u) => (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) && (!i.user_ids?.length || i.user_ids.includes(u.id)))
      .map((u) => ({ id: u.id, name: u.name, email: u.email, title: u.title, role: u.role, is_ai_agent: u.isAiAgent }));
    const teams = i.type === "users" ? [] : services.users.listTeams(actor).filter((t) => !q || t.name.toLowerCase().includes(q)).map((t) => ({ id: t.id, name: t.name, member_ids: t.memberIds }));
    return { users, teams };
  },
};

const createUpdate: Tool = {
  name: "create_update", description: "Post an update (comment) on an item. HTML is allowed; @mention with <a data-mention=\"userId\">. Use parent_update_id to reply.",
  inputSchema: z.object({ item_id: id, body: z.string().min(1), parent_update_id: id.optional() }),
  handler(actor, i) {
    const u = services.updates.create(actor, { itemId: i.item_id, body: i.body, parentUpdateId: i.parent_update_id ?? null });
    return { id: u.id, item_id: u.itemId, text: u.bodyText, created_at: u.createdAt };
  },
};

const getUpdates: Tool = {
  name: "get_updates", description: "Get the updates of an item (newest first, with replies) or recent updates of a board.",
  inputSchema: z.object({ item_id: id.optional(), board_id: id.optional(), limit: z.number().int().min(1).max(200).default(25) }),
  handler(actor, i) {
    const out = (u: { id: string; itemId: string; bodyText: string; createdAt: string; author?: { name: string } | null; likes?: string[]; replies?: unknown[] }) => ({ id: u.id, item_id: u.itemId, text: u.bodyText, author: u.author?.name ?? null, created_at: u.createdAt, likes: u.likes?.length ?? 0, replies: u.replies });
    if (i.item_id) return { updates: services.updates.list(actor, i.item_id).slice(0, i.limit).map(out) };
    if (i.board_id) {
      const all = services.items.list(actor, { boardId: i.board_id, limit: 5000 }).flatMap((it) => services.updates.list(actor, it.id));
      return { updates: all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, i.limit).map(out) };
    }
    throw new ValidationError("item_id or board_id is required");
  },
};

const createNotification: Tool = {
  name: "create_notification", description: "Send an in-app notification to a user, optionally linked to an item.",
  inputSchema: z.object({ user_id: id, message: z.string().min(1).optional(), text: z.string().min(1).optional(), item_id: id.optional(), board_id: id.optional() }),
  handler(actor, i) {
    const body = i.message ?? i.text;
    if (!body) throw new ValidationError("message is required");
    const item = i.item_id ? services.items.get(actor, i.item_id) : null;
    const n = services.notifications.create(actor, { userId: i.user_id, title: body, body, type: "system", boardId: item?.boardId ?? i.board_id, itemId: item?.id });
    return n ? { sent: true, id: n.id } : { sent: false, reason: "recipient disabled in-app notifications of this type" };
  },
};

/* ---------------------------------------------------------------- search + assets */

const search: Tool = {
  name: "search", description: "Search boards, items, updates, docs, users and workspaces by text (full text, permission filtered).",
  inputSchema: z.object({ query: z.string().min(1).optional(), search_term: z.string().min(1).optional(), types: z.array(z.string()).optional(), limit: z.number().int().min(1).max(50).default(10) }),
  handler(actor, i) {
    const q = i.query ?? i.search_term;
    if (!q) throw new ValidationError("query is required");
    const norm = (t: string) => ({ boards: "board", items: "item", docs: "doc", documents: "doc", document: "doc", updates: "update", users: "user", workspaces: "workspace", folders: "workspace" } as Record<string, string>)[t.toLowerCase()] ?? t.toLowerCase();
    const kinds = i.types?.length ? [...new Set((i.types as string[]).map(norm))] : undefined;
    const r = services.search.search(actor, { q, kinds, limit: i.limit });
    const limited = !!actor.token?.workspaceIds;
    return {
      query: r.query, total: r.total,
      results: r.groups.flatMap((g) => g.hits
        .filter((h) => !limited || g.kind === "user" || inWorkspaceScope(actor, g.kind === "workspace" ? h.id : h.workspaceId))
        .map((h) => ({ type: g.kind, id: h.id, title: h.title, board_id: h.boardId, board_name: h.boardName, workspace_id: h.workspaceId, subtitle: h.subtitle, url: h.href }))),
    };
  },
};

const asset = (a: { id: string; name: string; mimeType: string | null; size: number; url: string; itemId: string | null; boardId: string | null; columnId: string | null; createdAt: string }) =>
  ({ id: a.id, name: a.name, mime_type: a.mimeType, size: a.size, url: a.url, item_id: a.itemId, board_id: a.boardId, column_id: a.columnId, created_at: a.createdAt });

const getAssets: Tool = {
  name: "get_assets", description: "Get file assets by id, or all assets of an item/update.",
  inputSchema: z.object({ asset_id: id.optional(), asset_ids: idList.optional(), item_id: id.optional(), update_id: id.optional() }),
  handler(actor, i) {
    const ids = [...(i.asset_ids ?? []), ...(i.asset_id ? [i.asset_id] : [])];
    if (ids.length) return { assets: ids.map((x) => asset(services.assets.get(actor, x))) };
    if (i.item_id || i.update_id) return { assets: services.assets.list(actor, { itemId: i.item_id, updateId: i.update_id }).map(asset) };
    throw new ValidationError("asset_id, item_id or update_id is required");
  },
};

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "dev-secret-change-me-dev-secret-change-me");
const base = () => (process.env.PUBLIC_URL ?? "").replace(/\/$/, "");

const getAssetUploadUrl: Tool = {
  name: "get_asset_upload_url", readOnly: false,
  description: "Step 1 of a file upload: returns a short-lived upload_url. PUT the raw file bytes to it (Content-Type = file mime type), then call finalize_asset_upload with the returned upload_token.",
  inputSchema: z.object({ file_name: z.string().min(1), file_size: z.number().int().min(1).optional(), mime_type: z.string().optional(), item_id: id.optional(), update_id: id.optional(), column_id: z.string().optional() }),
  async handler(actor, i) {
    if (!i.item_id && !i.update_id) throw new ValidationError("item_id or update_id is required");
    const token = await new SignJWT({ n: i.file_name, m: i.mime_type ?? null, i: i.item_id ?? null, u: i.update_id ?? null, c: i.column_id ?? null, a: actor.id, t: actor.token?.id ?? null })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("15m").setSubject("asset-upload").sign(secret());
    return { upload_token: token, upload_url: `${base()}/api/mcp/upload/${token}`, method: "PUT", expires_in_seconds: 900, max_bytes: services.assets.MAX_UPLOAD_BYTES };
  },
};

export async function verifyUploadToken(token: string): Promise<{ name: string; mime: string | null; itemId: string | null; updateId: string | null; columnId: string | null; userId: string; tokenId: string | null }> {
  const { payload } = await jwtVerify(token, secret(), { subject: "asset-upload" });
  return { name: String(payload.n), mime: (payload.m as string | null) ?? null, itemId: (payload.i as string | null) ?? null, updateId: (payload.u as string | null) ?? null, columnId: (payload.c as string | null) ?? null, userId: String(payload.a), tokenId: (payload.t as string | null) ?? null };
}

const finalizeAssetUpload: Tool = {
  name: "finalize_asset_upload",
  description: "Step 3 of a file upload: confirm the file that was PUT to the upload_url and return the asset. (The asset is attached to the item/update/column given in step 1.)",
  inputSchema: z.object({ upload_token: z.string().optional(), upload_id: z.string().optional(), asset_id: id.optional() }),
  async handler(actor, i) {
    if (i.asset_id) return { asset: asset(services.assets.get(actor, i.asset_id)) };
    const token = i.upload_token ?? i.upload_id;
    if (!token) throw new ValidationError("upload_token is required");
    const claims = await verifyUploadToken(token).catch(() => { throw new ValidationError("Upload token is invalid or expired"); });
    if (claims.userId !== actor.id) throw new ValidationError("Upload token belongs to another user");
    const found = services.assets.list(actor, claims.itemId ? { itemId: claims.itemId } : { updateId: claims.updateId ?? undefined }).filter((a) => a.name === claims.name)[0];
    if (!found) throw new ValidationError("No file was uploaded to this upload_url yet");
    return { asset: asset(found) };
  },
};

export const workspaceTools: Tool[] = [
  listWorkspaces, workspaceInfo, createWorkspace, updateWorkspace, createFolder, updateFolder, moveObject,
  getUserContext, listUsersAndTeams, createUpdate, getUpdates, createNotification,
  search, getAssets, getAssetUploadUrl, finalizeAssetUpload,
];
