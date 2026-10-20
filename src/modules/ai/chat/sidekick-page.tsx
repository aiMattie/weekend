"use client";

import { Icon } from "@vibe/core";
import { Add, Delete } from "@vibe/icons";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { SparkleIcon } from "../icons";
import { ChatView } from "./chat-view";
import { MagicDialog } from "./magic-dialog";
import { useChat, type ConversationRow } from "./use-chat";
import s from "../ai.module.css";

/** /sidekick: full page version (history on the left). */
export function SidekickPage() {
  const t = useT();
  const chat = useChat(null);
  const [chats, setChats] = useState<ConversationRow[]>([]);
  const [magic, setMagic] = useState(false);
  const reload = useCallback(() => { void api.get<ConversationRow[]>("/api/v1/ai/conversations").then(setChats).catch(() => undefined); }, []);
  useEffect(() => { reload(); }, [reload, chat.conversationId, chat.busy]);
  const del = async (id: string) => { await api.del(`/api/v1/ai/conversations/${id}`); if (chat.conversationId === id) chat.newChat(); reload(); };
  return (
    <div className={`${s.page} ${s.ai}`} data-testid="sidekick-page">
      <aside className={s.side}>
        <div className={s.sideTitle}>{t("ai.sk.title")}</div>
        <button type="button" className={s.sideBtn} onClick={chat.newChat} data-testid="sk-new-chat"><Icon icon={Add} size={18} ignoreFocusStyle />{t("ai.sk.newChat")}</button>
        <button type="button" className={s.sideBtn} onClick={() => setMagic(true)} data-testid="sk-magic"><SparkleIcon size={18} />{t("ai.magic.entry")}</button>
        <div className={s.sideSep}>{t("ai.sk.allChats")}</div>
        {chats.length ? chats.map((c) => (
          <div key={c.id} className={s.chatRow}>
            <button type="button" className={`${s.sideBtn} ${chat.conversationId === c.id ? s.sideActive : ""}`} onClick={() => void chat.load(c.id)} data-testid="sk-chat-row">{c.title}</button>
            <button type="button" className={`${s.iconBtn} ${s.chatDel}`} onClick={() => void del(c.id)} aria-label={t("ai.sk.deleteChat")}><Icon icon={Delete} size={14} ignoreFocusStyle /></button>
          </div>
        )) : <div className={s.muted} style={{ padding: "4px 10px", fontSize: 13 }}>{t("ai.sk.noChats")}</div>}
      </aside>
      <div className={s.pageMain}>
        <ChatView chat={chat} suggestions={[t("ai.sk.sug.mywork"), t("ai.sk.sug.overdue")]} testId="sidekick-page-chat" />
      </div>
      {magic ? <MagicDialog configured={!!chat.status?.configured && !!chat.status?.enabled} onClose={() => setMagic(false)} /> : null}
    </div>
  );
}
