/** Plain client helpers for board / workspace / folder operations (REST via /api/v1). */
import { api } from "@/lib/api-client";

export const NAV_EVENT = "weekend:nav-changed";
export const notifyNavChanged = () => window.dispatchEvent(new Event(NAV_EVENT));

export const boardUrl = (id: string) => `/boards/${id}`;
export const absoluteBoardUrl = (id: string) => `${window.location.origin}${boardUrl(id)}`;

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export interface DuplicateOptions { name?: string; withItems?: boolean; withUpdates?: boolean }
export const duplicateBoard = (id: string, o: DuplicateOptions) => api.post<{ id: string }>(`/api/v1/boards/${id}/duplicate`, o);
export const moveBoard = (id: string, to: { workspaceId: string; folderId: string | null }) => api.post(`/api/v1/boards/${id}/move`, to);
export const archiveBoard = (id: string) => api.post(`/api/v1/boards/${id}/archive`, {});
export const deleteBoard = (id: string) => api.del(`/api/v1/boards/${id}`);
export const toggleFavorite = (id: string) => api.post<boolean>(`/api/v1/boards/${id}/favorite`, {});

/** Download the board as xlsx/csv (optionally limited to items / a group). */
export async function exportBoardFile(boardId: string, body: { format: "xlsx" | "csv"; itemIds?: string[]; groupId?: string }): Promise<void> {
  const res = await fetch(`/api/v1/boards/${boardId}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(j?.error?.message ?? res.statusText);
  }
  const name = decodeURIComponent(res.headers.get("X-Filename") ?? `board.${body.format}`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
