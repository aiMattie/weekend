/** Pure whiteboard helpers (geometry, diff/merge for realtime-ish sync). No React, no db. */
import type { WhiteboardElement } from "@/db/schema/docs";

export type El = WhiteboardElement;
export interface View { x: number; y: number; zoom: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const NOTE_COLORS = ["#ffeb8a", "#ffc2d4", "#bde0ff", "#c4f0c5", "#e0ccff", "#ffd2a8"];
export const SIZES: Record<string, { w: number; h: number }> = {
  note: { w: 180, h: 140 }, rect: { w: 160, h: 100 }, ellipse: { w: 160, h: 100 }, diamond: { w: 160, h: 120 }, text: { w: 220, h: 44 }, image: { w: 240, h: 180 },
};
export const MIN_SIZE = 24;

export const newElementId = (): string => `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function boundsOf(el: El, all?: Map<string, El>): Rect {
  if (el.type === "pen") {
    const pts = el.points ?? [];
    if (!pts.length) return { x: el.x, y: el.y, w: 0, h: 0 };
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x: el.x + Math.min(...xs), y: el.y + Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  if (el.type === "connector") {
    const [a, b] = connectorEnds(el, all ?? new Map());
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
  }
  return { x: el.x, y: el.y, w: el.w ?? SIZES[el.type]?.w ?? 100, h: el.h ?? SIZES[el.type]?.h ?? 80 };
}

const center = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];

/** Point on the border of `r` in the direction of `towards`. */
export function edgePoint(r: Rect, towards: [number, number]): [number, number] {
  const [cx, cy] = center(r);
  const dx = towards[0] - cx;
  const dy = towards[1] - cy;
  if (!dx && !dy) return [cx, cy];
  const s = Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity);
  return [cx + dx * s, cy + dy * s];
}

/** Start and end of a connector: attached to elements (follows them) or free points. */
export function connectorEnds(c: El, all: Map<string, El>): [[number, number], [number, number]] {
  const free = c.points ?? [[c.x, c.y], [c.x + 100, c.y]];
  const a = c.from ? all.get(c.from) : undefined;
  const b = c.to ? all.get(c.to) : undefined;
  const pa: [number, number] = a ? center(boundsOf(a, all)) : [free[0][0], free[0][1]];
  const pb: [number, number] = b ? center(boundsOf(b, all)) : [free[free.length - 1][0], free[free.length - 1][1]];
  return [a ? edgePoint(boundsOf(a, all), pb) : pa, b ? edgePoint(boundsOf(b, all), pa) : pb];
}

export function penPath(el: El): string {
  const pts = el.points ?? [];
  if (!pts.length) return "";
  return pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
}

/** JSON with sorted keys and no undefined, so a server round trip never looks like a change. */
export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) => (val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val as object).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1))) : val));
}

/** Elements changed/added vs the last known server state, and ids removed locally. */
export function diffElements(base: Map<string, string>, elements: El[]): { upsert: El[]; remove: string[] } {
  const upsert = elements.filter((e) => base.get(e.id) !== stable(e));
  const present = new Set(elements.map((e) => e.id));
  const remove = [...base.keys()].filter((id) => !present.has(id));
  return { upsert, remove };
}

export const toBase = (elements: El[]): Map<string, string> => new Map(elements.map((e) => [e.id, stable(e)]));

/**
 * Merge a remote snapshot into local state without clobbering unsaved local edits:
 * locally changed elements win, locally removed ones stay removed, everything else follows the remote.
 */
export function mergeRemote(local: El[], base: Map<string, string>, remote: El[]): { elements: El[]; base: Map<string, string> } {
  const { upsert, remove } = diffElements(base, local);
  const dirty = new Map(upsert.map((e) => [e.id, e]));
  const removed = new Set(remove);
  const remoteIds = new Set(remote.map((e) => e.id));
  const out: El[] = [];
  const seen = new Set<string>();
  for (const e of remote) {
    if (removed.has(e.id)) continue;
    out.push(dirty.get(e.id) ?? e);
    seen.add(e.id);
  }
  // local-only new elements (not in base) stay; ones that existed in base but vanished remotely are dropped
  for (const e of local) if (!seen.has(e.id) && !remoteIds.has(e.id) && !base.has(e.id)) out.push(e);
  return { elements: out, base: toBase(remote) };
}

export function screenToWorld(view: View, sx: number, sy: number): [number, number] {
  return [(sx - view.x) / view.zoom, (sy - view.y) / view.zoom];
}

export function zoomAt(view: View, factor: number, sx: number, sy: number): View {
  const zoom = Math.min(4, Math.max(0.1, view.zoom * factor));
  const k = zoom / view.zoom;
  return { zoom, x: sx - (sx - view.x) * k, y: sy - (sy - view.y) * k };
}

export const translate = (el: El, dx: number, dy: number): El => ({ ...el, x: el.x + dx, y: el.y + dy });
