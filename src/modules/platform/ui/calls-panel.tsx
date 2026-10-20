"use client";

import { Button } from "@vibe/core";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { Card, Chip } from "@/modules/admin/ui/ui";
import styles from "@/modules/admin/ui/admin.module.css";
import type { CallDto } from "./types";
import local from "./platform.module.css";

export function CallsPanel() {
  const t = useT();
  const [rows, setRows] = useState<CallDto[] | null>(null);
  const load = useCallback(() => api.get<CallDto[]>("/api/v1/api-calls?limit=50").then(setRows).catch(() => setRows([])), []);
  useEffect(() => { void load(); }, [load]);
  return (
    <Card title={t("platform.calls.title")} testId="calls-card" actions={<Button size="small" kind="tertiary" onClick={() => void load()}>{t("platform.calls.refresh")}</Button>}>
      <p className={styles.hint}>{t("platform.calls.hint")}</p>
      {rows && rows.length === 0 && <p className={styles.muted} data-testid="calls-empty">{t("platform.calls.empty")}</p>}
      {rows && rows.length > 0 && (
        <div className={local.tableWrap}>
          <table className={styles.table} data-testid="calls-table">
            <thead><tr><th>{t("platform.calls.col.when")}</th><th>{t("platform.calls.col.channel")}</th><th>{t("platform.calls.col.name")}</th><th>{t("platform.calls.col.result")}</th><th>{t("platform.calls.col.ms")}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid="call-row">
                  <td>{new Date(r.createdAt).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "medium" })}</td>
                  <td><Chip tone={r.channel === "mcp" ? "orange" : "blue"}>{r.channel}</Chip></td>
                  <td className={styles.mono}>{r.name}</td>
                  <td>{r.ok ? <Chip tone="green">{t("platform.calls.ok")}</Chip> : <Chip tone="red">{t("platform.calls.failed")}</Chip>} {r.error && <span className={styles.muted}>{r.error}</span>}</td>
                  <td>{r.durationMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
