"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";

/** Subscribe to the SSE streams of several boards; `cb` is debounced. */
export function useBoardsEvents(boardIds: string[], cb: () => void): void {
  const ref = useRef(cb);
  useEffect(() => { ref.current = cb; });
  const key = [...new Set(boardIds)].sort().join(",");
  useEffect(() => {
    if (typeof EventSource === "undefined" || !key) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => ref.current(), 200); };
    const sources = key.split(",").map((id) => { const es = new EventSource(`/api/events/${id}`); es.onmessage = fire; return es; });
    return () => { if (timer) clearTimeout(timer); sources.forEach((s) => s.close()); };
  }, [key]);
}

/**
 * GET `url` and keep it fresh: reloads on SSE events of `boardId` and of every board in `watch(data)`
 * (the task boards a sprint board plans). Returns `setData` for optimistic updates.
 */
export function useDevData<T>(url: string, boardId: string, watch?: (d: T) => string[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const urlRef = useRef(url);
  const watchRef = useRef(watch);
  useEffect(() => { urlRef.current = url; watchRef.current = watch; });
  const reload = useCallback(async () => {
    try {
      const d = await api.get<T>(urlRef.current);
      setData(d);
      setError(null);
      const w = watchRef.current?.(d) ?? [];
      setExtra((cur) => (cur.join(",") === w.join(",") ? cur : w));
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    }
  }, []);
  useEffect(() => { void reload(); }, [reload, url]);
  useBoardsEvents([boardId, ...extra], () => void reload());
  return { data, setData, error, reload };
}
