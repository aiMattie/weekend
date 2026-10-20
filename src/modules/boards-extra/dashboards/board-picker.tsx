"use client";

import { Search } from "@vibe/core";
import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n/client";
import styles from "./dashboards.module.css";

export interface PickBoard { id: string; name: string; workspaceName: string }

/** board picker: searchable checklist of boards grouped by workspace (multi select = cross-board). */
export function BoardPicker({ boards, value, onChange }: { boards: PickBoard[]; value: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const m = new Map<string, PickBoard[]>();
    for (const b of boards) if (!q.trim() || b.name.toLowerCase().includes(q.trim().toLowerCase())) m.set(b.workspaceName, [...(m.get(b.workspaceName) ?? []), b]);
    return [...m.entries()];
  }, [boards, q]);
  return (
    <div className={styles.pickers} data-testid="board-picker">
      <Search value={q} onChange={setQ} placeholder={t("dashboards.searchBoards")} size="small" />
      <div className={styles.checkList} style={{ maxHeight: 280 }}>
        {groups.map(([ws, bs]) => (
          <div key={ws}>
            <div className={styles.muted} style={{ padding: "6px 0 2px", fontWeight: 600 }}>{ws}</div>
            {bs.map((b) => (
              <label key={b.id} className={styles.checkRow}>
                <input type="checkbox" checked={value.includes(b.id)} onChange={() => onChange(value.includes(b.id) ? value.filter((x) => x !== b.id) : [...value, b.id])} data-testid={`pick-board-${b.name}`} />
                {b.name}
              </label>
            ))}
          </div>
        ))}
        {!groups.length && <div className={styles.muted} style={{ padding: 8 }}>{t("shell.noBoards")}</div>}
      </div>
      <div className={styles.muted}>{t("dashboards.boardsSelected", { n: value.length })}</div>
    </div>
  );
}
