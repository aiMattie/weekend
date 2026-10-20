"use client";

import { Button, Toggle } from "@vibe/core";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { WebhookDeliveryDto, WebhookEndpointDto } from "../types";
import s from "./integrations.module.css";

const EVENTS = ["create_item", "create_subitem", "change_column_value", "change_status_column_value", "item_moved_to_any_group", "item_archived", "item_deleted", "create_update", "button_clicked", "sprint_started", "sprint_completed"];

function Deliveries({ id }: { id: string }) {
  const t = useT();
  const [rows, setRows] = useState<WebhookDeliveryDto[] | null>(null);
  const load = useCallback(() => api.get<WebhookDeliveryDto[]>(`/api/v1/webhook-endpoints/${id}/deliveries`).then(setRows).catch(() => undefined), [id]);
  useEffect(() => { void load(); }, [load]);
  if (!rows) return null;
  if (!rows.length) return <div className={s.muted} data-testid={`wh-empty-${id}`}>{t("auto.int.noDeliveries")}</div>;
  return (
    <table className={s.table} data-testid={`wh-deliveries-${id}`}>
      <tbody>
        {rows.map((d) => (
          <tr key={d.id} data-testid="wh-delivery" data-status={d.status}>
            <td>{new Date(d.createdAt).toLocaleString("nl-NL")}</td><td>{d.event}</td>
            <td><span className={`${s.status} ${d.status === "success" ? s.on : s.off}`}>{d.status}</span> {d.responseStatus ?? ""} ({d.attempts}x)</td>
            <td className={s.err}>{d.error}</td>
            <td>{d.status !== "success" ? <Button size="xs" kind="tertiary" onClick={() => void api.post(`/api/v1/webhook-endpoints/deliveries/${d.id}/retry`).then(load)}>{t("auto.int.retry")}</Button> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WebhooksSection({ boards }: { boards: { id: string; name: string }[] }) {
  const t = useT();
  const [list, setList] = useState<WebhookEndpointDto[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [boardId, setBoardId] = useState("");
  const [events, setEvents] = useState<string[]>(["*"]);
  const [error, setError] = useState("");
  const reload = useCallback(() => { void api.get<WebhookEndpointDto[]>("/api/v1/webhook-endpoints").then(setList).catch(() => undefined); }, []);
  useEffect(() => { reload(); }, [reload]);
  const boardName = (id: string | null) => (id ? boards.find((b) => b.id === id)?.name ?? id : t("auto.int.account"));
  const create = async () => {
    setError("");
    try { await api.post("/api/v1/webhook-endpoints", { url, boardId: boardId || null, events }); setUrl(""); setAdding(false); reload(); }
    catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
  };
  return (
    <div className={s.section} data-testid="webhooks-section">
      <h2 className={s.sectionTitle}>{t("auto.int.webhooks")}</h2>
      <div className={s.muted}>{t("auto.int.webhooksSub")}</div>
      {list.length ? (
        <table className={s.table}>
          <thead><tr><th /><th>{t("auto.int.endpoint")}</th><th>Board</th><th>{t("auto.int.events")}</th><th /></tr></thead>
          <tbody>
            {list.map((w) => (
              <tr key={w.id} data-testid={`wh-row-${w.id}`}>
                <td><Toggle isSelected={w.active} onChange={(on) => void api.patch(`/api/v1/webhook-endpoints/${w.id}`, { active: on }).then(reload)} aria-label="active" /></td>
                <td><div className={s.mono}>{w.url}</div>
                  {open === w.id ? <div style={{ marginTop: 8 }}><span className={s.label}>{t("auto.int.secret")}</span><div className={s.mono} data-testid={`wh-secret-${w.id}`}>{w.secret}</div><div style={{ marginTop: 8 }}><Deliveries id={w.id} /></div></div> : null}
                </td>
                <td>{boardName(w.boardId)}</td>
                <td>{w.events.join(", ")}</td>
                <td>
                  <div className={s.row}>
                    <Button size="xs" kind="tertiary" onClick={() => void api.post(`/api/v1/webhook-endpoints/${w.id}/test`).then(() => setOpen(w.id))} data-testid={`wh-test-${w.id}`}>{t("auto.int.test")}</Button>
                    <Button size="xs" kind="tertiary" onClick={() => setOpen(open === w.id ? null : w.id)} data-testid={`wh-log-${w.id}`}>{t("auto.int.deliveries")}</Button>
                    <Button size="xs" kind="tertiary" color="negative" onClick={() => { if (window.confirm(t("auto.deleteConfirm"))) void api.del(`/api/v1/webhook-endpoints/${w.id}`).then(reload); }}>{t("auto.delete")}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {adding ? (
        <div className={s.form} data-testid="wh-form">
          <label><span className={s.label}>{t("auto.int.endpoint")}</span><input className={s.input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hook" data-testid="wh-url" /></label>
          <label><span className={s.label}>Board</span>
            <select className={s.input} value={boardId} onChange={(e) => setBoardId(e.target.value)} data-testid="wh-board"><option value="">{t("auto.int.account")}</option>{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <div><span className={s.label}>{t("auto.int.events")}</span>
            <label className={s.chk}><input type="checkbox" checked={events.includes("*")} onChange={(e) => setEvents(e.target.checked ? ["*"] : [])} data-testid="wh-event-all" /> *</label>
            {!events.includes("*") ? EVENTS.map((ev) => <label key={ev} className={s.chk}><input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} /> {ev}</label>) : null}
          </div>
          {error ? <div className={s.err} role="alert">{error}</div> : null}
          <div className={s.row}><Button kind="primary" size="small" onClick={() => void create()} disabled={!url || !events.length} data-testid="wh-save">{t("auto.int.save")}</Button><Button kind="tertiary" size="small" onClick={() => setAdding(false)}>{t("common.cancel")}</Button></div>
        </div>
      ) : <div style={{ marginTop: 12 }}><Button size="small" kind="secondary" onClick={() => setAdding(true)} data-testid="wh-add">{t("auto.int.addWebhook")}</Button></div>}
    </div>
  );
}
