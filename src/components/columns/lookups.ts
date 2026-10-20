"use client";

/** Tiny client caches for names that values only reference by id (tags, linked items). */
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

export type TagDto = { id: string; name: string; color: string };

const tagCache = new Map<string, TagDto>();
let allTags: TagDto[] | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const rememberTags = (list: TagDto[]): void => { for (const t of list) tagCache.set(t.id, t); };
export const tagById = (id: string): TagDto | undefined => tagCache.get(id);

/** All account tags (fetched once, refreshed after creating one). */
export function useAllTags(enabled = true): { tags: TagDto[]; refresh: () => Promise<void>; create: (name: string) => Promise<TagDto> } {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const refresh = async () => {
    allTags = await api.get<TagDto[]>("/api/v1/tags");
    rememberTags(allTags);
    notify();
  };
  useEffect(() => {
    if (enabled && allTags === null) void refresh();
  }, [enabled]);
  const create = async (name: string) => {
    const t = await api.post<TagDto>("/api/v1/tags", { name });
    rememberTags([t]);
    await refresh();
    return t;
  };
  return { tags: allTags ?? [], refresh, create };
}

/** item id -> name memory for relation cells right after picking (before the board refetch decorates the value). */
const itemNames = new Map<string, { name: string; boardId: string }>();
export const rememberItem = (id: string, name: string, boardId: string): void => { itemNames.set(id, { name, boardId }); };
export const rememberedItem = (id: string) => itemNames.get(id);
