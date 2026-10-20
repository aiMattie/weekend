"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { archiveBoard, absoluteBoardUrl, copyText, deleteBoard, notifyNavChanged, toggleFavorite } from "@/components/board/chrome/ops";
import { useDialogs } from "@/components/board/chrome/use-dialogs";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { NamePrompt } from "./name-prompt";

type Prompt = { kind: "rename-folder"; id: string; name: string } | null;

/**
 * All sidebar mutations (create/rename/duplicate/move/archive/delete board, folder, workspace).
 * The dialogs themselves live in src/components/board/chrome (table-ux); this hook only wires them.
 */
export function useSidebarActions(onWorkspaceCreated: (id: string) => void) {
  const t = useT();
  const router = useRouter();
  const dialogs = useDialogs();
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<void>) => {
    try {
      setError(null);
      await fn();
      notifyNavChanged();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  }, [router, t]);

  const refresh = useCallback(() => router.refresh(), [router]);
  const confirm = (title: string, message: string, confirmLabel: string, onConfirm: () => Promise<unknown>) =>
    dialogs.open({ kind: "confirm", spec: { title, message, confirmLabel, danger: true, onConfirm: async () => { await onConfirm(); notifyNavChanged(); router.refresh(); } } });

  const dialog = (
    <>
      {dialogs.element}
      <NamePrompt
        open={!!prompt}
        title={t("common.rename")}
        initialValue={prompt?.name ?? ""}
        onConfirm={(name) => {
          const p = prompt;
          setPrompt(null);
          if (p) void run(async () => { await api.patch(`/api/v1/folders/${p.id}`, { name }); });
        }}
        onClose={() => setPrompt(null)}
      />
    </>
  );

  return {
    dialog,
    error,
    newBoard: (workspaceId: string, folderId?: string | null) => dialogs.open({ kind: "add-board", workspaceId, folderId, onCreated: (id) => { router.push(`/boards/${id}`); router.refresh(); } }),
    newFolder: (workspaceId: string, parentFolderId?: string | null) => dialogs.open({ kind: "folder", workspaceId, parentFolderId, onSaved: refresh }),
    editFolder: (workspaceId: string, folder: { id: string; name: string; color?: string | null }) => dialogs.open({ kind: "folder", workspaceId, folder, onSaved: refresh }),
    newWorkspace: () => dialogs.open({ kind: "workspace", onSaved: (id) => { onWorkspaceCreated(id); router.push(`/workspaces/${id}`); router.refresh(); } }),
    editWorkspace: (id: string) => dialogs.open({ kind: "workspace", workspaceId: id, onSaved: refresh }),
    archiveWorkspace: (id: string, name: string) => confirm(t("chrome.archiveWorkspaceTitle"), t("chrome.archiveWorkspaceMessage", { name }), t("common.archive"), async () => { await api.post(`/api/v1/workspaces/${id}/archive`, {}); router.push("/"); }),
    deleteWorkspace: (id: string, name: string) => confirm(t("chrome.deleteWorkspaceTitle"), t("chrome.deleteWorkspaceMessage", { name }), t("common.delete"), async () => { await api.del(`/api/v1/workspaces/${id}`); router.push("/"); }),
    renameBoard: (id: string, name: string) => dialogs.open({ kind: "rename-board", boardId: id, name, onDone: refresh }),
    renameFolder: (id: string, name: string) => setPrompt({ kind: "rename-folder", id, name }),
    duplicateBoard: (id: string, name: string) => dialogs.open({ kind: "duplicate-board", boardId: id, name, onDone: (newId) => { router.push(`/boards/${newId}`); router.refresh(); } }),
    moveBoard: (id: string, name: string, workspaceId: string, folderId: string | null) => dialogs.open({ kind: "move-board", boardId: id, name, workspaceId, folderId, onDone: refresh }),
    archiveBoard: (id: string, name: string) => confirm(t("chrome.archiveTitle"), t("chrome.archiveMessage", { name }), t("common.archive"), async () => { await archiveBoard(id); router.push("/"); }),
    deleteBoard: (id: string, name: string) => confirm(t("chrome.deleteTitle"), t("chrome.deleteMessage", { name }), t("common.delete"), async () => { await deleteBoard(id); router.push("/"); }),
    deleteFolder: (id: string, name: string) => confirm(t("chrome.deleteFolderTitle"), t("chrome.deleteFolderMessage", { name }), t("common.delete"), async () => { await api.del(`/api/v1/folders/${id}`); }),
    toggleFavorite: (id: string) => run(async () => { await toggleFavorite(id); }),
    copyLink: (id: string) => copyText(absoluteBoardUrl(id)),
    openInNewTab: (id: string) => window.open(`/boards/${id}`, "_blank", "noopener"),
  };
}

export type SidebarActions = ReturnType<typeof useSidebarActions>;
