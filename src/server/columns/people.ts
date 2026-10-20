import { ValidationError } from "../../lib/errors";
import { SET_OPS, testSet } from "./ops";
import type { ColumnLogic } from "./types";

export type PersonRef = { id: string; kind: "person" | "team" };
/** people: `{ personsAndTeams: [{ id, kind }] }` (API shape). */
export type PeopleValue = { personsAndTeams: PersonRef[] };

export const peopleColumn: ColumnLogic<PeopleValue> = {
  type: "people",
  label: "People",
  category: "people",
  icon: "Person",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined) return null;
    const arr: unknown[] = Array.isArray(input)
      ? input
      : typeof input === "object" && Array.isArray((input as { personsAndTeams?: unknown }).personsAndTeams)
        ? (input as { personsAndTeams: unknown[] }).personsAndTeams
        : typeof input === "string" || typeof input === "number"
          ? [input]
          : (() => { throw new ValidationError("People value must be an array of user ids or { personsAndTeams }"); })();
    const seen = new Set<string>();
    const out: PersonRef[] = [];
    for (const e of arr) {
      const ref: PersonRef | null =
        typeof e === "string" || typeof e === "number"
          ? { id: String(e), kind: "person" }
          : e && typeof e === "object" && "id" in e
            ? { id: String((e as { id: unknown }).id), kind: (e as { kind?: string }).kind === "team" ? "team" : "person" }
            : null;
      if (!ref || !/^\d+$/.test(ref.id)) throw new ValidationError(`Invalid person reference: ${JSON.stringify(e)}`);
      const k = `${ref.kind}:${ref.id}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(ref);
      }
    }
    return out.length ? { personsAndTeams: out } : null;
  },
  serialize: (v) => v,
  format: (v, _c, ctx) =>
    (v?.personsAndTeams ?? []).map((p) => (p.kind === "team" ? ctx?.teamNames?.get(p.id) : ctx?.userNames?.get(p.id)) ?? p.id).join(", "),
  filter: {
    operators: SET_OPS,
    /** operand: array of user ids */
    test: (v, op, operand) => testSet((v?.personsAndTeams ?? []).map((p) => p.id), op, operand),
  },
  sortKey: (v, _c, ctx) => {
    const first = v?.personsAndTeams[0];
    return first ? (ctx?.userNames?.get(first.id) ?? first.id).toLowerCase() : null;
  },
};
