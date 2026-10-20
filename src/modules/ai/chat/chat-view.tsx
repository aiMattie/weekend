"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { useCurrentUser } from "@/components/shell/user-context";
import { SparkleIcon } from "../icons";
import { ActionCard } from "./action-card";
import { RenderText } from "./render-text";
import type { useChat } from "./use-chat";
import s from "../ai.module.css";

type Chat = ReturnType<typeof useChat>;

/** Not configured / switched off / out of credits: the explicit states of the module. */
export function StatusBanner({ status }: { status: Chat["status"] }) {
  const t = useT();
  if (!status) return null;
  if (!status.configured) return <div className={s.banner} data-testid="ai-not-configured"><strong>{t("ai.notConfigured")}</strong>{t("ai.notConfigured.sub")}</div>;
  if (!status.enabled) return <div className={s.banner} data-testid="ai-disabled"><strong>{t("ai.disabled")}</strong></div>;
  const c = status.credits;
  if (c.userLimit !== null && c.userUsed >= c.userLimit) return <div className={`${s.banner} ${s.bannerRed}`} data-testid="ai-credits-out"><strong>{t("ai.creditsOut")}</strong></div>;
  return null;
}

export function CreditCounter({ status }: { status: Chat["status"] }) {
  const t = useT();
  if (!status?.configured) return <span />;
  const c = status.credits;
  return <span data-testid="ai-credits">{c.userLimit === null ? t("ai.creditsUnlimited", { used: c.userUsed }) : t("ai.credits", { used: c.userUsed, limit: c.userLimit })}</span>;
}

export function ChatView({ chat, suggestions, testId = "sidekick-chat" }: { chat: Chat; suggestions?: string[]; testId?: string }) {
  const t = useT();
  const user = useCurrentUser();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const { status, messages, actions, tools, busy, error } = chat;
  const blocked = !status || !status.configured || !status.enabled || (status.credits.userLimit !== null && status.credits.userUsed >= status.credits.userLimit);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, actions, tools]);
  const submit = () => { const v = draft.trim(); if (!v || busy || blocked) return; setDraft(""); void chat.send(v); };
  return (
    <div className={`${s.chat} ${s.ai}`} data-testid={testId}>
      <StatusBanner status={status} />
      <div className={s.scroll} data-testid="ai-messages">
        {!messages.length && !actions.length ? (
          <div className={s.hello}>
            <div className={s.helloIcon}><SparkleIcon size={24} /></div>
            <h2 className={s.helloTitle}>{t("ai.sk.hello", { name: user.name.split(" ")[0] })}</h2>
            <p className={s.helloSub}>{t("ai.sk.helloSub")}</p>
            {!blocked && suggestions?.length ? <div className={s.chips}>{suggestions.map((q) => <button key={q} type="button" className={s.chip} onClick={() => void chat.send(q)} data-testid="ai-suggestion">{q}</button>)}</div> : null}
          </div>
        ) : null}
        {messages.map((m) => m.role === "user" ? <div key={m.id} className={s.msgUser} data-testid="ai-msg-user">{m.text}</div>
          : m.role === "note" ? <div key={m.id} className={s.msgNote}>{m.text}</div>
          : (
            <div key={m.id} className={s.msgBot} data-testid="ai-msg-assistant">
              <span className={s.botDot}><SparkleIcon size={14} /></span>
              <div className={s.botText}><RenderText text={m.text} />{m.streaming ? <span className={s.cursor} /> : null}</div>
            </div>
          ))}
        {tools.map((n, i) => <div key={i} className={`${s.toolNote} ${n.status === "error" ? s.toolErr : ""}`} data-testid="ai-tool-note">{n.status === "running" ? "..." : n.status === "error" ? "!" : "✓"} {t("ai.sk.tool", { name: n.name })}{n.status === "error" && n.detail ? ` (${n.detail})` : ""}</div>)}
        {actions.map((a) => <ActionCard key={a.id} action={a} onDecide={(id, ok) => void chat.decide(id, ok)} />)}
        {busy && !messages.some((m) => m.streaming && m.text) ? <div className={s.toolNote} data-testid="ai-thinking">{t("ai.sk.thinking")}</div> : null}
        {error ? <div className={s.err} role="alert" data-testid="ai-error">{error}</div> : null}
        <div ref={endRef} />
      </div>
      <div className={s.composer}>
        <div className={s.box}>
          <textarea className={s.input} rows={1} value={draft} disabled={blocked} placeholder={t("ai.sk.placeholder")} aria-label={t("ai.sk.placeholder")} data-testid="ai-input"
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
          <button type="button" className={s.send} onClick={submit} disabled={blocked || busy || !draft.trim()} aria-label={t("ai.sk.send")} data-testid="ai-send">↑</button>
        </div>
      </div>
      <div className={s.foot}><span>{t("ai.mayBeWrong")}</span><CreditCounter status={status} /></div>
    </div>
  );
}
