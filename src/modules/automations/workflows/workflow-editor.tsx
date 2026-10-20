"use client";

import { Button } from "@vibe/core";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { BoardFull } from "@/lib/board-types";
import { BlockRow, configDefaults } from "../builder-tab";
import { cleanConfig } from "../describe";
import { FieldInput, type Values } from "../field-input";
import type { AutomationDto, BlockMeta, BlockRef, Catalog, ConditionGroup, FieldSpec, Step } from "../types";
import { useAutoContext, type UiCtx } from "../use-auto-context";
import s from "./workflows.module.css";

let seq = 0;
const sid = () => `w${Date.now().toString(36)}${seq++}`;

function ConditionEditor({ group, onChange, blocks, ctx, testId }: { group: ConditionGroup; onChange: (g: ConditionGroup) => void; blocks: BlockMeta[]; ctx: UiCtx; testId: string }) {
  const t = useT();
  const rows = group.conditions.filter((c): c is BlockRef => "type" in c);
  return (
    <div>
      {rows.map((c, i) => (
        <BlockRow key={i} kind="condition" row={{ id: String(i), type: c.type, config: c.config as Values }} blocks={blocks} ctx={ctx} testId={`${testId}-${i}`}
          onChange={(r) => onChange({ ...group, conditions: rows.map((x, j) => (j === i ? { type: r.type, config: r.config } : x)) })}
          onRemove={() => onChange({ ...group, conditions: rows.filter((_, j) => j !== i) })} />
      ))}
      <div className={s.row}>
        <Button size="xs" kind="tertiary" onClick={() => onChange({ ...group, conditions: [...rows, { type: "", config: {} }] })} data-testid={`${testId}-add`}>+ {t("auto.addCondition")}</Button>
        {rows.length > 1 ? <button type="button" className="" onClick={() => onChange({ ...group, op: group.op === "and" ? "or" : "and" })} style={{ border: 0, background: "#cce5ff", color: "#0060b9", borderRadius: 4, padding: "1px 8px", cursor: "pointer" }}>{group.op === "and" ? t("auto.and") : t("auto.or")}</button> : null}
      </div>
    </div>
  );
}

function ApprovalEditor({ step, onChange, ctx }: { step: Extract<Step, { type: "approval" }>; onChange: (s: Step) => void; ctx: UiCtx }) {
  const t = useT();
  const field: FieldSpec = { key: "approverIds", kind: "users", label: { nl: t("auto.wf.approvers"), en: t("auto.wf.approvers") } };
  return (
    <div>
      <span className={s.muted}>{t("auto.wf.approvers")}: </span>
      <FieldInput field={field} values={{ approverIds: step.approverIds }} set={(_k, v) => onChange({ ...step, approverIds: (v as string[]).filter((x) => /^\d+$/.test(x)), approverColumnId: (v as string[]).find((x) => x.startsWith("@col:"))?.slice(5) })} ctx={ctx} testId={`wf-approvers-${step.id}`} />
      <div style={{ marginTop: 6 }}>
        <input className={s.input} style={{ width: "100%" }} value={step.message ?? ""} placeholder={t("auto.wf.approvalMsg")} onChange={(e) => onChange({ ...step, message: e.target.value })} data-testid={`wf-approval-msg-${step.id}`} />
      </div>
    </div>
  );
}

function StepList({ steps, onChange, blocks, ctx, depth = 0 }: { steps: Step[]; onChange: (s: Step[]) => void; blocks: BlockMeta[]; ctx: UiCtx; depth?: number }) {
  const t = useT();
  const set = (i: number, st: Step) => onChange(steps.map((x, j) => (j === i ? st : x)));
  const add = (i: number, st: Step) => { const n = [...steps]; n.splice(i, 0, st); onChange(n); };
  const addBar = (at: number) => (
    <div className={s.addBar}>
      <button type="button" className={s.addBtn} onClick={() => add(at, { id: sid(), type: "action", block: "", config: {} })} data-testid={`wf-add-step-${depth}-${at}`}>+ {t("auto.wf.addStep")}</button>
      <button type="button" className={s.addBtn} onClick={() => add(at, { id: sid(), type: "branch", condition: { op: "and", conditions: [{ type: "", config: {} }] }, then: [], else: [] })} data-testid={`wf-add-branch-${depth}-${at}`}>+ {t("auto.wf.addBranch")}</button>
      <button type="button" className={s.addBtn} onClick={() => add(at, { id: sid(), type: "approval", approverIds: [] })} data-testid={`wf-add-approval-${depth}-${at}`}>+ {t("auto.wf.addApproval")}</button>
    </div>
  );
  return (
    <>
      {addBar(0)}
      {steps.map((st, i) => (
        <div key={st.id}>
          <div className={s.connector} />
          <div className={`${s.node} ${st.type === "action" ? s.nodeAction : st.type === "branch" ? s.nodeBranch : s.nodeApproval}`} data-testid={`wf-node-${st.type}`}>
            <button type="button" className={s.remove} aria-label={t("auto.wf.remove")} onClick={() => onChange(steps.filter((_, j) => j !== i))} data-testid="wf-remove-step">×</button>
            {st.type === "action" ? (
              <BlockRow kind="action" row={{ id: st.id, type: st.block, config: st.config as Values }} blocks={blocks} ctx={ctx} testId={`wf-action-${depth}-${i}`}
                onChange={(r) => set(i, { ...st, block: r.type, config: r.config })} />
            ) : null}
            {st.type === "approval" ? <><div className={s.nodeKind}>{t("auto.wf.approvalStep")}</div><ApprovalEditor step={st} onChange={(x) => set(i, x)} ctx={ctx} /></> : null}
            {st.type === "branch" ? (
              <>
                <div className={s.nodeKind}>{t("auto.wf.condition")}</div>
                <ConditionEditor group={st.condition} onChange={(g) => set(i, { ...st, condition: g })} blocks={blocks} ctx={ctx} testId={`wf-cond-${depth}-${i}`} />
                <div className={s.branches}>
                  <div className={s.branchCol}><div className={s.branchLabel}>{t("auto.wf.then")}</div><StepList steps={st.then} onChange={(x) => set(i, { ...st, then: x })} blocks={blocks} ctx={ctx} depth={depth + 1} /></div>
                  <div className={s.branchCol}><div className={s.branchLabel}>{t("auto.wf.else")}</div><StepList steps={st.else} onChange={(x) => set(i, { ...st, else: x })} blocks={blocks} ctx={ctx} depth={depth + 2} /></div>
                </div>
              </>
            ) : null}
          </div>
          <div className={s.connector} />
          {addBar(i + 1)}
        </div>
      ))}
    </>
  );
}

function stripSteps(steps: Step[]): Step[] {
  return steps.map((st): Step => {
    if (st.type === "action") return { ...st, config: cleanConfig(st.config) };
    if (st.type === "branch") return { ...st, condition: { ...st.condition, conditions: st.condition.conditions.filter((c) => "type" in c && c.type).map((c) => ({ type: (c as BlockRef).type, config: cleanConfig((c as BlockRef).config) })) }, then: stripSteps(st.then), else: stripSteps(st.else) };
    return st;
  });
}

function Editor({ board, wf, catalog, reload }: { board: BoardFull; wf: AutomationDto; catalog: Catalog; reload: () => void }) {
  const t = useT();
  const ctx = useAutoContext(board);
  const [name, setName] = useState(wf.name);
  const [trigger, setTrigger] = useState<{ type: string; config: Values }>({ type: wf.definition.trigger.type, config: wf.definition.trigger.config as Values });
  const [steps, setSteps] = useState<Step[]>(wf.definition.steps);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [sentence, setSentence] = useState("");

  const save = async (): Promise<boolean> => {
    setError(""); setMsg("");
    try {
      await api.patch(`/api/v1/automations/${wf.id}`, { name, trigger: { type: trigger.type, config: cleanConfig(trigger.config) }, steps: stripSteps(steps) });
      setMsg(t("auto.saved"));
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); return false; }
  };
  const publish = async (on: boolean) => {
    if (on && !(await save())) return;
    try { await api.post(`/api/v1/automations/${wf.id}/publish`, { publish: on }); reload(); } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
  };
  const plan = async () => {
    try {
      const r = await api.post<{ definition: { trigger: BlockRef; steps: Step[] } | null; notes: string[] }>("/api/v1/automations/parse", { boardId: board.board.id, text: sentence });
      if (r.definition) { setTrigger({ type: r.definition.trigger.type, config: r.definition.trigger.config as Values }); setSteps(r.definition.steps); } else setError(r.notes.join("; "));
    } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
  };
  const published = wf.status === "published";
  return (
    <div className={s.page} data-testid="workflow-editor">
      <Link href="/workflows" className={s.muted}>← {t("auto.wf.back")}</Link>
      <div className={s.topbar} style={{ marginTop: 8 }}>
        <input className={s.input} style={{ fontSize: 20, fontWeight: 600, minWidth: 320 }} value={name} onChange={(e) => setName(e.target.value)} data-testid="wf-name" aria-label="name" />
        <span className={`${s.pill} ${published ? s.pubOn : s.pubOff}`} data-testid="wf-state">{published ? t("auto.wf.published") : t("auto.draft")}</span>
        <span style={{ flex: 1 }} />
        <Button size="small" kind="secondary" onClick={() => void save().then((ok) => ok && reload())} data-testid="wf-save">{t("auto.wf.saveDraft")}</Button>
        {published ? <Button size="small" kind="tertiary" onClick={() => void publish(false)} data-testid="wf-unpublish">{t("auto.wf.unpublish")}</Button> : <Button size="small" kind="primary" onClick={() => void publish(true)} data-testid="wf-publish">{t("auto.wf.publish")}</Button>}
      </div>
      {error ? <div className={s.err} role="alert" data-testid="wf-error">{error}</div> : null}
      {msg ? <div className={s.muted} role="status">{msg}</div> : null}
      <div className={s.panel}>
        <div className={s.row}>
          <input className={s.input} style={{ flex: 1 }} value={sentence} onChange={(e) => setSentence(e.target.value)} placeholder={t("auto.describePh")} data-testid="wf-sentence" />
          <Button size="small" kind="secondary" onClick={() => void plan()} disabled={sentence.trim().length < 3} data-testid="wf-plan">{t("auto.wf.plan")}</Button>
        </div>
      </div>
      <div className={s.canvas}>
        <div className={s.flow}>
          <div className={`${s.node} ${s.nodeTrigger}`} data-testid="wf-node-trigger">
            <div className={s.nodeKind}>{t("auto.when")}</div>
            <BlockRow kind="trigger" row={{ id: "t", type: trigger.type, config: trigger.config }} blocks={catalog.blocks} ctx={ctx} testId="wf-trigger" onChange={(r) => setTrigger({ type: r.type, config: r.type !== trigger.type ? configDefaults(catalog.blocks.find((b) => b.id === r.type), ctx) : r.config })} />
          </div>
          <StepList steps={steps} onChange={setSteps} blocks={catalog.blocks} ctx={ctx} />
          {!steps.length ? <div className={s.muted} style={{ textAlign: "center" }}>{t("auto.wf.empty2")}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function WorkflowEditorPage({ id }: { id: string }) {
  const [wf, setWf] = useState<AutomationDto | null>(null);
  const [board, setBoard] = useState<BoardFull | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const t = useT();
  const load = useCallback(() => { void api.get<AutomationDto>(`/api/v1/automations/${id}`).then(setWf); }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!wf?.boardId) return;
    void api.get<BoardFull>(`/api/v1/boards/${wf.boardId}/full`).then(setBoard);
    void api.get<Catalog>(`/api/v1/automations/catalog?boardId=${wf.boardId}`).then(setCatalog);
  }, [wf?.boardId]);
  if (!wf || !board || !catalog) return <div className={s.page}>{t("common.loading")}</div>;
  return <Editor key={`${wf.id}-${wf.status}`} board={board} wf={wf} catalog={catalog} reload={load} />;
}

