"use client";

import { Button } from "@vibe/core";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import ai from "../ai.module.css";
import { Card, Chip, Field, PageHead, adminStyles } from "@/modules/admin/ui/ui";
import type { AiSettingsDto, AiStatus, UsageSummary } from "@/server/services/ai-core";

interface Payload { settings: AiSettingsDto; status: AiStatus; usage: UsageSummary }

/** Admin > AI: provider (no key), model, switches incl. the agent kill switch, credit limits, usage. */
export function AiSettingsPage({ initial }: { initial: Payload }) {
  const t = useT();
  const [data, setData] = useState(initial);
  const [form, setForm] = useState({ aiEnabled: initial.settings.aiEnabled, agentsEnabled: initial.settings.agentsEnabled, userLimit: initial.settings.userMonthlyCredits === null ? "" : String(initial.settings.userMonthlyCredits), accountLimit: initial.settings.accountMonthlyCredits === null ? "" : String(initial.settings.accountMonthlyCredits), model: initial.settings.model ?? "" });
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const lim = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v))));
  const save = async (patch?: Partial<typeof form>) => {
    const f = { ...form, ...patch };
    setErr(""); setMsg("");
    try {
      const r = await api.patch<{ settings: AiSettingsDto; status: AiStatus }>("/api/v1/ai/settings", { aiEnabled: f.aiEnabled, agentsEnabled: f.agentsEnabled, userMonthlyCredits: lim(f.userLimit), accountMonthlyCredits: lim(f.accountLimit), model: f.model.trim() || null });
      setForm(f); setData({ ...data, ...r }); setMsg(t("ai.ad.saved"));
    } catch (e) { setErr(e instanceof Error ? e.message : t("ai.error")); }
  };
  const st = data.status;
  const u = data.usage;
  return (
    <>
      <PageHead title={t("ai.ad.title")} sub={t("ai.ad.sub")} />
      {err && <div className={adminStyles.error} role="alert">{err}</div>}
      {msg && <div className={adminStyles.hint} data-testid="ai-admin-saved">{msg}</div>}
      <Card title={t("ai.ad.provider")} testId="ai-admin-provider">
        <table className={adminStyles.table}><tbody>
          <tr><td>{t("ai.ad.key")}</td><td data-testid="ai-admin-key">{st.configured ? <Chip tone="green">{t("ai.ad.keySet")}</Chip> : <Chip tone="red">{t("ai.ad.keyMissing")}</Chip>}</td></tr>
          <tr><td>{t("ai.ad.baseUrl")}</td><td data-testid="ai-admin-baseurl">{st.baseUrl ?? t("ai.ad.baseUrlDefault")}</td></tr>
          <tr><td>{t("ai.ad.model")}</td><td data-testid="ai-admin-model">{st.model}</td></tr>
        </tbody></table>
        <div style={{ height: 12 }} />
        <Field label={t("ai.ad.modelOverride")}><input className={ai.text} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="claude-sonnet-5-5" data-testid="ai-admin-model-input" /></Field>
      </Card>
      <Card title={t("ai.ad.switches")} testId="ai-admin-switches">
        <div className={adminStyles.fieldRow}><label><input type="checkbox" checked={form.aiEnabled} onChange={(e) => setForm({ ...form, aiEnabled: e.target.checked })} data-testid="ai-admin-enabled" /> {t("ai.ad.aiEnabled")}</label></div>
        <div className={adminStyles.fieldRow}>
          <label><input type="checkbox" checked={form.agentsEnabled} onChange={(e) => setForm({ ...form, agentsEnabled: e.target.checked })} data-testid="ai-admin-agents-enabled" /> {t("ai.ad.agentsEnabled")}</label>
          {form.agentsEnabled
            ? <Button size="small" kind="primary" color="negative" onClick={() => void save({ agentsEnabled: false })} data-testid="ai-admin-kill">{t("ai.ad.kill")}</Button>
            : <Button size="small" kind="secondary" onClick={() => void save({ agentsEnabled: true })} data-testid="ai-admin-resume">{t("ai.ad.resume")}</Button>}
        </div>
      </Card>
      <Card title={t("ai.ad.limits")} testId="ai-admin-limits">
        <p className={adminStyles.hint}>{t("ai.ad.limitsHint")}</p>
        <div className={adminStyles.fieldRow}>
          <Field label={t("ai.ad.userLimit")}><input className={ai.text} type="number" min={0} value={form.userLimit} onChange={(e) => setForm({ ...form, userLimit: e.target.value })} data-testid="ai-admin-user-limit" /></Field>
          <Field label={t("ai.ad.accountLimit")}><input className={ai.text} type="number" min={0} value={form.accountLimit} onChange={(e) => setForm({ ...form, accountLimit: e.target.value })} data-testid="ai-admin-account-limit" /></Field>
        </div>
        <Button size="small" kind="primary" onClick={() => void save()} data-testid="ai-admin-save">{t("ai.ad.save")}</Button>
      </Card>
      <Card title={`${t("ai.ad.usage")} (${u.month})`} testId="ai-admin-usage">
        <p className={adminStyles.hint} data-testid="ai-admin-usage-total">{t("ai.ad.usageTotal", { credits: u.total.credits, calls: u.total.calls })}</p>
        {u.total.calls ? (
          <div className={adminStyles.fieldRow} style={{ alignItems: "flex-start" }}>
            <table className={adminStyles.table} style={{ flex: 1 }}><thead><tr><th>{t("ai.ad.bySource")}</th><th>{t("ai.ad.credits")}</th><th>{t("ai.ad.calls")}</th></tr></thead><tbody>
              {u.bySource.map((x) => <tr key={x.source}><td>{t(`ai.ad.src.${x.source}`)}</td><td>{x.credits}</td><td>{x.calls}</td></tr>)}
            </tbody></table>
            <table className={adminStyles.table} style={{ flex: 1 }}><thead><tr><th>{t("ai.ad.byUser")}</th><th>{t("ai.ad.credits")}</th><th>{t("ai.ad.calls")}</th></tr></thead><tbody>
              {u.byUser.map((x) => <tr key={x.userId ?? "sys"}><td>{x.name}</td><td>{x.credits}</td><td>{x.calls}</td></tr>)}
            </tbody></table>
          </div>
        ) : <p className={adminStyles.hint}>{t("ai.ad.noUsage")}</p>}
      </Card>
    </>
  );
}
