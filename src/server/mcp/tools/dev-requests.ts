/**
 * MCP tools for feature requests / bugs about THIS app: `request_change` files an item on the change
 * request board, `list_change_requests` lets an automated Claude routine pick them up.
 * Board: env CHANGE_REQUEST_BOARD_ID, else the Weekend dev tasks board ("Taken" in workspace "Development").
 * Statuses follow the dev template: Backlog (new) -> Ready (approved, Claude may pick it up) ->
 * In progress -> Review -> Done; Blocked / Wacht op klant = waiting for a human.
 */
import { z } from "zod";
import type { Actor } from "@/lib/actor";
import { NotFoundError } from "@/lib/errors";
import * as services from "@/server/services";
import { getDevSettings } from "@/server/services/dev-config";
import type { ColumnRow } from "@/server/services/_shared";
import { ensureLabels } from "@/server/graphql/column-values";
import { assertBoardInScope } from "@/server/platform/scope";
import { appUrl } from "@/server/sso/config";
import { itemForTool, toolCtx } from "./platform-boards";
import type { McpToolDefinition } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tool<T = any> = McpToolDefinition<T>;

export const NEW_STATUS = "Backlog";
export const READY_STATUS = "Ready";
const TYPE_LABEL = { feature: "Feature", bug: "Bug", chore: "Chore" } as const;
/** priority -> label candidates (dev template uses P1..P4) */
const PRIORITY_LABELS = { critical: ["P1", "Critical"], high: ["P2", "High"], medium: ["P3", "Medium"], low: ["P4", "Low"] } as const;

/** The board change requests go to; throws a clear error when none is configured. */
export function changeRequestBoardId(actor: Actor): string {
  const fromEnv = process.env.CHANGE_REQUEST_BOARD_ID?.trim();
  if (fromEnv) return services.boards.get(actor, fromEnv).id;
  const tasksBoards = services.boards.list(actor).filter((b) => getDevSettings(b)?.role === "tasks");
  const devWs = services.workspaces.list(actor).find((w) => w.name === "Development")?.id;
  const hit = tasksBoards.find((b) => b.workspaceId === devWs) ?? tasksBoards[0];
  if (!hit) throw new NotFoundError("Change request board (set CHANGE_REQUEST_BOARD_ID or install the Weekend dev template)");
  return hit.id;
}

const labelsOf = (c: ColumnRow) => ((c.settings.labels as { text: string }[] | undefined) ?? []).map((l) => l.text);
const findLabel = (c: ColumnRow, wanted: readonly string[]) => labelsOf(c).find((t) => wanted.some((w) => w.toLowerCase() === t.toLowerCase()));

/** The status / type / priority columns of the board, matched by key first, then by type + title. */
function requestColumns(actor: Actor, boardId: string) {
  const cols = services.columns.list(actor, boardId, "item").filter((c) => !c.archived);
  const pick = (keys: string[], title: RegExp, types: string[]) =>
    cols.find((c) => keys.includes(c.key) && types.includes(c.type)) ?? cols.find((c) => types.includes(c.type) && title.test(c.title));
  return {
    cols,
    status: pick(["status"], /^status$/i, ["status"]),
    type: pick(["type"], /^(type|soort)$/i, ["dropdown", "status"]),
    priority: pick(["prioriteit", "priority"], /^(prioriteit|priority)$/i, ["status", "dropdown"]),
  };
}

const labelValue = (c: ColumnRow, label: string) => (c.type === "dropdown" ? [label] : { label });

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const toHtml = (text: string) => text.trim().split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");

const itemUrl = (boardId: string, itemId: string) => `${appUrl()}/boards/${boardId}?item=${itemId}`;

const requestChange: Tool = {
  name: "request_change", title: "Request a change to this app",
  description: `File a feature request, bug or chore for THIS Weekend app (not for the user's own boards). Creates an item on the change request board with status "${NEW_STATUS}" and the description as its first update. A human moves it to "${READY_STATUS}" when Claude may build it. Returns the item id and URL.`,
  inputSchema: z.object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(1).max(50_000).describe("What and why; for bugs: steps to reproduce, expected and actual behaviour"),
    type: z.enum(["feature", "bug", "chore"]).default("feature"),
    priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  }),
  handler(actor, i) {
    const boardId = changeRequestBoardId(actor);
    assertBoardInScope(actor, boardId);
    const { cols, status, type, priority } = requestColumns(actor, boardId);
    const values: Record<string, unknown> = {};
    const statusLabel = status && findLabel(status, [NEW_STATUS]);
    if (status && statusLabel) values[status.key] = { label: statusLabel };
    if (type) {
      values[type.key] = labelValue(type, findLabel(type, [TYPE_LABEL[i.type as keyof typeof TYPE_LABEL]]) ?? TYPE_LABEL[i.type as keyof typeof TYPE_LABEL]);
      ensureLabels(actor, boardId, cols.filter((c) => c.id === type.id), values);
    }
    const prioLabel = priority && findLabel(priority, PRIORITY_LABELS[i.priority as keyof typeof PRIORITY_LABELS]);
    if (priority && prioLabel) values[priority.key] = labelValue(priority, prioLabel);
    const item = services.items.create(actor, { boardId, name: i.title, values });
    const by = actor.name ? ` by ${escapeHtml(actor.name)}` : "";
    services.updates.create(actor, { itemId: item.id, body: `${toHtml(i.description)}<p><em>Filed via MCP request_change${by} (type: ${i.type}, priority: ${i.priority}).</em></p>` });
    return { item_id: item.id, board_id: boardId, name: item.name, status: statusLabel ?? null, type: i.type, priority: i.priority, url: itemUrl(boardId, item.id) };
  },
};

const listChangeRequests: Tool = {
  name: "list_change_requests", title: "List change requests",
  description: `List change requests (feature requests / bugs for this app) with status, type and priority. For an automated build routine: call with status "${READY_STATUS}" to get the work that is approved for Claude, set the item to "In progress" with change_item_column_values when you start, post progress with create_update, and set "Review" when a PR is ready ("Blocked" if you need a human). Statuses: Backlog, Ready, In progress, Review, Wacht op klant, Done, Blocked.`,
  inputSchema: z.object({
    status: z.union([z.string(), z.array(z.string())]).optional().describe("one status label or a list; default = all except Done"),
    type: z.enum(["feature", "bug", "chore"]).optional(),
    include_description: z.boolean().default(false).describe("add the first update (the request text)"),
    limit: z.number().int().min(1).max(500).default(50),
  }),
  handler(actor, i) {
    const boardId = changeRequestBoardId(actor);
    assertBoardInScope(actor, boardId);
    const { status, type, priority } = requestColumns(actor, boardId);
    const wanted = i.status === undefined ? null : (Array.isArray(i.status) ? i.status : [i.status]).map((s: string) => s.toLowerCase());
    const doneLabels = new Set(((status?.settings.labels as { text: string; isDone?: boolean }[] | undefined) ?? []).filter((l) => l.isDone).map((l) => l.text.toLowerCase()));
    const tc = toolCtx(actor, boardId);
    const textOf = (it: ReturnType<typeof itemForTool>, c?: ColumnRow) => (c ? (it.column_values?.[c.key]?.text ?? "") : "");
    const rows = services.items.list(actor, { boardId, limit: 5000 }).map((it) => itemForTool(it, tc))
      .map((it) => ({ it, status: textOf(it, status), type: textOf(it, type), priority: textOf(it, priority) }))
      .filter((r) => (wanted ? wanted.includes(r.status.toLowerCase()) : !doneLabels.has(r.status.toLowerCase())))
      .filter((r) => !i.type || r.type.toLowerCase() === TYPE_LABEL[i.type as keyof typeof TYPE_LABEL].toLowerCase())
      .slice(0, i.limit);
    return {
      board_id: boardId, ready_status: READY_STATUS, statuses: status ? labelsOf(status) : [], count: rows.length,
      requests: rows.map((r) => ({
        item_id: r.it.id, name: r.it.name, status: r.status || null, type: r.type || null, priority: r.priority || null, group: r.it.group,
        created_at: r.it.created_at, updated_at: r.it.updated_at, url: itemUrl(boardId, r.it.id),
        ...(i.include_description ? { description: services.updates.list(actor, r.it.id).at(-1)?.bodyText ?? null } : {}),
      })),
    };
  },
};

export const devRequestTools: Tool[] = [requestChange, listChangeRequests];
