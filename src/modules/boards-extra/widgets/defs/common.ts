import { z } from "zod";
import type { WidgetContext, WColumn } from "../types";
import { findColumnAnywhere } from "../columns-util";

export const filterRuleSchema = z.object({ columnId: z.string(), op: z.string(), operand: z.unknown().optional() });
/** settings shared by every data widget */
export const baseShape = {
  boardIds: z.array(z.string()).default([]),
  filters: z.array(filterRuleSchema).default([]),
};
export const dateBucketSchema = z.enum(["day", "week", "month", "year"]).default("month");
export const aggSchema = z.enum(["count", "sum", "avg", "min", "max", "median"]);

/** The configured column, else the first column of `type` on the selected boards. */
export function pickColumn(ctx: WidgetContext, id: string | undefined, fallbackTypes: string[] | null, boardIds: string[] = []): WColumn | undefined {
  const given = findColumnAnywhere(ctx, id);
  if (given || !fallbackTypes) return given;
  for (const b of ctx.boards) {
    if (boardIds.length && !boardIds.includes(b.id)) continue;
    const c = b.columns.find((x) => fallbackTypes.includes(x.type));
    if (c) return c;
  }
  return undefined;
}
