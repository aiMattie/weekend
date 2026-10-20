"use client";

import { Modal, ModalContent, ModalHeader } from "@vibe/core";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import styles from "./chrome.module.css";

interface Props {
  id: string;
  title: string;
  size?: "small" | "medium" | "large";
  onClose: () => void;
  children: ReactNode;
  /** footer primary action */
  primary?: { text: string; onClick: () => void; disabled?: boolean; danger?: boolean; testId?: string };
  secondaryText?: string;
  error?: string | null;
  testId?: string;
}

/**
 * Dialog used by every chrome dialog. Vibe's Modal touches `document` while rendering, so this
 * component must only be mounted while the dialog is open (the dialog host does that).
 */
export function ChromeModal({ id, title, size = "small", onClose, children, primary, secondaryText, error, testId }: Props) {
  const t = useT();
  return (
    <Modal id={id} show size={size} onClose={onClose} data-testid={testId ?? id}>
      <div className={styles.modalBody}>
      <ModalHeader title={title} />
      <ModalContent>
        {children}
        {error ? <div className={styles.error} role="alert" data-testid="dialog-error" style={{ marginTop: 10 }}>{error}</div> : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button type="button" className={styles.btn} onClick={onClose} data-testid="dialog-cancel">{secondaryText ?? t("common.cancel")}</button>
          {primary ? (
            <button type="button" className={`${styles.btn} ${primary.danger ? styles.btnDanger : styles.btnPrimary}`} disabled={primary.disabled} onClick={primary.onClick} data-testid={primary.testId ?? "dialog-confirm"}>
              {primary.text}
            </button>
          ) : null}
        </div>
      </ModalContent>
      </div>
    </Modal>
  );
}
