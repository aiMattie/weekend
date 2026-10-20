"use client";

import { Button, Toggle } from "@vibe/core";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { describeDefinition } from "./describe";
import { RunList, StatusChip, fmtTime } from "./run-list";
import type { AutomationDto, Catalog } from "./types";
import type { UiCtx } from "./use-auto-context";
import styles from "./automations.module.css";

export function ManageTab({ catalog, ctx, automations, reload, onEdit }: { catalog: Catalog; ctx: UiCtx; automations: AutomationDto[]; reload: () => void; onEdit: (a: AutomationDto) => void }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const act = (p: Promise<unknown>) => void p.then(reload);
  if (!automations.length) return <div className={styles.main}><div className={styles.empty} data-testid="manage-empty">{t("auto.empty")}</div></div>;
  return (
    <div className={styles.main} data-testid="auto-manage">
      <table className={styles.table}>
        <thead><tr><th style={{ width: 70 }}>{t("auto.active")}</th><th>{t("auto.col.automation")}</th><th style={{ width: 190 }}>{t("auto.lastRun")}</th><th style={{ width: 330 }} /></tr></thead>
        <tbody>
          {automations.map((a) => {
            const d = describeDefinition(a.definition, catalog.blocks, ctx);
            return (
              <tr key={a.id} data-testid={`auto-row-${a.id}`} data-active={a.active}>
                <td>
                  <Toggle isSelected={a.active} onChange={(on) => act(api.post(`/api/v1/automations/${a.id}/toggle`, { active: on }))} disabled={a.status === "draft"} aria-label={`${t("auto.active")}: ${a.name}`} data-testid={`auto-toggle-${a.id}`} />
                </td>
                <td>
                  <div className={styles.autoName} data-testid="auto-name">{a.name}{a.kind === "workflow" ? ` (workflow${a.status === "draft" ? `, ${t("auto.draft").toLowerCase()}` : ""})` : ""}</div>
                  <div className={styles.autoSummary} data-testid={`auto-summary-${a.id}`}>{d.when} → {d.actions.join(" → ")}</div>
                  {open === a.id ? <div style={{ marginTop: 10 }}><RunList ctx={ctx} automationId={a.id} /></div> : null}
                </td>
                <td>
                  {a.lastRunAt ? <><div>{fmtTime(a.lastRunAt, ctx.locale)}</div>{a.lastRunStatus ? <StatusChip status={a.lastRunStatus} /> : null} <span className={styles.muted}>{t("auto.runs", { n: a.runCount })}</span></> : <span className={styles.muted}>{t("auto.neverRun")}</span>}
                </td>
                <td>
                  <div className={styles.btnRow}>
                    <Button size="xs" kind="tertiary" onClick={() => setOpen(open === a.id ? null : a.id)} data-testid={`auto-history-${a.id}`}>{t("auto.history")}</Button>
                    <Button size="xs" kind="tertiary" onClick={() => onEdit(a)} data-testid={`auto-edit-${a.id}`}>{t("auto.edit")}</Button>
                    <Button size="xs" kind="tertiary" onClick={() => act(api.post(`/api/v1/automations/${a.id}/duplicate`))} data-testid={`auto-duplicate-${a.id}`}>{t("auto.duplicate")}</Button>
                    <Button size="xs" kind="tertiary" color="negative" onClick={() => { if (window.confirm(t("auto.deleteConfirm"))) act(api.del(`/api/v1/automations/${a.id}`)); }} data-testid={`auto-delete-${a.id}`}>{t("auto.delete")}</Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
