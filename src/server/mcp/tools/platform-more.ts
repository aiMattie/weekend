/** MCP tools: read access to teams, docs and dashboards, doc content, and time tracking on items. */
import { z } from "zod";
import type { Actor } from "@/lib/actor";
import { NotFoundError } from "@/lib/errors";
import * as services from "@/server/services";
import { assertItemInScope, assertWorkspaceInScope, inWorkspaceScope } from "@/server/platform/scope";
import { id } from "../util";
import type { McpToolDefinition } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tool<T = any> = McpToolDefinition<T>;

const docOut = (d: { id: string; title: string; workspaceId: string; itemId: string | null; updatedAt: string }) => ({ id: d.id, title: d.title, workspace_id: d.workspaceId, item_id: d.itemId, url: `/docs/${d.id}`, updated_at: d.updatedAt });
const scopedDoc = (actor: Actor, docId: string) => { const d = services.docs.get(actor, docId); assertWorkspaceInScope(actor, d.workspaceId); return d; };

const listTeams: Tool = {
  name: "list_teams", title: "List teams",
  description: "List the teams of the account with their members and owners.",
  inputSchema: z.object({ search_term: z.string().optional() }),
  handler: (actor, i) => ({
    teams: services.teams.list(actor).filter((t) => !i.search_term || t.name.toLowerCase().includes(i.search_term.toLowerCase()))
      .map((t) => ({ id: t.id, name: t.name, owner_ids: t.ownerIds, members: t.members.map((m) => ({ id: m.userId, name: m.name, email: m.email, is_owner: m.isOwner })) })),
  }),
};

const listDocs: Tool = {
  name: "list_docs", title: "List docs",
  description: "List docs (title, workspace, item, excerpt), optionally in one workspace or attached to one item. Read their content with read_docs.",
  inputSchema: z.object({ workspace_id: id.optional(), item_id: id.optional(), limit: z.number().int().min(1).max(500).default(100) }),
  handler: (actor, i) => ({
    docs: services.docs.list(actor, { workspaceId: i.workspace_id, itemId: i.item_id, limit: i.limit }).filter((d) => inWorkspaceScope(actor, d.workspaceId))
      .map((d) => ({ ...docOut(d), owner: d.ownerName, item_name: d.itemName, excerpt: d.excerpt })),
  }),
};

const addContentToDoc: Tool = {
  name: "add_content_to_doc", title: "Add content to doc",
  description: "Append markdown to the end of an existing doc.",
  inputSchema: z.object({ doc_id: id, markdown: z.string().min(1) }),
  handler: (actor, i) => { scopedDoc(actor, i.doc_id); return docOut(services.docs.update(actor, i.doc_id, { appendMarkdown: i.markdown })); },
};

const deleteDoc: Tool = {
  name: "delete_doc", title: "Delete doc", destructive: true,
  description: "Delete a doc (moves it to the trash).",
  inputSchema: z.object({ doc_id: id }),
  handler: (actor, i) => { scopedDoc(actor, i.doc_id); services.docs.remove(actor, i.doc_id); return { deleted: true, doc_id: i.doc_id }; },
};

const listDashboards: Tool = {
  name: "list_dashboards", title: "List dashboards",
  description: "List dashboards (optionally in one workspace) with their boards and widget count.",
  inputSchema: z.object({ workspace_id: id.optional() }),
  handler: (actor, i) => ({
    dashboards: services.dashboards.list(actor, { workspaceId: i.workspace_id }).filter((d) => inWorkspaceScope(actor, d.workspaceId))
      .map((d) => ({ id: d.id, name: d.name, description: d.description, workspace_id: d.workspaceId, board_ids: d.boardIds, widget_count: d.widgetCount, url: `/dashboards/${d.id}` })),
  }),
};

const getDashboard: Tool = {
  name: "get_dashboard", title: "Get dashboard",
  description: "A dashboard with its boards and widgets (type, title, settings, layout).",
  inputSchema: z.object({ dashboard_id: id }),
  handler(actor, i) {
    const r = services.dashboards.get(actor, i.dashboard_id);
    assertWorkspaceInScope(actor, r.dashboard.workspaceId);
    return {
      id: r.dashboard.id, name: r.dashboard.name, description: r.dashboard.description, workspace: { id: r.dashboard.workspaceId, name: r.workspaceName },
      boards: r.boards.map((b) => ({ id: b.id, name: b.name })), widgets: r.widgets.map((w) => ({ id: w.id, type: w.type, title: w.title, settings: w.settings, layout: w.layout })),
    };
  },
};

/* ---------------------------------------------------------------- time tracking */

const entryOut = (e: services.timeEntries.TimeEntryDto) => ({ id: e.id, item_id: e.itemId, user_id: e.userId, user: e.userName, date: e.date, minutes: e.minutes, description: e.description, billable: e.billable, synced: !!e.syncedAt });

const listTimeEntries: Tool = {
  name: "list_time_entries", title: "List time entries",
  description: "Logged time on an item: entries plus total and billable minutes.",
  inputSchema: z.object({ item_id: id }),
  handler(actor, i) {
    const r = services.timeEntries.list(actor, i.item_id);
    return { item_id: i.item_id, total_minutes: r.totalMinutes, billable_minutes: r.billableMinutes, entries: r.entries.map(entryOut) };
  },
};

const createTimeEntry: Tool = {
  name: "create_time_entry", title: "Log time",
  description: "Log time on an item for the current user: minutes or hours, optional date (YYYY-MM-DD, default today), description and billable flag.",
  inputSchema: z.object({ item_id: id, minutes: z.number().int().min(1).optional(), hours: z.number().positive().optional(), date: z.string().optional(), description: z.string().optional(), billable: z.boolean().default(true) }),
  handler: (actor, i) => entryOut(services.timeEntries.create(actor, { itemId: i.item_id, minutes: i.minutes, hours: i.hours, date: i.date, description: i.description, billable: i.billable })),
};

const deleteTimeEntry: Tool = {
  name: "delete_time_entry", title: "Delete time entry", destructive: true,
  description: "Delete one of your time entries (not possible once synced to the hours board).",
  inputSchema: z.object({ item_id: id, time_entry_id: id }),
  handler(actor, i) {
    assertItemInScope(actor, i.item_id);
    if (!services.timeEntries.list(actor, i.item_id).entries.some((e) => e.id === i.time_entry_id)) throw new NotFoundError("Time entry");
    services.timeEntries.remove(actor, i.time_entry_id);
    return { deleted: true, time_entry_id: i.time_entry_id };
  },
};

export const moreTools: Tool[] = [listTeams, listDocs, addContentToDoc, deleteDoc, listDashboards, getDashboard, listTimeEntries, createTimeEntry, deleteTimeEntry];
