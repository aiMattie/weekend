"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentUser } from "@/components/shell/user-context";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { TimeEntryDto } from "@/server/services/time-entries";
import type { PanelTabProps } from "@/components/item-panel/tabs";
import styles from "./dev.module.css";

const fmt = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

/** Item panel tab "Uren": worklog per item (time entries). Facturatie blijft op het bord Urenregistratie. */
export function TimeTab({ item, canEdit, refreshKey }: PanelTabProps) {
  const t = useT();
  const me = useCurrentUser();
  const [data, setData] = useState<{ entries: TimeEntryDto[]; totalMinutes: number; billableMinutes: number } | null>(null);
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState("");
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await api.get(`/api/v1/items/${item.id}/time-entries`)); } catch { setData({ entries: [], totalMinutes: 0, billableMinutes: 0 }); }
  }, [item.id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load, refreshKey]);

  const add = async () => {
    const h = Number(hours.replace(",", "."));
    if (!Number.isFinite(h) || h <= 0) { setError(t("dev.time.invalid")); return; }
    try {
      await api.post(`/api/v1/items/${item.id}/time-entries`, { hours: h, date, description: desc || null, billable });
      setHours(""); setDesc(""); setError(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className={styles.tab} data-testid="time-tab">
      <div className={styles.total} data-testid="time-total">{t("dev.time.total")}: {fmt(data?.totalMinutes ?? 0)} u <span className={styles.muted}>({t("dev.time.billable")}: {fmt(data?.billableMinutes ?? 0)})</span></div>
      {canEdit ? (
        <form className={styles.timeForm} onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <input className={styles.input} value={hours} onChange={(e) => setHours(e.target.value)} placeholder={t("dev.time.hours")} inputMode="decimal" data-testid="time-hours" aria-label={t("dev.time.hours")} />
          <input className={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="time-date" aria-label={t("dev.time.date")} />
          <input className={styles.input} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("dev.time.description")} data-testid="time-description" aria-label={t("dev.time.description")} />
          <label className={`${styles.wide} ${styles.muted}`} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />{t("dev.time.billableToggle")}</label>
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary} ${styles.wide}`} data-testid="time-add">{t("dev.time.add")}</button>
        </form>
      ) : null}
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {data?.entries.length === 0 ? <div className={styles.muted}>{t("dev.time.empty")}</div> : null}
      {data?.entries.map((e) => (
        <div key={e.id} className={styles.entry} data-testid="time-entry">
          <span className={styles.muted}>{e.date}</span>
          <div className={styles.entryMain}>{e.userName ?? "-"}{e.description ? <span className={styles.muted}> · {e.description}</span> : null}{e.billable ? null : <span className={styles.muted}> · {t("dev.time.nonBillable")}</span>}</div>
          <strong>{fmt(e.minutes)}</strong>
          {canEdit && (e.userId === me.id || me.role === "admin") && !e.syncedAt ? <button type="button" className={styles.btn} onClick={() => void api.del(`/api/v1/time-entries/${e.id}`).then(load)} data-testid="time-delete" aria-label={t("common.delete")}>x</button> : null}
        </div>
      ))}
    </div>
  );
}
