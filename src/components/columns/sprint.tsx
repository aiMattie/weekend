"use client";

import { useEffect, useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { useT } from "@/lib/i18n/client";
import { loadSprintOptions, type SprintOption } from "@/modules/dev/sprint-options";
import type { ColumnUi, EditorProps } from "./types";
import { LabelPill } from "./shared";
import styles from "./cells.module.css";

type V = { sprintId: string; name?: string };
const STATE_COLOR = { planned: "#579bfc", active: "#00c875", completed: "#c4c4c4" } as const;

function useSprints(boardId: string): SprintOption[] {
  const [opts, setOpts] = useState<SprintOption[]>([]);
  useEffect(() => {
    let live = true;
    void loadSprintOptions(boardId).then((o) => { if (live) setOpts(o); });
    return () => { live = false; };
  }, [boardId]);
  return opts;
}

function SprintEditor({ board, value, onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const opts = useSprints(board.board.id).filter((s) => s.state !== "completed" || s.id === value?.sprintId);
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <div className={styles.optionList} data-testid="sprint-editor">
        <button type="button" className={styles.option} onClick={() => onCommit(null)} data-testid="sprint-option-none">{t("dev.backlog")}</button>
        {opts.map((s) => (
          <button key={s.id} type="button" className={`${styles.option} ${s.id === value?.sprintId ? styles.optionSelected : ""}`} onClick={() => onCommit({ sprintId: s.id, name: s.name })} data-testid="sprint-option">
            <span>{s.name}</span>
          </button>
        ))}
      </div>
    </Popover>
  );
}

export const sprintUi: ColumnUi<V> = {
  align: "left",
  defaultWidth: 150,
  Cell: ({ value, board }) => {
    const opts = useSprints(board.board.id);
    if (!value) return <div className={styles.cell}><span className={styles.muted}>-</span></div>;
    const live = opts.find((s) => s.id === value.sprintId);
    return <div className={styles.cell}><LabelPill text={live?.name ?? value.name ?? value.sprintId} color={STATE_COLOR[live?.state ?? "planned"]} /></div>;
  },
  Editor: SprintEditor,
};
