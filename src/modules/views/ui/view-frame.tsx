"use client";

import { Icon } from "@vibe/core";
import { Settings } from "@vibe/icons";
import { useState, type ReactNode } from "react";
import type { ViewProps } from "@/components/views/types";
import { useT } from "@/lib/i18n/client";
import { hasSettings } from "../lib/settings";
import { ViewSettingsDialog } from "./settings-dialog";
import styles from "./views.module.css";

interface Props {
  props: ViewProps;
  settings: Record<string, unknown>;
  patch: (p: Record<string, unknown>) => void;
  /** view specific controls (calendar navigation, zoom ...) on the left of the bar */
  controls?: ReactNode;
  children: ReactNode;
  testId: string;
}

/** Common chrome of every non-table view: control bar with the "Settings" button + the content. */
export function ViewFrame({ props, settings, patch, controls, children, testId }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { view, board } = props;
  return (
    <div className={styles.frame} data-testid={testId} data-view-type={view.type}>
      <div className={styles.bar}>
        <div className={styles.barLeft}>{controls}</div>
        {hasSettings(view.type) ? (
          <button type="button" className={styles.barBtn} onClick={() => setOpen(true)} data-testid="view-settings-button">
            <Icon icon={Settings} size={16} ignoreFocusStyle />
            {t("vw.settings")}
          </button>
        ) : null}
      </div>
      <div className={styles.content}>{children}</div>
      <ViewSettingsDialog open={open} type={view.type} viewName={view.name} columns={board.columns} settings={settings} onSave={patch} onClose={() => setOpen(false)} />
    </div>
  );
}
