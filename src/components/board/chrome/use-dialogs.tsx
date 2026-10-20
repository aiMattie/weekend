"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { NamePrompt } from "@/components/shell/name-prompt";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { AddBoardDialog } from "./add-board-dialog";
import { DuplicateBoardDialog, MoveBoardDialog } from "./board-dialogs";
import { ConfirmDialog, type ConfirmSpec } from "./confirm-dialog";
import { notifyNavChanged } from "./ops";
import { FolderDialog, WorkspaceDialog } from "./workspace-dialogs";

export type DialogSpec =
  | { kind: "add-board"; workspaceId?: string; folderId?: string | null; onCreated: (boardId: string) => void }
  | { kind: "duplicate-board"; boardId: string; name: string; onDone: (newId: string) => void }
  | { kind: "move-board"; boardId: string; name: string; workspaceId: string; folderId: string | null; onDone: () => void }
  | { kind: "rename-board"; boardId: string; name: string; onDone: () => void }
  | { kind: "confirm"; spec: ConfirmSpec }
  | { kind: "workspace"; workspaceId?: string; onSaved: (id: string, created: boolean) => void }
  | { kind: "folder"; workspaceId: string; parentFolderId?: string | null; folder?: { id: string; name: string; color?: string | null }; onSaved: () => void };

/** Host for all board/workspace/folder dialogs. `open(spec)` shows one; `element` must be rendered once. */
export function useDialogs(): { open: (s: DialogSpec) => void; element: ReactNode } {
  const t = useT();
  const [spec, setSpec] = useState<DialogSpec | null>(null);
  const close = useCallback(() => setSpec(null), []);
  const element = useMemo<ReactNode>(() => {
    if (!spec) return null;
    switch (spec.kind) {
      case "add-board": return <AddBoardDialog workspaceId={spec.workspaceId} folderId={spec.folderId} onClose={close} onCreated={spec.onCreated} />;
      case "duplicate-board": return <DuplicateBoardDialog boardId={spec.boardId} name={spec.name} onClose={close} onDone={spec.onDone} />;
      case "move-board": return <MoveBoardDialog boardId={spec.boardId} name={spec.name} workspaceId={spec.workspaceId} folderId={spec.folderId} onClose={close} onDone={spec.onDone} />;
      case "confirm": return <ConfirmDialog spec={spec.spec} onClose={close} />;
      case "workspace": return <WorkspaceDialog workspaceId={spec.workspaceId} onClose={close} onSaved={spec.onSaved} />;
      case "folder": return <FolderDialog workspaceId={spec.workspaceId} parentFolderId={spec.parentFolderId} folder={spec.folder} onClose={close} onSaved={spec.onSaved} />;
      case "rename-board":
        return (
          <NamePrompt open title={t("common.rename")} initialValue={spec.name} onClose={close} onConfirm={(name) => {
            const done = spec.onDone;
            close();
            void api.patch(`/api/v1/boards/${spec.boardId}`, { name }).then(() => { notifyNavChanged(); done(); });
          }} />
        );
    }
  }, [spec, close, t]);
  return { open: setSpec, element };
}
