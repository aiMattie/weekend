/**
 * Fractional ordering helpers. Rows (items, groups, columns, boards...) carry a REAL `position`.
 * Insert between two neighbours with `positionBetween(before, after)`; append with
 * `positionAfter(last)`. Gaps shrink by half on every insert between; services renormalise a
 * parent's children (1000, 2000, ...) when the gap gets smaller than MIN_GAP.
 */
export const POSITION_STEP = 1000;
export const MIN_GAP = 1e-6;

export function positionBetween(before: number | null | undefined, after: number | null | undefined): number {
  if (before == null && after == null) return POSITION_STEP;
  if (before == null) return (after as number) - POSITION_STEP;
  if (after == null) return before + POSITION_STEP;
  return (before + after) / 2;
}

export const positionAfter = (last: number | null | undefined): number => positionBetween(last, null);
export const positionBefore = (first: number | null | undefined): number => positionBetween(null, first);
export const needsRebalance = (a: number, b: number): boolean => Math.abs(b - a) < MIN_GAP;
