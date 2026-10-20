"use client";

import { Button } from "@vibe/core";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import type { UiAction } from "./use-chat";
import s from "../ai.module.css";

interface Spec { name: string; columns?: { title: string; type: string }[]; groups?: { title: string; items?: unknown[] }[] }

/** Confirmation card for a write Sidekick proposed. Nothing happens until "Bevestigen". */
export function ActionCard({ action, onDecide }: { action: UiAction; onDecide: (id: string, ok: boolean) => void }) {
  const t = useT();
  const spec = action.toolName === "weekend_magic" ? (action.preview as Spec | null) : null;
  const result = action.result as { id?: string; boardId?: string; name?: string } | null;
  return (
    <div className={s.card} data-testid="ai-action-card" data-status={action.status}>
      <div className={s.cardTitle}>{t("ai.sk.proposal")}</div>
      <div className={s.cardText} data-testid="ai-action-summary">{action.summary}</div>
      {spec ? (
        <div className={s.outline} data-testid="ai-magic-outline">
          <h4>{t("ai.sk.magicCard", { name: spec.name })}</h4>
          <div className={s.tags}>{(spec.columns ?? []).map((c) => <span key={c.title} className={s.tag}>{c.title} ({c.type})</span>)}</div>
          <div className={s.tags}>{(spec.groups ?? []).map((g) => <span key={g.title} className={s.tag}>{g.title} - {t("ai.magic.items", { n: g.items?.length ?? 0 })}</span>)}</div>
        </div>
      ) : null}
      {action.status === "pending" ? (
        <div className={s.cardBtns}>
          <Button size="small" kind="primary" onClick={() => onDecide(action.id, true)} data-testid="ai-confirm">{t("ai.sk.confirm")}</Button>
          <Button size="small" kind="tertiary" onClick={() => onDecide(action.id, false)} data-testid="ai-reject">{t("ai.sk.reject")}</Button>
        </div>
      ) : action.status === "confirmed" ? (
        <div className={s.cardDone} data-testid="ai-action-done">
          {t("ai.sk.status.confirmed")}
          {result?.boardId ? <> · <Link href={`/boards/${result.boardId}`} data-testid="ai-open-board">{t("ai.sk.openBoard")}</Link></> : null}
        </div>
      ) : action.status === "rejected" ? <div className={s.cardRej}>{t("ai.sk.status.rejected")}</div>
        : <div className={s.cardFail} role="alert">{t("ai.sk.status.failed")}{action.error ? `: ${action.error}` : ""}</div>}
    </div>
  );
}
