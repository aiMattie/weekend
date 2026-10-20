/**
 * Board template registry (the "Add board" dialog and `boardTemplates.createBoard`).
 * Declarative: a template lists groups, columns and sample items; other modules register their
 * own with `registerBoardTemplate()` (one call from a file that is imported by `builtin.ts`' list or
 * by their own module). Column `settings.labels` follow src/server/columns/labels.ts.
 */
import type { Actor } from "../../lib/actor";

export interface TemplateColumn {
  title: string;
  type: string;
  /** key; items/sample values reference columns by key */
  key?: string;
  settings?: Record<string, unknown>;
  width?: number;
  scope?: "item" | "subitem";
}
export interface TemplateItem {
  name: string;
  /** index into `groups` or the group title */
  group: number | string;
  /** raw input per column key */
  values?: Record<string, unknown>;
  subitems?: { name: string; values?: Record<string, unknown> }[];
}
export type TemplateCategory = "general" | "projects" | "tasks" | "sales" | "it" | "marketing" | "hr" | "delivery";

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** @vibe/icons name, informational */
  icon?: string;
  kind?: "board" | "dev_sprints";
  groups: { title: string; color?: string }[];
  /** extra columns after the always-present Name column (item scope unless `scope: "subitem"`) */
  columns: TemplateColumn[];
  items?: TemplateItem[];
  views?: { name: string; type: string; settings?: Record<string, unknown> }[];
  /** escape hatch for templates that need more than data (runs after the declarative part, as the creating actor) */
  afterCreate?: (actor: Actor, boardId: string) => void;
}

export type BoardTemplateInfo = Pick<BoardTemplate, "id" | "name" | "description" | "category" | "icon"> & { columns: string[]; groups: string[] };

const g = globalThis as unknown as { __boardTemplates?: Map<string, BoardTemplate> };
const store = (g.__boardTemplates ??= new Map<string, BoardTemplate>());

export function registerBoardTemplate(t: BoardTemplate): void {
  store.set(t.id, t);
}
export const getBoardTemplate = (id: string): BoardTemplate | undefined => store.get(id);
export const listBoardTemplates = (): BoardTemplate[] => [...store.values()];
export const templateInfo = (t: BoardTemplate): BoardTemplateInfo => ({
  id: t.id, name: t.name, description: t.description, category: t.category, icon: t.icon,
  columns: ["Name", ...t.columns.filter((c) => (c.scope ?? "item") === "item").map((c) => c.title)], groups: t.groups.map((x) => x.title),
});

/** helper: status labels from [text, color] pairs; the last label is the "done" one when `doneLast`. */
export const statusLabelsOf = (pairs: [string, string][], doneIndex = -1) => pairs.map(([text, color], i) => ({ id: i, text, color, index: i, isDone: i === doneIndex }));
export const dropdownLabelsOf = (texts: string[]) => texts.map((text, id) => ({ id, text }));
