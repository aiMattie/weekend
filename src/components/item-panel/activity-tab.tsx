"use client";

import { useEffect, useMemo, useState } from "react";
import { UserAvatar } from "@/components/columns/shared";
import { api } from "@/lib/api-client";
import { useLocale, useT } from "@/lib/i18n/client";
import { describeActivity, type ActivityRow } from "./format-activity";
import { timeAgo } from "./time";
import type { PanelTabProps } from "./tabs";
import styles from "./item-panel.module.css";

export function ActivityTab({ board, item, refreshKey }: PanelTabProps) {
  const t = useT();
  const locale = useLocale();
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [columnId, setColumnId] = useState("");
  const [userId, setUserId] = useState("");

  const columns = useMemo(() => board.columns.filter((c) => c.type !== "name" && c.scope === (item.parentItemId ? "subitem" : "item")), [board.columns, item.parentItemId]);
  const qs = useMemo(() => {
    const p = new URLSearchParams({ limit: "200" });
    if (columnId) p.set("columnId", columnId);
    if (userId) p.set("userId", userId);
    return p.toString();
  }, [columnId, userId]);

  useEffect(() => {
    let alive = true;
    api.get<ActivityRow[]>(`/api/v1/items/${item.id}/activity?${qs}`).then((r) => alive && setRows(r)).catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [item.id, item.updatedAt, item.updateCount, item.name, refreshKey, qs]);

  const filtered = columnId || userId;
  return (
    <div className={styles.tabBody} data-testid="activity-tab">
      <div className={styles.filters}>
        <label className={styles.filterLabel}>{t("panel.filterColumn")}
          <select className={styles.select} value={columnId} onChange={(e) => setColumnId(e.target.value)} data-testid="activity-filter-column">
            <option value="">{t("panel.all")}</option>
            {columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <label className={styles.filterLabel}>{t("panel.filterPerson")}
          <select className={styles.select} value={userId} onChange={(e) => setUserId(e.target.value)} data-testid="activity-filter-person">
            <option value="">{t("panel.all")}</option>
            {board.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        {filtered ? <button type="button" className={styles.linkBtn} onClick={() => { setColumnId(""); setUserId(""); }} data-testid="activity-filter-clear">{t("toolbar.clear")}</button> : null}
      </div>
      {rows && rows.length === 0 ? <div className={styles.empty} data-testid="activity-empty">{filtered ? t("panel.noActivityFiltered") : t("panel.noActivity")}</div> : null}
      {rows?.map((r) => {
        const user = board.users.find((u) => u.id === r.userId);
        return (
          <div key={r.id} className={styles.activityRow} data-testid="activity-row" data-event={r.event}>
            <span className={styles.time} title={new Date(r.createdAt).toLocaleString(locale === "nl" ? "nl-NL" : "en-GB")}>{timeAgo(r.createdAt, locale)}</span>
            {user ? <UserAvatar user={user} size="xs" /> : <span style={{ width: 24 }} />}
            <span data-testid="activity-text">{describeActivity(r, board.users, t)}</span>
          </div>
        );
      })}
    </div>
  );
}
