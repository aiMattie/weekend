"use client";

import { useEffect, useRef } from "react";

/** Subscribes to /api/events/:boardId (SSE) and calls `onEvent` for every board event. */
export function useBoardEvents(boardId: string, onEvent: () => void): void {
  const cb = useRef(onEvent);
  useEffect(() => {
    cb.current = onEvent;
  });
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/events/${boardId}`);
    es.onmessage = () => cb.current();
    // after a reconnect we may have missed events
    es.onopen = () => cb.current();
    return () => es.close();
  }, [boardId]);
}
