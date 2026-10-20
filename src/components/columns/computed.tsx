"use client";

import { useLocale } from "@/lib/i18n/client";
import { getColumnLogic } from "@/server/columns/registry";
import type { FormulaValue } from "@/server/columns/computed/formula";
import { formatFormula } from "@/server/columns/computed/formula";
import type { MirrorValue } from "@/server/columns/computed/mirror";
import { mirrorText } from "@/server/columns/computed/mirror";
import type { ProgressValue } from "@/server/columns/computed/progress";
import type { LogValue } from "@/server/columns/computed/log";
import { statusLabels } from "@/server/columns/labels";
import { peopleUi } from "./people";
import { LabelPill, UserAvatar, userById } from "./shared";
import type { ColumnUi } from "./types";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

/* ---------------------------------------------------------------- mirror */

export const mirrorUi: ColumnUi<MirrorValue> = {
  align: "left",
  defaultWidth: 180,
  Cell: function MirrorCell({ value, board }) {
    if (!value || !value.column) return <div className={styles.cell} />;
    const target = value.column;
    if (value.result !== null) return <div className={`${styles.cell} ${styles.center}`} data-testid="mirror-cell"><b>{mirrorText(value)}</b></div>;
    const logic = getColumnLogic(target.type);
    return (
      <div className={styles.cell} data-testid="mirror-cell">
        <div className={pack.mirrorList}>
          {value.entries.map((e) => {
            if (e.value === null || e.value === undefined) return null;
            if (target.type === "status") {
              const idx = (e.value as { index: number }).index;
              const l = statusLabels(target.settings).find((x) => x.id === idx);
              return l ? <LabelPill key={e.itemId} text={l.text} color={l.color} /> : null;
            }
            if (target.type === "people") {
              const people = ((e.value as { personsAndTeams: { id: string }[] }).personsAndTeams).map((p) => userById(board, p.id)).filter(Boolean);
              return <span key={e.itemId} className={styles.avatars}>{people.map((u) => <UserAvatar key={u!.id} user={u!} />)}</span>;
            }
            const text = logic.format(e.value as never, target);
            return text ? <span key={e.itemId} className={pack.chip} title={e.name}>{text}</span> : null;
          })}
        </div>
      </div>
    );
  },
};

/* ---------------------------------------------------------------- formula */

export const formulaUi: ColumnUi<FormulaValue> = {
  align: "left",
  defaultWidth: 140,
  Cell: ({ value, column }) => {
    if (!value) return <div className={styles.cell} />;
    if (value.error) return <div className={styles.cell}><span className={pack.err2} title={value.error} data-testid="formula-error">#ERROR</span></div>;
    const text = value.kind === "boolean" ? (value.value ? "✓" : "✗") : formatFormula(value, column.settings);
    return <div className={`${styles.cell} ${value.kind === "number" ? pack.right : ""}`} data-testid="formula-value">{text}</div>;
  },
};

/* ---------------------------------------------------------------- progress */

export const progressUi: ColumnUi<ProgressValue> = {
  align: "center",
  defaultWidth: 150,
  Cell: ({ value }) => (
    <div className={styles.cell} title={value ? `${value.done}/${value.total}` : undefined}>
      {value ? (
        <div className={styles.progress} data-testid="progress-cell">
          <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${value.percent}%` }} /></div>
          <span className={styles.progressText}>{value.percent}%</span>
        </div>
      ) : null}
    </div>
  ),
};

/* ---------------------------------------------------------------- simple ones */

export const autoNumberUi: ColumnUi<number> = {
  align: "center",
  defaultWidth: 110,
  Cell: ({ value, column }) => <div className={`${styles.cell} ${styles.center}`} data-testid="auto-number">{getColumnLogic("auto_number").format(value, column)}</div>,
};

export const itemIdUi: ColumnUi<string> = {
  align: "center",
  defaultWidth: 120,
  Cell: ({ value }) => <div className={`${styles.cell} ${styles.center}`} data-testid="item-id">{value ?? ""}</div>,
};

function LogCell({ value, board }: { value: LogValue | null; board: Parameters<typeof userById>[0] }) {
  const locale = useLocale();
  if (!value) return <div className={styles.cell} />;
  const user = value.userId ? userById(board, value.userId) : undefined;
  const d = new Date(value.at);
  const text = d.toLocaleString(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className={`${styles.cell} ${styles.center}`} title={user ? `${user.name} - ${value.at}` : value.at}>
      {user ? <UserAvatar user={user} size="xs" /> : null}
      <span style={{ marginLeft: 6, fontSize: 13 }}>{text}</span>
    </div>
  );
}

export const creationLogUi: ColumnUi<LogValue> = { align: "center", defaultWidth: 190, Cell: ({ value, board }) => <LogCell value={value} board={board} /> };
export const lastUpdatedUi: ColumnUi<LogValue> = { align: "center", defaultWidth: 190, Cell: ({ value, board }) => <LogCell value={value} board={board} /> };

/** Same look as people, never editable. */
export const itemAssigneesUi: ColumnUi = { align: "center", defaultWidth: 130, Cell: peopleUi.Cell as ColumnUi["Cell"] };
