"use client";

import { Button } from "@vibe/core";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { BuilderProps } from "./agent-builder";
import s from "../ai.module.css";

const TYPES = ["item_created", "column_changed", "mention", "schedule"] as const;

export function BuilderTriggers({ agent, reload, boards }: BuilderProps) {
  const t = useT();
  const [type, setType] = useState<(typeof TYPES)[number]>("item_created");
  const [boardId, setBoardId] = useState("");
  const [labelText, setLabelText] = useState("");
  const [every, setEvery] = useState("weekday");
  const [time, setTime] = useState("08:00");
  const [weekday, setWeekday] = useState(1);
  const [err, setErr] = useState("");
  const add = async () => {
    setErr("");
    const config = type === "item_created" ? { boardId } : type === "column_changed" ? { boardId, ...(labelText ? { labelText } : {}) } : type === "schedule" ? { every, time, ...(every === "week" ? { weekday } : {}) } : {};
    try { await api.post(`/api/v1/ai/agents/${agent.id}/triggers`, { type, config }); reload(); } catch (e) { setErr(e instanceof Error ? e.message : t("ai.error")); }
  };
  const describe = (c: Record<string, unknown>, ty: string) => ty === "schedule" ? `${t(`ai.ag.trig.${String(c.every ?? "day")}`)} ${String(c.time ?? "")}` : c.boardId ? `${boards.find((b) => b.id === c.boardId)?.name ?? String(c.boardId)}${c.labelText ? ` → ${String(c.labelText)}` : ""}` : "";
  const toggle = async (id: string, active: boolean) => { await api.patch(`/api/v1/ai/agents/${agent.id}/triggers/${id}`, { active }); reload(); };
  const del = async (id: string) => { await api.del(`/api/v1/ai/agents/${agent.id}/triggers/${id}`); reload(); };
  return (
    <div data-testid="agent-triggers">
      <table className={s.table}><tbody>
        {agent.triggers.length ? agent.triggers.map((tr) => (
          <tr key={tr.id} data-testid="trigger-row"><td><strong>{t(`ai.ag.trig.${tr.type}`)}</strong></td><td className={s.muted}>{describe(tr.config, tr.type)}</td>
            <td style={{ textAlign: "right" }}>
              {tr.type !== "manual" ? <label className={s.hint} style={{ marginRight: 10 }}><input type="checkbox" checked={tr.active} onChange={(e) => void toggle(tr.id, e.target.checked)} /> actief</label> : null}
              {tr.type !== "manual" ? <Button size="xs" kind="tertiary" color="negative" onClick={() => void del(tr.id)} data-testid="trigger-delete">{t("common.delete")}</Button> : null}</td></tr>
        )) : <tr><td className={s.muted}>{t("ai.ag.trig.none")}</td></tr>}
      </tbody></table>
      <div className={s.panelBox} style={{ marginTop: 16 }}>
        <div className={s.row}>
          <select className={s.text} style={{ width: 240 }} value={type} onChange={(e) => setType(e.target.value as typeof type)} data-testid="trigger-type">{TYPES.map((x) => <option key={x} value={x}>{t(`ai.ag.trig.${x}`)}</option>)}</select>
          {type === "item_created" || type === "column_changed" ? <select className={s.text} style={{ width: 220 }} value={boardId} onChange={(e) => setBoardId(e.target.value)} aria-label={t("ai.ag.trig.board")} data-testid="trigger-board"><option value="">{t("ai.ag.trig.board")}...</option>{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select> : null}
          {type === "column_changed" ? <input className={s.text} style={{ width: 200 }} value={labelText} onChange={(e) => setLabelText(e.target.value)} placeholder={t("ai.ag.trig.label")} data-testid="trigger-label" /> : null}
          {type === "schedule" ? (<>
            <select className={s.text} style={{ width: 150 }} value={every} onChange={(e) => setEvery(e.target.value)} aria-label={t("ai.ag.trig.every")} data-testid="trigger-every">{["day", "weekday", "week"].map((x) => <option key={x} value={x}>{t(`ai.ag.trig.${x}`)}</option>)}</select>
            {every === "week" ? <select className={s.text} style={{ width: 130 }} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} aria-label={t("ai.ag.trig.weekdayPick")}>{["ma", "di", "wo", "do", "vr", "za", "zo"].map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select> : null}
            <input className={s.text} style={{ width: 110 }} type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t("ai.ag.trig.time")} data-testid="trigger-time" />
          </>) : null}
          <Button size="small" kind="primary" onClick={() => void add()} disabled={(type === "item_created" || type === "column_changed") && !boardId} data-testid="trigger-add">{t("ai.ag.trig.add")}</Button>
        </div>
        {err ? <div className={s.err} role="alert" style={{ marginTop: 8 }}>{err}</div> : null}
      </div>
    </div>
  );
}
