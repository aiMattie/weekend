"use client";

import { Modal, ModalContent, ModalFooter, ModalHeader, TextField } from "@vibe/core";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import styles from "../toolbar.module.css";

interface Props {
  dirty: boolean;
  canSaveToView: boolean;
  canShare: boolean;
  defaultName: string;
  onSaveAsNew: (name: string, personal: boolean) => Promise<unknown>;
  onSaveToView: () => Promise<unknown>;
  onDiscard: () => void;
  /** the dialog can also be opened from the toolbar popovers */
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
}

/** strip below the toolbar: shown while the toolbar state differs from the saved view. */
export function SavedViewBar({ dirty, canSaveToView, canShare, defaultName, onSaveAsNew, onSaveToView, onDiscard, dialogOpen, onDialogOpenChange }: Props) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!dirty) return null;
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : t("view.saveFailed")); } finally { setBusy(false); }
  };
  return (
    <div className={styles.savedBar} data-testid="saved-view-bar" role="status">
      <span className={styles.savedBarText}>{t("view.unsavedChanges")}</span>
      <button type="button" className={`${styles.savedBtn} ${styles.savedBtnGhost}`} onClick={onDiscard} disabled={busy} data-testid="discard-view-changes">{t("view.discard")}</button>
      {canSaveToView ? <button type="button" className={styles.savedBtn} onClick={() => void run(onSaveToView)} disabled={busy} data-testid="save-to-view">{t("view.saveToThis")}</button> : null}
      <button type="button" className={`${styles.savedBtn} ${styles.savedBtnPrimary}`} onClick={() => onDialogOpenChange(true)} disabled={busy} data-testid="save-as-new-view">{t("view.saveAsNew")}</button>
      {error ? <div className={styles.savedError} role="alert" data-testid="saved-view-error">{error}</div> : null}
      {dialogOpen ? (
        <SaveDialog
          canShare={canShare}
          defaultName={defaultName}
          onClose={() => onDialogOpenChange(false)}
          onConfirm={(name, personal) => { onDialogOpenChange(false); void run(() => onSaveAsNew(name, personal)); }}
        />
      ) : null}
    </div>
  );
}

function SaveDialog({ canShare, defaultName, onClose, onConfirm }: { canShare: boolean; defaultName: string; onClose: () => void; onConfirm: (name: string, personal: boolean) => void }) {
  const t = useT();
  const [name, setName] = useState(defaultName);
  const [personal, setPersonal] = useState(true);
  const submit = () => { const n = name.trim(); if (n) onConfirm(n, personal || !canShare); };
  // Vibe Modal renders only while open (it touches `document` on SSR)
  return (
    <Modal id="save-view-dialog" show size="small" onClose={onClose}>
      <ModalHeader title={t("view.saveDialogTitle")} />
      <ModalContent>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} data-testid="save-view-dialog">
          <label className={styles.dialogLabel}>{t("view.nameLabel")}</label>
          <TextField value={name} onChange={setName} autoFocus size="medium" placeholder={t("view.namePlaceholder")} data-testid="view-name-input" />
          <label className={styles.dialogToggle}>
            <input type="checkbox" checked={personal || !canShare} disabled={!canShare} onChange={(e) => setPersonal(e.target.checked)} data-testid="view-personal-toggle" />
            {t("view.personalToggle")}
          </label>
          <div className={styles.dialogHint}>{canShare ? t("view.personalHint") : t("view.sharedNeedsRights")}</div>
        </form>
      </ModalContent>
      <ModalFooter primaryButton={{ text: t("common.save"), onClick: submit, "data-testid": "view-save-confirm" } as never} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
    </Modal>
  );
}
