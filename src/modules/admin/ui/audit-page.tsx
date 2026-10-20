"use client";

import { Button, TextField } from "@vibe/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { AuditPage as Page } from "@/server/services/audit";
import { Card, Chip, PageHead, fmtDate } from "./ui";
import styles from "./admin.module.css";

const TONE: Record<string, "green" | "red" | "blue" | "orange" | undefined> = { auth: "blue", permission: "orange", security: "red", content: undefined, export: "green", api: "blue", admin: undefined };

export function AuditPage({ page, events, filters }: { page: Page; events: string[]; filters: Record<string, string> }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState(filters.q ?? "");
  const [category, setCategory] = useState(filters.category ?? "");
  const [event, setEvent] = useState(filters.event ?? "");
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const params = (extra: Record<string, string> = {}) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, category, event, from, to, ...extra })) if (v) sp.set(k, v);
    return sp.toString();
  };
  const apply = () => router.push(`/admin/audit?${params()}`);
  return (
    <>
      <PageHead title={t("admin.audit.title")} sub={t("admin.audit.sub")} actions={
        <>
          <a href={`/api/v1/audit-log/export?${params()}`} data-testid="audit-export"><Button kind="secondary">{t("admin.audit.export")}</Button></a>
        </>
      } />
      <Card testId="audit-card">
        <form className={styles.toolbar} onSubmit={(e) => { e.preventDefault(); apply(); }}>
          <TextField value={q} onChange={setQ} placeholder={t("admin.audit.search")} size="small" data-testid="audit-search" />
          <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("admin.audit.category")} data-testid="audit-category">
            <option value="">{t("admin.audit.allCategories")}</option>
            {["auth", "permission", "content", "security", "api", "export", "admin"].map((c) => <option key={c} value={c}>{t(`admin.audit.cat.${c}`)}</option>)}
          </select>
          <select className={styles.select} value={event} onChange={(e) => setEvent(e.target.value)} aria-label={t("admin.audit.event")} data-testid="audit-event">
            <option value="">{t("admin.audit.allEvents")}</option>
            {events.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <input type="date" className={styles.select} value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("admin.audit.from")} />
          <input type="date" className={styles.select} value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("admin.audit.to")} />
          <Button type="submit" size="small" data-testid="audit-apply">{t("admin.audit.filter")}</Button>
          <span className={styles.muted} data-testid="audit-total">{t("admin.audit.total", { n: page.total })}</span>
        </form>
        <table className={styles.table} data-testid="audit-table">
          <thead><tr><th>{t("admin.audit.time")}</th><th>{t("admin.audit.event")}</th><th>{t("admin.audit.actor")}</th><th>{t("admin.audit.target")}</th><th>{t("admin.audit.details")}</th></tr></thead>
          <tbody>
            {page.rows.map((r) => (
              <tr key={r.id} data-testid="audit-row" data-event={r.event}>
                <td className={styles.muted} style={{ whiteSpace: "nowrap" }}>{fmtDate(r.createdAt)}</td>
                <td><Chip tone={TONE[r.category]}>{r.event}</Chip></td>
                <td>{r.actorName ?? <span className={styles.muted}>{r.source ?? "-"}</span>}</td>
                <td>{r.targetName ?? r.targetId ?? ""}{r.targetType && <span className={styles.muted}> ({r.targetType})</span>}</td>
                <td><div className={styles.detail} title={JSON.stringify(r.details)}>{Object.keys(r.details).length ? JSON.stringify(r.details) : ""}{r.ip ? ` ip ${r.ip}` : ""}</div></td>
              </tr>
            ))}
            {!page.rows.length && <tr><td colSpan={5} className={styles.muted}>{t("admin.audit.none")}</td></tr>}
          </tbody>
        </table>
        {page.nextCursor && <div style={{ marginTop: 12 }}><Link href={`/admin/audit?${params({ cursor: page.nextCursor })}`}><Button kind="secondary" size="small" data-testid="audit-more">{t("admin.audit.more")}</Button></Link></div>}
      </Card>
    </>
  );
}
