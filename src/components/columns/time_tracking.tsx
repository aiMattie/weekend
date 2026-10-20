"use client";

import { Icon } from "@vibe/core";
import { Pause, Play } from "@vibe/icons";
import { useEffect, useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { formatDuration, totalSeconds, type TimeValue } from "@/server/columns/time_tracking";
import type { CellContext, ColumnUi, EditorProps } from "./types";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

const action = (ctx: CellContext, body: Record<string, unknown>) => api.post(`/api/v1/items/${ctx.item.id}/values/${ctx.column.id}/action`, body);

function useTick(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [running]);
  return now;
}

function TimeEditor({ value, onCancel, anchorEl, ...ctx }: EditorProps<TimeValue> & CellContext) {
  const t = useT();
  const [h, setH] = useState("");
  const [m, setM] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const sessions = value?.additional_value ?? [];
  const add = async () => {
    const seconds = Math.round((Number(h || 0) * 60 + Number(m || 0)) * 60);
    if (seconds <= 0) return setErr(t("col.time.invalid"));
    setErr(null);
    try { await action(ctx, { action: "add", seconds }); setH(""); setM(""); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const nameOf = (id: string | null) => ctx.board.users.find((u) => u.id === id)?.name ?? "";
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <div className={styles.popPanel} style={{ minWidth: 300 }} data-testid="time-editor">
        <div className={pack.sectionTitle} style={{ margin: 0 }}>{t("col.time.total")}: <b data-testid="time-total">{formatDuration(totalSeconds(value))}</b></div>
        <div className={pack.inline2}>
          <input className={pack.numInput} type="number" min={0} placeholder="h" value={h} data-testid="time-hours" onChange={(e) => setH(e.target.value)} />
          <input className={pack.numInput} type="number" min={0} placeholder="min" value={m} data-testid="time-minutes" onChange={(e) => setM(e.target.value)} />
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} data-testid="time-add" disabled={ctx.readOnly} onClick={() => void add()}>{t("col.time.add")}</button>
        </div>
        {err ? <span className={pack.err2}>{err}</span> : null}
        <div style={{ maxHeight: 200, overflow: "auto" }}>
          {sessions.slice().reverse().map((s) => (
            <div key={s.id} className={pack.sessionRow} data-testid="time-session">
              <span>{s.started_at.slice(0, 16).replace("T", " ")} {nameOf(s.started_user_id)}{s.manually_entered ? " *" : ""}</span>
              <span>{formatDuration((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000)}</span>
              {!ctx.readOnly ? <button type="button" className={pack.iconBtn} aria-label={t("common.delete")} onClick={() => void action(ctx, { action: "remove", id: s.id })}>x</button> : null}
            </div>
          ))}
        </div>
      </div>
    </Popover>
  );
}

export const timeTrackingUi: ColumnUi<TimeValue> = {
  align: "center",
  defaultWidth: 150,
  Cell: function TimeCell({ value, readOnly, ...ctx }) {
    const running = !!value?.running;
    const now = useTick(running);
    const [busy, setBusy] = useState(false);
    const toggle = (e: React.MouseEvent) => {
      e.stopPropagation();
      setBusy(true);
      void action({ ...ctx, readOnly } as CellContext, { action: running ? "stop" : "start" }).finally(() => setBusy(false));
    };
    return (
      <div className={`${styles.cell} ${styles.center}`}>
        <span className={pack.timeCell}>
          <button type="button" className={`${pack.timeBtn} ${running ? pack.timeBtnRunning : ""}`} disabled={readOnly || busy} onClick={toggle} aria-label={running ? "stop" : "start"} data-testid={running ? "time-stop" : "time-start"}>
            <Icon icon={running ? Pause : Play} size={14} ignoreFocusStyle />
          </button>
          <span className={pack.timeText} data-testid="time-text">{formatDuration(totalSeconds(value, now))}</span>
        </span>
      </div>
    );
  },
  Editor: TimeEditor,
};
