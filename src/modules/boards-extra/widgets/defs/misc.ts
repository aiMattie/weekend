import { z } from "zod";
import type { WidgetDefinition } from "../types";
import { baseShape } from "./common";

const textSchema = z.object({ text: z.string().max(20_000).default(""), size: z.enum(["small", "medium", "large"]).default("medium") });
export const textWidget: WidgetDefinition<z.infer<typeof textSchema>> = {
  type: "text", label: "Text", description: "Static text block (plain text, line breaks kept).", category: "other", icon: "Text",
  defaultLayout: { w: 4, h: 3, minW: 2, minH: 2 }, configSchema: textSchema, noData: true,
  fields: [{ key: "text", kind: "textarea" }, { key: "size", kind: "select", options: ["small", "medium", "large"].map((v) => ({ value: v, label: v })) }],
  query: (_ctx, s) => ({ text: s.text, size: s.size }),
};

const embedSchema = z.object({ url: z.string().max(2000).default("") });

/** Turns a user URL into an iframe-safe https URL (YouTube/Vimeo watch links become embed links). Null when not allowed. */
export function toEmbedUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v") ?? (/^\/(shorts|embed)\/([\w-]{6,})/.exec(u.pathname)?.[2]);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === "youtu.be") { const id = u.pathname.slice(1); return id ? `https://www.youtube.com/embed/${id}` : null; }
  if (host === "vimeo.com") { const id = /^\/(\d+)/.exec(u.pathname)?.[1]; return id ? `https://player.vimeo.com/video/${id}` : null; }
  return u.toString();
}

export const embedWidget: WidgetDefinition<z.infer<typeof embedSchema>> = {
  type: "embed", label: "Embed", description: "Embeds a web page or video (YouTube, Vimeo, any iframe-able https URL).", category: "other", icon: "Embed",
  defaultLayout: { w: 6, h: 6, minW: 3, minH: 3 }, configSchema: embedSchema, noData: true,
  fields: [{ key: "url", kind: "text" }],
  query: (_ctx, s) => ({ url: s.url, embedUrl: s.url ? toEmbedUrl(s.url) : null }),
};

const filesSchema = z.object({ ...baseShape, limit: z.number().int().min(1).max(200).default(30) });
export const filesWidget: WidgetDefinition<z.infer<typeof filesSchema>> = {
  type: "files", label: "Files", description: "Gallery of files uploaded to items on the selected boards.", category: "lists", icon: "Files",
  defaultLayout: { w: 6, h: 5, minW: 3, minH: 3 }, configSchema: filesSchema, needs: ["assets"],
  fields: [{ key: "boardIds", kind: "boards" }, { key: "limit", kind: "number" }],
  query(ctx, s) {
    const allowed = new Set(ctx.boards.filter((b) => !s.boardIds.length || s.boardIds.includes(b.id)).map((b) => b.id));
    const names = new Map(ctx.boards.flatMap((b) => b.items.map((i) => [i.id, i.name] as const)));
    const boardNames = new Map(ctx.boards.map((b) => [b.id, b.name]));
    const files = (ctx.assets ?? []).filter((a) => a.boardId && allowed.has(a.boardId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      total: files.length,
      files: files.slice(0, s.limit).map((a) => ({ id: a.id, name: a.name, mimeType: a.mimeType, size: a.size, createdAt: a.createdAt, boardId: a.boardId, boardName: boardNames.get(a.boardId ?? "") ?? "", itemId: a.itemId, itemName: names.get(a.itemId ?? "") ?? "" })),
    };
  },
};

const activitySchema = z.object({ ...baseShape, limit: z.number().int().min(1).max(100).default(20) });
export const activityWidget: WidgetDefinition<z.infer<typeof activitySchema>> = {
  type: "activity", label: "Last updated", description: "Recent activity on the selected boards.", category: "lists", icon: "Activity",
  defaultLayout: { w: 4, h: 6, minW: 3, minH: 3 }, configSchema: activitySchema, needs: ["activity"],
  fields: [{ key: "boardIds", kind: "boards" }, { key: "limit", kind: "number" }],
  query(ctx, s) {
    const boardNames = new Map(ctx.boards.map((b) => [b.id, b.name]));
    const rows = (ctx.activity ?? []).filter((a) => boardNames.has(a.boardId) && (!s.boardIds.length || s.boardIds.includes(a.boardId))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, s.limit);
    return { events: rows.map((a) => ({ id: a.id, event: a.event, user: a.userId ? ctx.userNames.get(a.userId) ?? "" : "", boardName: boardNames.get(a.boardId) ?? "", name: String(a.data.name ?? ""), columnTitle: String(a.data.columnTitle ?? ""), to: String(a.data.to ?? ""), at: a.createdAt, itemId: a.itemId, boardId: a.boardId })) };
  },
};
