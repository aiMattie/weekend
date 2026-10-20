/**
 * CLIENT column registry: column type -> { Cell, Editor }.
 * ADD A COLUMN UI: create `<type>.tsx` here exporting a `ColumnUi`, then add ONE import and ONE
 * entry to `uis` below (read the file right before editing; other agents edit it too).
 * The server half lives in src/server/columns/registry.ts.
 */
import { checkboxUi } from "./checkbox";
import { dateUi } from "./date";
import { dropdownUi } from "./dropdown";
import { fallbackUi } from "./fallback";
import { linkUi } from "./link";
import { longTextUi } from "./long_text";
import { numbersUi } from "./numbers";
import { columnsPackUis } from "./pack";
import { peopleUi } from "./people";
import { sprintUi } from "./sprint";
import { statusUi } from "./status";
import { subtasksUi } from "./subtasks";
import { textUi } from "./text";
import type { ColumnUi } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const uis: Record<string, ColumnUi<any>> = {
  text: textUi,
  long_text: longTextUi,
  numbers: numbersUi,
  status: statusUi,
  date: dateUi,
  people: peopleUi,
  checkbox: checkboxUi,
  dropdown: dropdownUi,
  link: linkUi,
  subtasks: subtasksUi,
  sprint: sprintUi,
  ...columnsPackUis,
  // <- add new column UIs above this line
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getColumnUi = (type: string): ColumnUi<any> => uis[type] ?? fallbackUi;
export const hasColumnUi = (type: string): boolean => type in uis;
export type { CellProps, ColumnUi, EditorProps } from "./types";
