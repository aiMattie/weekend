"use client";

import { Button } from "@vibe/core";
import { useT } from "@/lib/i18n/client";
import styles from "./views.module.css";

interface Props {
  /** i18n key of the explanation */
  messageKey: string;
  /** column type to offer to create (when the user may edit the structure) */
  createType?: string;
  createTitle?: string;
  canCreate: boolean;
  onCreate?: () => void;
  testId?: string;
}

/** Shown when a view needs a column the board does not have yet. */
export function EmptyConfig({ messageKey, createType, createTitle, canCreate, onCreate, testId = "view-empty-config" }: Props) {
  const t = useT();
  return (
    <div className={styles.emptyConfig} data-testid={testId}>
      <div className={styles.emptyTitle}>{t(messageKey)}</div>
      {canCreate && createType && onCreate ? (
        <Button size="small" onClick={onCreate} data-testid="empty-config-create">{t("vw.addColumn", { title: createTitle ?? createType })}</Button>
      ) : null}
    </div>
  );
}
