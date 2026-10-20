/**
 * Column type registry (server + shared pure logic).
 *
 * ADD A COLUMN TYPE: create `src/server/columns/<type>.ts` exporting a `ColumnLogic`, then add ONE
 * import and ONE array entry below (read this file right before editing, other agents edit it too).
 * Also add the UI half in src/components/columns/registry.ts.
 * Computed types (mirror, formula, progress, auto number...) live in ./computed/ and are
 * registered here the same way with `readOnly: true`.
 */
import { checkboxColumn } from "./checkbox";
import { dateColumn } from "./date";
import { dropdownColumn } from "./dropdown";
import { fallbackColumn } from "./fallback";
import { linkColumn } from "./link";
import { longTextColumn } from "./long_text";
import { numbersColumn } from "./numbers";
import { columnsPack } from "./pack";
import { peopleColumn } from "./people";
import { sprintColumn } from "./sprint";
import { statusColumn } from "./status";
import { textColumn } from "./text";
import { bindScalarResolver } from "./computed/scalars";
import type { ColumnLogic } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const definitions: ColumnLogic<any>[] = [
  textColumn,
  longTextColumn,
  numbersColumn,
  statusColumn,
  dateColumn,
  peopleColumn,
  checkboxColumn,
  dropdownColumn,
  linkColumn,
  sprintColumn,
  ...columnsPack,
  // <- add new column types above this line
];

const byType = new Map(definitions.map((d) => [d.type, d]));

/** Logic for a type; unknown types get the verbatim-JSON fallback. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getColumnLogic(type: string): ColumnLogic<any> {
  return byType.get(type) ?? { ...fallbackColumn, type };
}

bindScalarResolver(getColumnLogic);

export const hasColumnLogic = (type: string): boolean => byType.has(type);
export const listColumnLogic = () => [...definitions];
export type { ColumnLogic, ColumnRef } from "./types";
