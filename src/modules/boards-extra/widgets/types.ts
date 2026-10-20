/**
 * Widget model (pure, no db and no React): the shapes the aggregation functions work on, plus the
 * definition contract every widget type implements (see registry.ts).
 */
import type { ZodType } from "zod";

export interface WColumn { id: string; boardId: string; key: string; title: string; type: string; settings: Record<string, unknown> }
export interface WGroup { id: string; title: string; color: string }
export interface WItem {
  id: string; boardId: string; groupId: string | null; name: string; values: Record<string, unknown>;
  createdAt: string; updatedAt: string; creatorId: string | null;
}
export interface WBoard { id: string; name: string; columns: WColumn[]; groups: WGroup[]; items: WItem[] }
export interface WAsset { id: string; boardId: string | null; itemId: string | null; name: string; mimeType: string | null; size: number; createdAt: string }
export interface WActivity { id: string; boardId: string; itemId: string | null; userId: string | null; event: string; data: Record<string, unknown>; createdAt: string }

export interface FilterRuleLite { columnId: string; op: string; operand?: unknown }

export interface WidgetContext {
  /** only boards the viewer may see */
  boards: WBoard[];
  userNames: Map<string, string>;
  teamNames: Map<string, string>;
  now: Date;
  /** dashboard-level filters, applied before the widget's own filters */
  filters: FilterRuleLite[];
  assets?: WAsset[];
  activity?: WActivity[];
}

export type FieldKind = "metrics" | "column" | "columns" | "select" | "number" | "text" | "textarea" | "boards" | "switch" | "filters" | "date";
export interface WidgetField {
  key: string;
  kind: FieldKind;
  /** column kinds: restrict to these column types (omit = any, "__board"/"__group" are always offered for groupings when `special`) */
  columnTypes?: string[];
  /** offer the pseudo columns Board and Group */
  special?: boolean;
  options?: { value: string; label: string }[];
  /** only show when another setting has one of these values */
  showIf?: { key: string; in: string[] };
}

export type WidgetCategory = "charts" | "numbers" | "lists" | "planning" | "other";

export interface WidgetDefinition<S = Record<string, unknown>> {
  type: string;
  label: string;
  description: string;
  category: WidgetCategory;
  /** @vibe/icons name */
  icon: string;
  defaultLayout: { w: number; h: number; minW?: number; minH?: number };
  configSchema: ZodType<S>;
  /** declarative settings form (rendered generically by the UI, also exposed to MCP) */
  fields: WidgetField[];
  /** extra db data the service must preload into the context */
  needs?: ("assets" | "activity")[];
  /** widgets without board data (text, embed, counter) */
  noData?: boolean;
  query(ctx: WidgetContext, settings: S): unknown;
}
