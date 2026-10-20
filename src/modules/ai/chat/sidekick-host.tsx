"use client";

/**
 * Right-hand Sidekick panel. Opened by the rail entry "Sidekick" (window event) and aware of where the
 * user is: /boards/:id = board, ?item=:id = item, /docs/:id = doc. Mounted once in the AppShell.
 */
import { Icon } from "@vibe/core";
import { Add, CloseSmall, Fullscreen } from "@vibe/icons";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { SparkleIcon } from "../icons";
import { ChatView } from "./chat-view";
import { useChat, type ChatContext } from "./use-chat";
import s from "../ai.module.css";

export const SIDEKICK_TOGGLE_EVENT = "weekend:sidekick-toggle";
export const SIDEKICK_OPEN_EVENT = "weekend:sidekick-open";

function contextFor(pathname: string, item: string | null): ChatContext | null {
  if (item && /^\d+$/.test(item)) return { kind: "item", id: item };
  const board = /^\/boards\/(\d+)/.exec(pathname);
  if (board) return { kind: "board", id: board[1] };
  const doc = /^\/docs\/(\d+)/.exec(pathname);
  if (doc) return { kind: "doc", id: doc[1] };
  return null;
}

function Panel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const pathname = usePathname();
  const sp = useSearchParams();
  const ctx = contextFor(pathname, sp.get("item"));
  const chat = useChat(ctx);
  const label = ctx?.kind === "board" ? t("ai.sk.ctx.board") : ctx?.kind === "item" ? t("ai.sk.ctx.item") : ctx?.kind === "doc" ? t("ai.sk.ctx.doc") : null;
  const suggestions = ctx?.kind === "board" ? [t("ai.sk.sug.summary"), t("ai.sk.sug.overdue")] : [t("ai.sk.sug.mywork"), t("ai.sk.sug.overdue")];
  return (
    <aside className={`${s.panel} ${s.ai}`} data-testid="sidekick-panel" aria-label={t("ai.sk.title")}>
      <div className={s.panelHead}>
        <div className={s.panelTitle}><SparkleIcon size={18} />{t("ai.sk.title")}</div>
        <button type="button" className={s.iconBtn} onClick={chat.newChat} aria-label={t("ai.sk.newChat")} title={t("ai.sk.newChat")} data-testid="sidekick-new"><Icon icon={Add} size={16} ignoreFocusStyle /></button>
        <Link href="/sidekick" className={s.iconBtn} aria-label={t("ai.sk.expand")} title={t("ai.sk.expand")} onClick={onClose} data-testid="sidekick-expand"><Icon icon={Fullscreen} size={16} ignoreFocusStyle /></Link>
        <button type="button" className={s.iconBtn} onClick={onClose} aria-label={t("ai.sk.close")} title={t("ai.sk.close")} data-testid="sidekick-close"><Icon icon={CloseSmall} size={18} ignoreFocusStyle /></button>
      </div>
      {label ? <div className={s.ctxLine} data-testid="sidekick-context" data-kind={ctx?.kind}>{label}</div> : null}
      <ChatView chat={chat} suggestions={suggestions} testId="sidekick-panel-chat" />
    </aside>
  );
}

export function SidekickHost() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    const openIt = () => setOpen(true);
    window.addEventListener(SIDEKICK_TOGGLE_EVENT, toggle);
    window.addEventListener(SIDEKICK_OPEN_EVENT, openIt);
    return () => { window.removeEventListener(SIDEKICK_TOGGLE_EVENT, toggle); window.removeEventListener(SIDEKICK_OPEN_EVENT, openIt); };
  }, []);
  if (!open || pathname === "/sidekick") return null;
  return <Suspense fallback={null}><Panel onClose={close} /></Suspense>;
}
