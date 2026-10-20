"use client";

import { Button } from "@vibe/core";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { BuilderProps } from "./agent-builder";
import s from "../ai.module.css";

export function BuilderSkills({ agent, reload, tools }: BuilderProps) {
  const t = useT();
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const add = async () => {
    setErr("");
    try { await api.post(`/api/v1/ai/agents/${agent.id}/skills`, { name, instruction, tools: picked }); setName(""); setInstruction(""); setPicked([]); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : t("ai.error")); }
  };
  const del = async (id: string) => { await api.del(`/api/v1/ai/agents/${agent.id}/skills/${id}`); reload(); };
  return (
    <div data-testid="agent-skills">
      {agent.skills.length ? agent.skills.map((sk) => (
        <div key={sk.id} className={s.panelBox} data-testid="skill-row">
          <div className={s.row}><strong style={{ flex: 1 }}>{sk.name}</strong><Button size="xs" kind="tertiary" color="negative" onClick={() => void del(sk.id)}>{t("common.delete")}</Button></div>
          {sk.instruction ? <p className={s.hint}>{sk.instruction}</p> : null}
          <div className={s.tags} style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{sk.tools.map((x) => <span key={x} className={s.tag} style={{ background: "#eef0f8", borderRadius: 10, padding: "1px 8px", fontSize: 12 }}>{x}</span>)}</div>
        </div>
      )) : <p className={s.muted}>{t("ai.ag.skill.none")}</p>}
      <div className={s.panelBox}>
        <label className={s.field}><span className={s.label}>{t("ai.ag.skill.name")}</span><input className={s.text} value={name} onChange={(e) => setName(e.target.value)} data-testid="skill-name" /></label>
        <label className={s.field}><span className={s.label}>{t("ai.ag.skill.instruction")}</span><textarea className={s.text} rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} data-testid="skill-instruction" /></label>
        <div className={s.label} style={{ marginBottom: 6 }}>{t("ai.ag.skill.tools")}</div>
        <div className={s.row} style={{ marginBottom: 12 }}>
          {tools.map((tl) => (
            <label key={tl.name} className={s.hint} title={tl.description} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" checked={picked.includes(tl.name)} onChange={(e) => setPicked(e.target.checked ? [...picked, tl.name] : picked.filter((x) => x !== tl.name))} data-testid={`skill-tool-${tl.name}`} /> {tl.name}{tl.write ? ` (${t("ai.ag.skill.write")})` : ""}
            </label>
          ))}
        </div>
        {err ? <div className={s.err} role="alert" style={{ marginBottom: 8 }}>{err}</div> : null}
        <Button size="small" kind="primary" onClick={() => void add()} disabled={!name.trim()} data-testid="skill-add">{t("ai.ag.skill.add")}</Button>
      </div>
    </div>
  );
}
