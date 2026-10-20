"use client";

import { useEffect, useMemo, useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { useT } from "@/lib/i18n/client";
import { clockTime } from "@/server/columns/world_clock";
import type { ColumnUi, EditorProps } from "./types";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

type V = { timezone: string };

function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return now;
}

const city = (tz: string) => tz.split("/").slice(-1)[0].replace(/_/g, " ");

function ClockEditor({ onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const [q, setQ] = useState("");
  const zones = useMemo(() => (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["Europe/Amsterdam", "UTC"]), []);
  const list = zones.filter((z) => z.toLowerCase().replace(/_/g, " ").includes(q.toLowerCase())).slice(0, 60);
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <input className={styles.searchInput} autoFocus placeholder={t("col.worldClock.search")} value={q} data-testid="clock-search" onChange={(e) => setQ(e.target.value)} />
      <div className={styles.optionList} data-testid="clock-editor">
        {list.map((z) => <button key={z} type="button" className={styles.option} data-testid={`clock-option-${z}`} onClick={() => onCommit({ timezone: z })}>{z.replace(/_/g, " ")}</button>)}
      </div>
      <div className={styles.statusFooter}><button type="button" className={styles.btn} onClick={() => onCommit(null)}>{t("column.clear")}</button></div>
    </Popover>
  );
}

export const worldClockUi: ColumnUi<V> = {
  align: "center",
  defaultWidth: 150,
  Cell: function ClockCell({ value }) {
    const now = useNow();
    if (!value) return <div className={styles.cell} />;
    return (
      <div className={`${styles.cell} ${styles.center}`}>
        <span className={pack.clock}><span className={pack.clockTime}>{clockTime(value.timezone, now)}</span><span className={pack.clockZone}>{city(value.timezone)}</span></span>
      </div>
    );
  },
  Editor: ClockEditor,
};
