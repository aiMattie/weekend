"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { ChromeModal } from "./modal";

export interface ConfirmSpec { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => Promise<unknown> | unknown }

export function ConfirmDialog({ spec, onClose }: { spec: ConfirmSpec; onClose: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      await spec.onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
      setBusy(false);
    }
  };
  return (
    <ChromeModal id="confirm-dialog" title={spec.title} onClose={onClose} error={error} primary={{ text: spec.confirmLabel ?? t("common.yes"), onClick: () => void run(), disabled: busy, danger: spec.danger, testId: "confirm-ok" }}>
      <p style={{ margin: 0, fontSize: 14 }} data-testid="confirm-message">{spec.message}</p>
    </ChromeModal>
  );
}
