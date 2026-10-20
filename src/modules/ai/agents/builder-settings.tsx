"use client";

import { Button } from "@vibe/core";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { BuilderProps } from "./agent-builder";
import type { AgentStatus } from "./types";
import s from "../ai.module.css";

export function BuilderSettings({ agent, reload }: BuilderProps) {
  const t = useT();
  const router = useRouter();
  const [f, setF] = useState({ name: agent.name, description: agent.description, instructions: agent.instructions, status: agent.status as AgentStatus, maxSteps: agent.maxSteps, maxTokens: agent.maxTokens, maxRunsPerHour: agent.maxRunsPerHour, userId: agent.userId ?? "" });
  const [ids, setIds] = useState<{ id: string; name: string; linkedAgentId: string | null }[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { void api.get<{ id: string; name: string; linkedAgentId: string | null }[]>("/api/v1/ai/agents/identities").then(setIds).catch(() => undefined); }, []);
  const save = async () => {
    setErr(""); setMsg("");
    try { await api.patch(`/api/v1/ai/agents/${agent.id}`, { name: f.name, description: f.description, instructions: f.instructions, status: f.status, maxSteps: Number(f.maxSteps), maxTokens: Number(f.maxTokens), maxRunsPerHour: Number(f.maxRunsPerHour), ...(f.userId && f.userId !== agent.userId ? { userId: f.userId } : {}) }); setMsg(t("ai.ag.saved")); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : t("ai.error")); }
  };
  const del = async () => { if (!window.confirm(t("ai.ag.deleteConfirm"))) return; await api.del(`/api/v1/ai/agents/${agent.id}`); router.push("/agents?view=mine"); router.refresh(); };
  const num = (k: "maxSteps" | "maxTokens" | "maxRunsPerHour") => <input className={s.text} type="number" value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} data-testid={`agent-${k}`} />;
  return (
    <div data-testid="agent-settings" style={{ maxWidth: 720 }}>
      <label className={s.field}><span className={s.label}>{t("ai.ag.name")}</span><input className={s.text} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="agent-name" /></label>
      <label className={s.field}><span className={s.label}>{t("ai.ag.description")}</span><input className={s.text} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="agent-description" /></label>
      <label className={s.field}><span className={s.label}>{t("ai.ag.instructions")}</span><textarea className={s.text} rows={8} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} data-testid="agent-instructions" /></label>
      <div className={s.row}>
        <label className={s.field} style={{ flex: 1, minWidth: 200 }}><span className={s.label}>Status</span>
          <select className={s.text} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as AgentStatus })} data-testid="agent-status-select">{(["draft", "active", "paused"] as const).map((x) => <option key={x} value={x}>{t(`ai.ag.status.${x}`)}</option>)}</select></label>
        <label className={s.field} style={{ flex: 1, minWidth: 200 }}><span className={s.label}>{t("ai.ag.identity")}</span>
          <select className={s.text} value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} data-testid="agent-identity">
            {agent.userId ? <option value={agent.userId}>{agent.identityName}</option> : null}
            {ids.filter((i) => i.id !== agent.userId && !i.linkedAgentId).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select></label>
      </div>
      <div className={s.label} style={{ marginBottom: 6 }}>{t("ai.ag.limits")}</div>
      <div className={s.row}>
        <label className={s.field}><span className={s.hint}>{t("ai.ag.maxSteps")}</span>{num("maxSteps")}</label>
        <label className={s.field}><span className={s.hint}>{t("ai.ag.maxTokens")}</span>{num("maxTokens")}</label>
        <label className={s.field}><span className={s.hint}>{t("ai.ag.maxRuns")}</span>{num("maxRunsPerHour")}</label>
      </div>
      {err ? <div className={s.err} role="alert">{err}</div> : null}
      {msg ? <div className={s.ok} data-testid="agent-saved">{msg}</div> : null}
      <div className={s.row} style={{ marginTop: 12 }}>
        <Button size="small" kind="primary" onClick={() => void save()} data-testid="agent-save">{t("ai.ag.save")}</Button>
        <Button size="small" kind="tertiary" color="negative" onClick={() => void del()} data-testid="agent-delete">{t("ai.ag.delete")}</Button>
      </div>
    </div>
  );
}
