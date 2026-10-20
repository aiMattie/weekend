"use client";

import { Button } from "@vibe/core";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { BuilderProps } from "./agent-builder";
import s from "../ai.module.css";

export function BuilderKnowledge({ agent, reload, boards }: BuilderProps) {
  const t = useT();
  const [kind, setKind] = useState<"board" | "doc">("board");
  const [refId, setRefId] = useState("");
  const [access, setAccess] = useState<"read" | "write">("read");
  const [err, setErr] = useState("");
  const add = async () => {
    setErr("");
    try { await api.post(`/api/v1/ai/agents/${agent.id}/knowledge`, { kind, refId, access }); setRefId(""); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : t("ai.error")); }
  };
  const del = async (id: string) => { await api.del(`/api/v1/ai/agents/${agent.id}/knowledge/${id}`); reload(); };
  return (
    <div data-testid="agent-knowledge">
      <p className={s.hint}>{t("ai.ag.know.hint")}</p>
      <table className={s.table}><tbody>
        {agent.knowledge.length ? agent.knowledge.map((k) => (
          <tr key={k.id} data-testid="knowledge-row"><td>{k.kind === "board" ? t("ai.ag.know.board") : t("ai.ag.know.doc")}</td><td><strong>{k.name ?? k.refId}</strong></td>
            <td><span className={`${s.pill} ${k.access === "write" ? s.pillOrange : s.pillBlue}`}>{k.access === "write" ? t("ai.ag.know.write") : t("ai.ag.know.read")}</span></td>
            <td style={{ textAlign: "right" }}><Button size="xs" kind="tertiary" color="negative" onClick={() => void del(k.id)} data-testid="knowledge-delete">{t("common.delete")}</Button></td></tr>
        )) : <tr><td className={s.muted}>{t("ai.ag.know.none")}</td></tr>}
      </tbody></table>
      <div className={s.panelBox} style={{ marginTop: 16 }}>
        <div className={s.row}>
          <select className={s.text} style={{ width: 120 }} value={kind} onChange={(e) => { setKind(e.target.value as "board" | "doc"); setRefId(""); }} aria-label="soort" data-testid="knowledge-kind"><option value="board">{t("ai.ag.know.board")}</option><option value="doc">{t("ai.ag.know.doc")}</option></select>
          {kind === "board"
            ? <select className={s.text} style={{ width: 260 }} value={refId} onChange={(e) => setRefId(e.target.value)} data-testid="knowledge-board"><option value="">{t("ai.ag.know.board")}...</option>{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            : <input className={s.text} style={{ width: 260 }} value={refId} onChange={(e) => setRefId(e.target.value)} placeholder="doc id" data-testid="knowledge-doc" />}
          <select className={s.text} style={{ width: 200 }} value={access} onChange={(e) => setAccess(e.target.value as "read" | "write")} aria-label="toegang" data-testid="knowledge-access"><option value="read">{t("ai.ag.know.read")}</option><option value="write">{t("ai.ag.know.write")}</option></select>
          <Button size="small" kind="primary" onClick={() => void add()} disabled={!refId} data-testid="knowledge-add">{t("ai.ag.know.add")}</Button>
        </div>
        {err ? <div className={s.err} role="alert" style={{ marginTop: 8 }}>{err}</div> : null}
      </div>
    </div>
  );
}
