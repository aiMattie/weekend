"use client";

import { useT } from "@/lib/i18n/client";
import { api } from "@/lib/api-client";
import type { PlanOverview } from "@/server/services/account";
import { Card, Chip, PageHead, useAction } from "./ui";
import styles from "./admin.module.css";

const fmt = (n: number | null) => (n === null ? "∞" : n.toLocaleString("nl-NL"));

export function BillingPage({ overview, canChange }: { overview: PlanOverview; canChange: boolean }) {
  const t = useT();
  const { run, error } = useAction();
  return (
    <>
      <PageHead title={t("admin.billing.title")} sub={t("admin.billing.sub")} actions={<Chip tone="blue">{t("admin.billing.plan")}: {overview.label}</Chip>} />
      {error && <div className={styles.error} role="alert">{error}</div>}
      <Card title={t("admin.billing.usage")} testId="billing-usage">
        <table className={styles.table}>
          <thead><tr><th>{t("admin.billing.limit")}</th><th>{t("admin.billing.used")}</th><th>{t("admin.billing.max")}</th><th style={{ width: 220 }} /></tr></thead>
          <tbody>
            <tr><td>{t("admin.billing.seats")}</td><td data-testid="usage-seats">{overview.seats}</td><td>{t("admin.billing.noPayments")}</td><td /></tr>
            {overview.limits.map((l) => {
              const pct = l.limit === null ? 0 : l.limit === 0 ? 100 : Math.min(100, Math.round((l.used / l.limit) * 100));
              return (
                <tr key={l.key} data-testid={`usage-${l.key}`}>
                  <td>{t(`admin.billing.key.${l.key}`)}</td><td>{fmt(l.used)}</td><td>{fmt(l.limit)}</td>
                  <td><div className={styles.meter}><div className={`${styles.meterFill} ${l.limit !== null && l.used >= l.limit ? styles.meterFull : ""}`} style={{ width: `${pct}%` }} /></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className={styles.hint} style={{ marginTop: 12 }}>{t("admin.billing.readonly")}</p>
      </Card>
      <Card title={t("admin.billing.compare")} testId="billing-plans">
        <table className={`${styles.table} ${styles.matrix}`}>
          <thead><tr><th />{overview.plans.map((p) => <th key={p.key}>{p.label}{p.key === overview.plan && <> <Chip tone="green">{t("admin.billing.current")}</Chip></>}</th>)}</tr></thead>
          <tbody>
            {(["guestsPerSeat", "automationsPerMonth", "integrations", "viewsPerBoard"] as const).map((k) => (
              <tr key={k}><td>{t(`admin.billing.limit.${k}`)}</td>{overview.plans.map((p) => <td key={p.key}>{fmt(p.limits[k])}</td>)}</tr>
            ))}
            {canChange && (
              <tr><td />{overview.plans.map((p) => (
                <td key={p.key}>{p.key !== overview.plan && <button className={styles.pick} onClick={() => run(() => api.put("/api/v1/admin/billing", { plan: p.key }))} data-testid={`plan-${p.key}`}>{t("admin.billing.switch")}</button>}</td>
              ))}</tr>
            )}
          </tbody>
        </table>
        <p className={styles.hint} style={{ marginTop: 12 }}>{t("admin.billing.switchHint")}</p>
      </Card>
    </>
  );
}
