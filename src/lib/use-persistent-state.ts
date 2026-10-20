"use client";

import { useCallback, useSyncExternalStore } from "react";

/** localStorage-backed string state that is hydration safe (server + first client render use `initial`). */
export function usePersistentState(key: string, initial: string): [string, (value: string) => void] {
  const event = `persist:${key}`;
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener("storage", cb);
    window.addEventListener(event, cb);
    return () => {
      window.removeEventListener("storage", cb);
      window.removeEventListener(event, cb);
    };
  }, [event]);
  const getSnapshot = useCallback(() => {
    try { return localStorage.getItem(key) ?? initial; } catch { return initial; }
  }, [key, initial]);
  const value = useSyncExternalStore(subscribe, getSnapshot, () => initial);
  const set = useCallback((v: string) => {
    try { localStorage.setItem(key, v); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event(event));
  }, [key, event]);
  return [value, set];
}

const noop = () => () => {};
/** false during SSR/hydration, true afterwards. For widgets that cannot render on the server. */
export function useIsClient(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
