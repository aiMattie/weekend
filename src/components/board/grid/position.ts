/** Client mirror of computePosition (src/server/services/_shared.ts) so optimistic moves land where the server puts them. */
export type PositionSpec = { position?: number; beforeId?: string; afterId?: string; top?: boolean };

export function computePosition(siblings: { id: string; position: number }[], spec: PositionSpec = {}): number {
  const POS = 1000;
  if (typeof spec.position === "number") return spec.position;
  if (spec.top) return siblings.length ? siblings[0].position - POS : POS;
  const idx = (id: string) => siblings.findIndex((s) => s.id === id);
  if (spec.beforeId && idx(spec.beforeId) >= 0) {
    const i = idx(spec.beforeId);
    return i === 0 ? siblings[0].position - POS : (siblings[i - 1].position + siblings[i].position) / 2;
  }
  if (spec.afterId && idx(spec.afterId) >= 0) {
    const i = idx(spec.afterId);
    return i === siblings.length - 1 ? siblings[i].position + POS : (siblings[i].position + siblings[i + 1].position) / 2;
  }
  return siblings.length ? siblings[siblings.length - 1].position + POS : POS;
}
