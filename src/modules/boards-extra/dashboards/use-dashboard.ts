"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { ColumnsPayload, DashboardPayload, WidgetResultDto } from "./types";

/** Loads a dashboard + its widget data and keeps the data fresh: SSE per board (debounced), focus and a slow poll. */
export function useDashboard(id: string) {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [data, setData] = useState<Record<string, WidgetResultDto>>({});
  const [columns, setColumns] = useState<ColumnsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const r = await api.get<{ data: Record<string, WidgetResultDto> }>(`/api/v1/dashboards/${id}/data`);
      setData(r.data);
      setRefreshedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    }
  }, [id]);

  const loadAll = useCallback(async () => {
    try {
      const [p, cols] = await Promise.all([api.get<DashboardPayload>(`/api/v1/dashboards/${id}`), api.get<ColumnsPayload>(`/api/v1/dashboards/${id}/columns`)]);
      setPayload(p);
      setColumns(cols);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    }
  }, [id, loadData]);

  // initial fetch: setState happens after the awaited requests, not synchronously
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadAll(); }, [loadAll]);

  const boardKey = payload?.dashboard.boardIds.join(",") ?? "";
  useEffect(() => {
    if (!boardKey) return;
    const schedule = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => void loadData(), 400); };
    const sources = boardKey.split(",").map((b) => { const es = new EventSource(`/api/events/${b}`); es.onmessage = schedule; return es; });
    const onFocus = () => void loadData();
    window.addEventListener("focus", onFocus);
    const poll = setInterval(() => void loadData(), 60_000);
    return () => { sources.forEach((s) => s.close()); window.removeEventListener("focus", onFocus); clearInterval(poll); if (timer.current) clearTimeout(timer.current); };
  }, [boardKey, loadData]);

  return { payload, setPayload, data, columns, error, reload: loadAll, reloadData: loadData, refreshedAt };
}
