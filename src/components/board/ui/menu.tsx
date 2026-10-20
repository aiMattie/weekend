"use client";

import type { ReactNode } from "react";
import { Popover } from "./popover";
import styles from "./ui.module.css";

export interface MenuEntry {
  key?: string;
  label?: string;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
  /** small grey heading */
  title?: string;
  active?: boolean;
  testId?: string;
}

/** Simple action menu in a popover. Closes itself after an item is clicked. */
export function ActionMenu({ anchorEl, onClose, items, align }: { anchorEl: HTMLElement | null; onClose: () => void; items: MenuEntry[]; align?: "start" | "end" }) {
  return (
    <Popover anchorEl={anchorEl} onClose={onClose} align={align}>
      <div className={styles.menu} role="menu">
        {items.map((it, i) =>
          it.divider ? (
            <div key={i} className={styles.menuDivider} />
          ) : it.title ? (
            <div key={i} className={styles.menuTitle}>{it.title}</div>
          ) : (
            <button
              key={it.key ?? i}
              role="menuitem"
              type="button"
              disabled={it.disabled}
              data-testid={it.testId}
              className={`${styles.menuItem} ${it.danger ? styles.danger : ""} ${it.active ? styles.menuActive : ""}`}
              onClick={() => {
                onClose();
                it.onClick?.();
              }}
            >
              {it.icon ? <span className={styles.menuIcon}>{it.icon}</span> : null}
              <span>{it.label}</span>
            </button>
          ),
        )}
      </div>
    </Popover>
  );
}
