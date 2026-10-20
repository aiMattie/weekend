import { relationColumn } from "./relation-base";

export { makeRelationValue, relationIds, type RelationValue } from "./relation-base";

/**
 * dependency: items of the SAME board this item depends on (finish-to-start).
 * Stored `{ linkedPulseIds: [{ linkedPulseId }] }`. Cycles and cross-board links are rejected
 * by the column hooks (services/column-hooks.ts); `settings.lag` is the lag in days (default 0).
 */
export const dependencyColumn = relationColumn({
  type: "dependency",
  label: "Dependency",
  category: "advanced",
  icon: "Dependency",
  defaultSettings: () => ({ allowMultiple: true }),
  normalizeSettings: (s) => ({ ...s, allowMultiple: s.allowMultiple !== false }),
});
