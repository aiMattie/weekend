"use client";

/** "AI autofill" from the column menu: fill (empty) cells of one column with AI, with a credit budget. */
import { Button } from "@vibe/core";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { BoardFull, ColumnDto } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import s from "./ai.module.css";

/** column types the AI can write (no computed/system columns) */
export const AUTOFILL_TYPES = new Set(["text", "long_text", "numbers", "status", "dropdown", "date", "checkbox", "link", "email", "phone", "rating"]);
const KINDS = ["autofill", "categorize", "summarize", "translate", "extract", "sentiment"] as const;

interface Result { filled: number; skipped: number; failed: { itemId: string; error: string }[]; credits: number; stoppedForBudget: boolean }

export function AutofillDialog({ column, board, onClose, onDone }: { column: ColumnDto; board: BoardFull; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [kind, setKind] = useState<(typeof KINDS)[number]>(column.type === "status" || column.type === "dropdown" ? "categorize" : "autofill");
  const [instruction, setInstruction] = useState("");
  const [sourceColumnId, setSource] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [language, setLanguage] = useState("Engels");
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState("");
  const maxCredits = 50;
  useEffect(() => { void api.get<{ configured: boolean; enabled: boolean }>("/api/v1/ai/status").then((x) => setConfigured(x.configured && x.enabled)).catch(() => undefined); }, []);
  const run = async () => {
    setBusy(true); setErr(""); setRes(null);
    try { const r = await api.post<Result>("/api/v1/ai/autofill", { boardId: board.board.id, columnId: column.id, kind, instruction: instruction || undefined, sourceColumnId: sourceColumnId || undefined, language: kind === "translate" ? language : undefined, onlyEmpty, maxCredits }); setRes(r); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : t("ai.error")); }
    finally { setBusy(false); }
  };
  const sources = board.columns.filter((c) => c.id !== column.id && c.scope !== "subitem" && !["button", "file"].includes(c.type));
  return (
    <div className={`${s.dlg} ${s.ai}`} role="dialog" aria-modal="true" aria-label={t("ai.fill.menu")} data-testid="autofill-dialog">
      <div className={s.dlgBox}>
        <h2 className={s.dlgTitle}>{t("ai.fill.title", { name: column.title })}</h2>
        {!configured ? <div className={s.banner} style={{ margin: "8px 0" }} data-testid="autofill-not-configured"><strong>{t("ai.notConfigured")}</strong></div> : null}
        <label className={s.field} style={{ marginTop: 12 }}><span className={s.label}>{t("ai.fill.kind")}</span>
          <select className={s.text} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} data-testid="autofill-kind">{KINDS.map((k) => <option key={k} value={k}>{t(`ai.fill.kind.${k}`)}</option>)}</select></label>
        <label className={s.field}><span className={s.label}>{t("ai.fill.source")}</span>
          <select className={s.text} value={sourceColumnId} onChange={(e) => setSource(e.target.value)} data-testid="autofill-source"><option value="">{t("ai.fill.wholeItem")}</option>{sources.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        {kind === "translate" ? <label className={s.field}><span className={s.label}>Taal</span><input className={s.text} value={language} onChange={(e) => setLanguage(e.target.value)} /></label> : null}
        <label className={s.field}><span className={s.label}>{t("ai.fill.instruction")}</span><textarea className={s.text} rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} data-testid="autofill-instruction" /></label>
        <label className={s.row} style={{ marginBottom: 6 }}><input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} /> {t("ai.fill.onlyEmpty")}</label>
        <p className={s.hint}>{t("ai.fill.budget", { n: maxCredits })}</p>
        {err ? <div className={s.err} role="alert" data-testid="autofill-error">{err}</div> : null}
        {res ? <div className={s.ok} data-testid="autofill-result">{t("ai.fill.done", { filled: res.filled, skipped: res.skipped, failed: res.failed.length, credits: res.credits })}{res.stoppedForBudget ? ` ${t("ai.fill.budgetStop")}` : ""}</div> : null}
        <div className={s.rowEnd} style={{ marginTop: 12 }}>
          <Button size="small" kind="tertiary" onClick={onClose} data-testid="autofill-close">{t("common.close")}</Button>
          <Button size="small" kind="primary" onClick={() => void run()} disabled={busy || !configured} data-testid="autofill-run">{busy ? t("ai.fill.running") : t("ai.fill.run")}</Button>
        </div>
      </div>
    </div>
  );
}
