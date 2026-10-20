/**
 * Schema for module "dashboards" (boards-extra): dashboards + widgets.
 * Dashboards aggregate one or more boards (cross-board). Widgets are positioned on a 12-column grid.
 */
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idPk, json, updatedAt } from "./_helpers";
import { users, workspaces } from "./core";

export interface DashboardFilterRule { columnId: string; op: string; operand?: unknown }
export interface WidgetLayout { x: number; y: number; w: number; h: number }

export const dashboards = sqliteTable(
  "dashboards",
  {
    id: idPk(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** boards that feed the widgets (cross-board) */
    boardIds: json<string[]>("board_ids").notNull().default([]),
    /** dashboard-level filters, applied to every widget */
    filters: json<DashboardFilterRule[]>("filters").notNull().default([]),
    /** locked = only the owner (and admins) may change layout/widgets */
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),
    /** main = everyone who can see the workspace, private = owner + memberIds */
    visibility: text("visibility").$type<"main" | "private">().notNull().default("main"),
    memberIds: json<string[]>("member_ids").notNull().default([]),
    settings: json<Record<string, unknown>>("settings").notNull().default({}),
    state: text("state").$type<"active" | "archived" | "deleted">().notNull().default("active"),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    position: real("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("dashboards_ws_idx").on(t.workspaceId)],
);

export const widgets = sqliteTable(
  "widgets",
  {
    id: idPk(),
    dashboardId: text("dashboard_id").notNull().references(() => dashboards.id, { onDelete: "cascade" }),
    /** key in the widget registry: chart | numbers | battery | ... */
    type: text("type").notNull(),
    title: text("title").notNull().default(""),
    settings: json<Record<string, unknown>>("settings").notNull().default({}),
    layout: json<WidgetLayout>("layout").notNull().default({ x: 0, y: 0, w: 6, h: 4 }),
    position: real("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("widgets_dashboard_idx").on(t.dashboardId)],
);
