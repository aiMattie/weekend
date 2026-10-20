/**
 * Column type contract (server-safe, NO React and NO db imports in per-type files, they are also
 * bundled into the client for formatting/filtering/sorting).
 *
 * A column type = two files:
 *   src/server/columns/<type>.ts     -> `ColumnLogic`  (validate / serialize / format / filter ...)
 *   src/components/columns/<type>.tsx -> `ColumnUi`    (Cell / Editor, "use client")
 * registered with one line each in src/server/columns/registry.ts and
 * src/components/columns/registry.ts. See docs/ARCHITECTURE.md for a worked example.
 *
 * Stored value (items.values[columnId]) is JSON in the API `value` shape so GraphQL/MCP
 * compatibility is mechanical. `null`/missing means empty.
 */

/** Minimal column info the logic functions need. */
export interface ColumnRef {
  id: string;
  key: string;
  title: string;
  type: string;
  settings: Record<string, unknown>;
}

export interface FilterOperator {
  id: string;
  /** i18n key suffix under `filter.op.*`; english fallback label */
  label: string;
  /** false for is_empty / is_checked ... */
  needsOperand: boolean;
}

export interface FormatContext {
  /** user id -> display name (people columns) */
  userNames?: Map<string, string>;
  teamNames?: Map<string, string>;
}

export interface ColumnSummary {
  text?: string;
  /** colored distribution (status/dropdown) */
  segments?: { label: string; color: string; count: number }[];
}

export interface ColumnLogic<TValue = unknown> {
  /** registry key, equals columns.type */
  type: string;
  /** English label; UI uses i18n `column.type.<type>` first */
  label: string;
  category: "essentials" | "status" | "people" | "time" | "numbers" | "files" | "advanced";
  /** @vibe/icons component name (client resolves it) */
  icon: string;
  /** computed/mirror columns are never written by users */
  readOnly?: boolean;
  /** default `settings` for a new column of this type */
  defaultSettings(): Record<string, unknown>;
  /** validate + normalise column settings (labels, units...). Throw ValidationError. */
  normalizeSettings?(settings: Record<string, unknown>): Record<string, unknown>;
  /** user/API input -> stored value. `null` clears. Throw ValidationError on bad input. */
  validate(input: unknown, column: ColumnRef): TValue | null;
  /** stored value -> API `value` (JSON-able). Usually the identity. */
  serialize(value: TValue | null, column: ColumnRef): unknown;
  /** stored value -> plain text (display, search, export, activity log). */
  format(value: TValue | null, column: ColumnRef, ctx?: FormatContext): string;
  filter: {
    operators: FilterOperator[];
    /** does `value` satisfy `op` with `operand` (operand shape depends on the operator) */
    test(value: TValue | null, op: string, operand: unknown, column: ColumnRef): boolean;
  };
  /** primitive used for sorting; null sorts last */
  sortKey?(value: TValue | null, column: ColumnRef, ctx?: FormatContext): string | number | null;
  /** footer row summary over all values in a group/board */
  summarize?(values: (TValue | null)[], column: ColumnRef): ColumnSummary | null;
}

export const isEmptyValue = (v: unknown): boolean =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
