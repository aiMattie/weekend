/** Which toolbar buttons the user shows (Customize). Stored per browser in localStorage. */
import { useCallback, useSyncExternalStore } from "react";

export const TOOLBAR_BUTTONS = ["person", "filter", "sort", "hide", "groupby"] as const;
export type ToolbarButtonId = (typeof TOOLBAR_BUTTONS)[number];
const KEY = "weekend:toolbar:buttons";
const EVENT = "weekend:toolbar-prefs";

const parse = (raw: string | null): ToolbarButtonId[] => {
  if (!raw) return [...TOOLBAR_BUTTONS];
  try {
    const arr = JSON.parse(raw) as string[];
    return TOOLBAR_BUTTONS.filter((b) => arr.includes(b));
  } catch {
    return [...TOOLBAR_BUTTONS];
  }
};

let cache: { raw: string | null; value: ToolbarButtonId[] } = { raw: "__init__", value: [...TOOLBAR_BUTTONS] };
const ALL = [...TOOLBAR_BUTTONS];
function snapshot(): ToolbarButtonId[] {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  if (raw !== cache.raw) cache = { raw, value: parse(raw) };
  return cache.value;
}

export function useToolbarButtons(): [ToolbarButtonId[], (ids: ToolbarButtonId[]) => void] {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("storage", cb);
    window.addEventListener(EVENT, cb);
    return () => { window.removeEventListener("storage", cb); window.removeEventListener(EVENT, cb); };
  }, []);
  const value = useSyncExternalStore(subscribe, snapshot, () => ALL);
  const set = useCallback((ids: ToolbarButtonId[]) => {
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* ignore */ }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [value, set];
}
