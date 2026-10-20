"use client";

import { api } from "@/lib/api-client";

export interface SprintOption { id: string; name: string; state: "planned" | "active" | "completed"; startsOn: string | null; endsOn: string | null }

const cache = new Map<string, { at: number; p: Promise<SprintOption[]> }>();

/** Sprints that can be picked for tasks of `boardId` (short-lived client cache). */
export function loadSprintOptions(boardId: string, force = false): Promise<SprintOption[]> {
  const hit = cache.get(boardId);
  if (!force && hit && Date.now() - hit.at < 4000) return hit.p;
  const p = api.get<SprintOption[]>(`/api/v1/dev/boards/${boardId}/sprint-options`).catch(() => [] as SprintOption[]);
  cache.set(boardId, { at: Date.now(), p });
  return p;
}
