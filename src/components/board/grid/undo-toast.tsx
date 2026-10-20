"use client";

import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { useIsClient } from "@/lib/use-persistent-state";
import { useBoardRuntime } from "./runtime-store";
import styles from "./grid.module.css";

/** Bottom-left toast: "Ongedaan gemaakt: <label>" with redo link; also shows the undo/redo availability as data attributes for tests. */
export function UndoToast({ boardId, onUndo, onRedo }: { boardId: string; onUndo: () => void; onRedo: () => void }) {
  const t = useT();
  const mounted = useIsClient();
  const { toast, undo } = useBoardRuntime(boardId);
  if (!mounted || !toast) return null;
  return createPortal(
    <div className={`${styles.toast} ${toast.kind === "error" ? styles.toastError : ""}`} role="status" data-testid="undo-toast" data-can-undo={undo.canUndo} data-can-redo={undo.canRedo}>
      <span>{toast.text}</span>
      {toast.kind === "info" && undo.canRedo ? <button type="button" onClick={onRedo} data-testid="toast-redo">{t("undo.redo")}</button> : null}
      {toast.kind === "info" && undo.canUndo && !undo.canRedo ? <button type="button" onClick={onUndo} data-testid="toast-undo">{t("undo.undo")}</button> : null}
    </div>,
    document.body,
  );
}
