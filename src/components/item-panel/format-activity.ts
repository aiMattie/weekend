import type { UserLite } from "@/lib/board-types";

export interface ActivityRow { id: string; event: string; userId: string | null; columnId?: string | null; data: Record<string, unknown>; createdAt: string }

type T = (k: string, v?: Record<string, string | number>) => string;

/** Events that have an `panel.act.<event>` translation; everything else falls back to the raw event name. */
const KNOWN = new Set([
  "create_item", "create_subitem", "rename_item", "change_column_value", "move_item", "move_item_out", "duplicate_item", "archive_item", "delete_item",
  "restore_item", "create_update", "delete_update", "convert_to_subitem", "convert_to_item", "pin_update",
]);

/** One readable line for an activity_log row. */
export function describeActivity(row: ActivityRow, users: UserLite[], t: T): string {
  const who = row.userId ? users.find((u) => u.id === row.userId)?.name ?? "?" : row.data.source === "automation" ? t("panel.act.automation") : t("panel.act.system");
  const d = row.data;
  const s = (v: unknown) => (v === undefined || v === null || v === "" ? "-" : String(v));
  const vars = { who, name: s(d.name), from: s(d.from), to: s(d.to), column: s(d.columnTitle) };
  if (KNOWN.has(row.event)) return t(`panel.act.${row.event}`, vars);
  return t("panel.act.other", { who, event: row.event.replace(/_/g, " ") });
}

/** Short label for the event kind (filter chips / tooltips). */
export const activityColumnLabel = (row: ActivityRow): string | null => (row.event === "change_column_value" ? String(row.data.columnTitle ?? "") : null);
