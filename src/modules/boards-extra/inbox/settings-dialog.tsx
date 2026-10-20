"use client";

import { Modal, ModalContent, ModalFooter, ModalHeader, Toggle } from "@vibe/core";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import styles from "./inbox.module.css";
import type { NotificationSetting } from "./types";

/** Per event type in-app / e-mail toggles. Mount only when open (Vibe Modal needs `document`). */
export function SettingsDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [rows, setRows] = useState<NotificationSetting[] | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get<NotificationSetting[]>("/api/v1/inbox/settings").then(setRows).catch(() => setRows([])); }, []);
  const set = (type: string, key: "inApp" | "email", v: boolean) => setRows((r) => r?.map((x) => (x.eventType === type ? { ...x, [key]: v } : x)) ?? r);
  const save = async () => {
    if (!rows) return;
    setSaving(true);
    try { await api.put("/api/v1/inbox/settings", { settings: rows }); onSaved(); onClose(); } finally { setSaving(false); }
  };
  return (
    <Modal id="inbox-settings" show size="medium" onClose={onClose}>
      <ModalHeader title={t("inbox.settings")} />
      <ModalContent>
        <div data-testid="inbox-settings">
          <p style={{ marginTop: 0, color: "var(--app-text-secondary)" }}>{t("inbox.settingsIntro")}</p>
          <div className={styles.settingsGrid}>
            <span className={styles.settingsHead} />
            <span className={styles.settingsHead}>{t("inbox.inApp")}</span>
            <span className={styles.settingsHead}>{t("inbox.email")}</span>
            {rows?.map((r) => (
              <div key={r.eventType} style={{ display: "contents" }}>
                <span>{t(`inbox.event.${r.eventType}`)}</span>
                <span className={styles.toggleCell} data-testid={`setting-${r.eventType}-inapp`}><Toggle areLabelsHidden isSelected={r.inApp} onChange={(v: boolean) => set(r.eventType, "inApp", v)} aria-label={`${r.eventType} in-app`} /></span>
                <span className={styles.toggleCell} data-testid={`setting-${r.eventType}-email`}><Toggle areLabelsHidden isSelected={r.email} onChange={(v: boolean) => set(r.eventType, "email", v)} aria-label={`${r.eventType} email`} /></span>
              </div>
            ))}
          </div>
        </div>
      </ModalContent>
      <ModalFooter primaryButton={{ text: t("common.save"), onClick: save, disabled: saving || !rows, "data-testid": "inbox-settings-save" } as never} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
    </Modal>
  );
}
