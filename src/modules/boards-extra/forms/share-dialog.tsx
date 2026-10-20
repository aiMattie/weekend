"use client";

import { Button, Modal, ModalContent, ModalFooter, ModalHeader, TextField } from "@vibe/core";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import styles from "./forms.module.css";
import { embedCode } from "./logic";

interface Props { token: string; published: boolean; canEdit: boolean; onNewLink: () => void; onClose: () => void }

function CopyButton({ text, testId }: { text: string; testId: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <Button kind="secondary" size="small" data-testid={testId} onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked: the text stays selectable */ }
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }}>{done ? t("forms.copied") : t("forms.copy")}</Button>
  );
}

/** Link + embed code dialog. Mounts only when open (Vibe Modal cannot render during SSR). */
export function ShareDialog({ token, published, canEdit, onNewLink, onClose }: Props) {
  const t = useT();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/f/${token}`;
  const embed = embedCode(origin, token);
  return (
    <Modal id="share-form" show size="medium" onClose={onClose}>
      <ModalHeader title={t("forms.shareTitle")} />
      <ModalContent>
        <div className={styles.dialogBody} data-testid="share-dialog">
          {!published && <div className={styles.warn} data-testid="share-unpublished">{t("forms.notPublished")}</div>}
          <div className={styles.fieldLabel}>{t("forms.link")}
            <div className={styles.shareBox}>
              <TextField value={url} readonly onChange={() => undefined} data-testid="share-link" />
              <CopyButton text={url} testId="copy-link" />
            </div>
          </div>
          <div className={styles.fieldLabel}>{t("forms.embed")}
            <textarea className={styles.codeBox} readOnly value={embed} data-testid="share-embed" />
            <div><CopyButton text={embed} testId="copy-embed" /></div>
          </div>
          {canEdit && <div><Button kind="tertiary" size="small" onClick={onNewLink} data-testid="new-link">{t("forms.newLink")}</Button></div>}
        </div>
      </ModalContent>
      <ModalFooter primaryButton={{ text: t("common.close"), onClick: onClose }} />
    </Modal>
  );
}
