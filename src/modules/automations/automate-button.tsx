"use client";

import { Icon } from "@vibe/core";
import { Bolt } from "@vibe/icons";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { BoardFull } from "@/lib/board-types";
import { AutomationCenter } from "./automation-center";
import styles from "./automations.module.css";

/** "Automate" button in the board header; opens the Automation Center. */
export function AutomateButton({ board }: { board: BoardFull }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={styles.automateBtn} onClick={() => setOpen(true)} data-testid="automate-button">
        <Icon icon={Bolt} size={16} ignoreFocusStyle />{t("auto.automate")}
      </button>
      {open ? <AutomationCenter board={board} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
