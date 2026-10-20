import type { z } from "zod";
import type { Actor } from "../../../lib/actor";
import type { AppEvent, AppEventType } from "../../../lib/events";
import type { ColumnRow, ItemRow } from "../../services/_shared";
import type { TriggerSnapshot } from "../model";

/** Localised text (nl is the UI default). */
export interface Txt { nl: string; en: string }

/** Field of a block configuration. The UI renders these generically (builder, recipes, workflow nodes). */
export type FieldKind =
  | "column"      // a column of the board (optionally filtered by `columnTypes`)
  | "label"       // a status/dropdown label of the column chosen in field `of`
  | "group" | "board" | "user" | "users"
  | "text" | "longtext" | "number" | "select" | "boolean" | "time" | "url" | "list"
  | "value"       // raw value for the column chosen in field `of` (status label, text, number, date ...)
  | "integration" // a Slack/Teams connection
  | "item"       // an item of the board (template item)
  | "mapping";    // target board column -> source (column of this item or fixed value)
export interface FieldSpec {
  key: string;
  kind: FieldKind;
  label: Txt;
  required?: boolean;
  /** column kinds: allowed column types */
  columnTypes?: string[];
  /** label/value kinds: key of the column field this depends on */
  of?: string;
  /** board kind for group/mapping: key of the board field (default: the automation board) */
  boardField?: string;
  options?: { value: string; label: Txt }[];
  default?: unknown;
  placeholder?: Txt;
}

/** Read helpers handed to trigger `matches` and condition `evaluate` (engine implements them with services). */
export interface MatchContext {
  accountId: string;
  column(id: string): ColumnRow | null;
  item(id: string): ItemRow | null;
  /** group move recorded for the item by the last item.moved event */
  lastMove(itemId: string): { fromGroupId: string | null; toGroupId: string | null } | null;
  /** subitem ids + whether each is "done" (status label isDone) */
  subitemsDone(parentItemId: string): { total: number; done: number };
  /** display text of a stored value for a column (people names, status text ...) */
  format(column: ColumnRow, value: unknown): string;
}

export interface RunContext<TConfig> {
  actor: Actor;
  accountId: string;
  boardId: string | null;
  /** bus event that started the run (undefined for scheduler/manual starts) */
  event?: AppEvent;
  trigger: TriggerSnapshot;
  config: TConfig;
  /** automation chain info for loop protection (kept by the engine through AsyncLocalStorage) */
  run: { id: string; automationId: string; depth: number };
  /** template variables ({item}, {board}, {from}, {to}, {user}, {item.<columnKey>} ...) rendered live */
  vars: () => Record<string, string>;
  /** fresh copy of the trigger item (null when the run has no item or it is gone) */
  item: () => ItemRow | null;
  /** render `{tokens}` in a string with the live vars */
  render: (tpl: string) => string;
  now: () => Date;
}

/**
 * Automation building block: trigger ("when ..."), condition ("if ...") or action ("then ...").
 * Owned by the `automations` agent. Add one: create a file in blocks/, add it to registry.ts.
 */
export interface AutomationBlock<TConfig = Record<string, unknown>> {
  /** stable id stored in automations JSON, e.g. "status_changes_to" */
  id: string;
  kind: "trigger" | "condition" | "action";
  /** English label */
  label: string;
  /** localised short phrase for the builder, e.g. "When an item is created" */
  title: Txt;
  /** category in the Automation Center */
  category: string;
  configSchema: z.ZodType<TConfig>;
  fields: FieldSpec[];
  /** triggers: bus events that can start it. Time based triggers leave this empty and set `schedule`. */
  events?: AppEventType[];
  schedule?: boolean;
  matches?(event: AppEvent, config: TConfig, ctx: MatchContext): boolean;
  /** conditions: true = continue. `item` is the current state of the trigger item. */
  evaluate?(args: { event?: AppEvent; item: ItemRow | null; config: TConfig; ctx: MatchContext }): boolean | Promise<boolean>;
  /** actions: do the work through SERVICES (never the DB directly), as `ctx.actor` */
  run?(ctx: RunContext<TConfig>): Promise<string | void> | string | void;
  /** actions that need an item to work on (run is skipped with an error when missing) */
  needsItem?: boolean;
}
