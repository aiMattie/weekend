"use client";

import { Button } from "@vibe/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { AutomationDto, RunDto } from "../types";
import s from "./workflows.module.css";

export function WorkflowsPage() {
  const t = useT();
  const router = useRouter();
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [boardId, setBoardId] = useState("");
  const [name, setName] = useState("");
  const [sentence, setSentence] = useState("");
  const [list, setList] = useState<(AutomationDto & { boardName?: string })[]>([]);
  const [approvals, setApprovals] = useState<RunDto[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async (bs: { id: string; name: string }[]) => {
    const all = await Promise.all(bs.map((b) => api.get<AutomationDto[]>(`/api/v1/automations?boardId=${b.id}&kind=workflow`).then((l) => l.map((x) => ({ ...x, boardName: b.name }))).catch(() => [])));
    setList(all.flat());
    api.get<RunDto[]>("/api/v1/automations/approvals").then(setApprovals).catch(() => undefined);
  }, []);
  useEffect(() => {
    void api.get<{ id: string; name: string; kind?: string }[]>("/api/v1/boards").then((b) => { const bs = b.filter((x) => !x.kind || x.kind === "board"); setBoards(bs); setBoardId((cur) => cur || bs[0]?.id || ""); void load(bs); });
  }, [load]);
  const create = async () => {
    setError("");
    try {
      const wf = await api.post<AutomationDto>("/api/v1/automations/workflow", { boardId, name: name || undefined, text: sentence.trim() || undefined });
      router.push(`/workflows/${wf.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
  };
  const decide = async (r: RunDto, approve: boolean) => { await api.post(`/api/v1/automations/runs/${r.id}/decision`, { approve }); await load(boards); };
  return (
    <div className={s.page} data-testid="workflows-page">
      <h1 className={s.title} style={{ textAlign: "center", marginTop: 24 }}>{t("auto.wf.build")}</h1>
      <p className={s.sub} style={{ textAlign: "center" }}>{t("auto.wf.buildSub")}</p>
      <div className={s.panel}>
        <div className={s.row}>
          <select className={s.input} value={boardId} onChange={(e) => setBoardId(e.target.value)} aria-label={t("auto.wf.board")} data-testid="wf-new-board">{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("auto.name")} data-testid="wf-new-name" />
          <Button kind="primary" size="small" onClick={() => void create()} disabled={!boardId} data-testid="wf-new">{t("auto.wf.new")}</Button>
        </div>
        <div className={s.row} style={{ marginTop: 10 }}>
          <input className={s.input} style={{ flex: 1 }} value={sentence} onChange={(e) => setSentence(e.target.value)} placeholder={t("auto.describePh")} data-testid="wf-new-sentence" />
        </div>
        {error ? <div className={s.err} role="alert">{error}</div> : null}
      </div>
      {approvals.length ? (
        <div className={s.panel} data-testid="wf-approvals">
          <strong>{t("auto.wf.pending")}</strong>
          {approvals.map((r) => (
            <div key={r.id} className={s.approvalRow} data-testid="wf-approval">
              <span>{list.find((w) => w.id === r.automationId)?.name ?? r.automationId} · #{r.itemId}</span>
              <span className={s.row}><Button size="xs" kind="primary" onClick={() => void decide(r, true)} data-testid="wf-approve">{t("auto.wf.approve")}</Button><Button size="xs" kind="tertiary" color="negative" onClick={() => void decide(r, false)} data-testid="wf-reject">{t("auto.wf.reject")}</Button></span>
            </div>
          ))}
        </div>
      ) : null}
      {list.length ? (
        <table className={s.list}>
          <thead><tr><th>{t("auto.col.automation")}</th><th>{t("auto.wf.board")}</th><th>{t("auto.col.status")}</th><th /></tr></thead>
          <tbody>
            {list.map((w) => (
              <tr key={w.id} data-testid={`wf-row-${w.id}`}>
                <td><Link href={`/workflows/${w.id}`} data-testid="wf-link">{w.name}</Link></td><td>{w.boardName}</td>
                <td><span className={`${s.pill} ${w.status === "published" ? s.pubOn : s.pubOff}`}>{w.status === "published" ? t("auto.wf.published") : t("auto.draft")}</span></td>
                <td><Button size="xs" kind="tertiary" color="negative" onClick={() => { if (window.confirm(t("auto.deleteConfirm"))) void api.del(`/api/v1/automations/${w.id}`).then(() => load(boards)); }}>{t("auto.delete")}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className={s.muted} data-testid="wf-empty">{t("auto.wf.empty")}</div>}
    </div>
  );
}
