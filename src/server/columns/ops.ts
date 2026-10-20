import type { FilterOperator } from "./types";

export const OP_IS_EMPTY: FilterOperator = { id: "is_empty", label: "Is empty", needsOperand: false };
export const OP_NOT_EMPTY: FilterOperator = { id: "is_not_empty", label: "Is not empty", needsOperand: false };

export const TEXT_OPS: FilterOperator[] = [
  { id: "contains", label: "Contains text", needsOperand: true },
  { id: "not_contains", label: "Does not contain text", needsOperand: true },
  { id: "is", label: "Is", needsOperand: true },
  { id: "is_not", label: "Is not", needsOperand: true },
  OP_IS_EMPTY,
  OP_NOT_EMPTY,
];

export const NUMBER_OPS: FilterOperator[] = [
  { id: "eq", label: "=", needsOperand: true },
  { id: "neq", label: "!=", needsOperand: true },
  { id: "gt", label: ">", needsOperand: true },
  { id: "gte", label: ">=", needsOperand: true },
  { id: "lt", label: "<", needsOperand: true },
  { id: "lte", label: "<=", needsOperand: true },
  OP_IS_EMPTY,
  OP_NOT_EMPTY,
];

export const SET_OPS: FilterOperator[] = [
  { id: "any_of", label: "Is any of", needsOperand: true },
  { id: "none_of", label: "Is none of", needsOperand: true },
  OP_IS_EMPTY,
  OP_NOT_EMPTY,
];

export function testText(text: string, op: string, operand: unknown): boolean {
  const o = String(operand ?? "").toLowerCase();
  const t = text.toLowerCase();
  switch (op) {
    case "contains": return t.includes(o);
    case "not_contains": return !t.includes(o);
    case "is": return t === o;
    case "is_not": return t !== o;
    case "is_empty": return t === "";
    case "is_not_empty": return t !== "";
    default: return true;
  }
}

export function testNumber(n: number | null, op: string, operand: unknown): boolean {
  const o = Number(operand);
  switch (op) {
    case "is_empty": return n === null;
    case "is_not_empty": return n !== null;
    case "eq": return n !== null && n === o;
    case "neq": return n === null || n !== o;
    case "gt": return n !== null && n > o;
    case "gte": return n !== null && n >= o;
    case "lt": return n !== null && n < o;
    case "lte": return n !== null && n <= o;
    default: return true;
  }
}

/** any_of / none_of / is_empty / is_not_empty over a set of string ids. */
export function testSet(ids: string[], op: string, operand: unknown): boolean {
  const wanted = (Array.isArray(operand) ? operand : [operand]).map(String);
  switch (op) {
    case "is_empty": return ids.length === 0;
    case "is_not_empty": return ids.length > 0;
    case "any_of": return ids.some((i) => wanted.includes(i));
    case "none_of": return !ids.some((i) => wanted.includes(i));
    default: return true;
  }
}
