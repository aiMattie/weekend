"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { UserLite } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import type { DocCommentDto } from "@/server/services/docs";
import styles from "./docs.module.css";

const fmt = (iso: string) => new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export interface CommentsPanelProps {
  docId: string;
  users: UserLite[];
  comments: DocCommentDto[];
  /** block the composer is attached to (null = whole doc) */
  blockId: string | null;
  onBlockChange: (id: string | null) => void;
  blockText: (id: string) => string;
  canComment: boolean;
  currentUserId: string;
  reload: () => void;
  onClose: () => void;
}

export function CommentsPanel({ docId, users, comments, blockId, onBlockChange, blockText, canComment, currentUserId, reload, onClose }: CommentsPanelProps) {
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (blockId) area.current?.focus(); }, [blockId]);

  const threads = useMemo(() => {
    const roots = comments.filter((c) => !c.parentId);
    return roots.filter((c) => showResolved || !c.resolved).map((root) => ({ root, replies: comments.filter((c) => c.parentId === root.id) }));
  }, [comments, showResolved]);

  const mentionQuery = /(?:^|\s)@([^@\n]{0,30})$/.exec(text)?.[1];
  const matches = mentionQuery === undefined ? [] : users.filter((u) => !u.isAiAgent && u.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6);

  const post = async (parentId?: string, body = text, block = blockId) => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/docs/${docId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, blockId: parentId ? undefined : block, parentId }) });
      if (r.ok) { if (!parentId) setText(""); reload(); }
    } finally { setBusy(false); }
  };
  const resolve = async (id: string, resolved: boolean) => {
    await fetch(`/api/v1/docs/${docId}/comments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolved }) });
    reload();
  };
  const del = async (id: string) => { await fetch(`/api/v1/docs/${docId}/comments/${id}`, { method: "DELETE" }); reload(); };

  return (
    <aside className={styles.side} data-testid="comments-panel">
      <div className={styles.sideHead}>
        <span style={{ flex: 1 }}>{t("docs.comments")}</span>
        <button type="button" className={styles.smallBtn} onClick={() => setShowResolved(!showResolved)}>{showResolved ? t("docs.hideResolved") : t("docs.showResolved")}</button>
        <button type="button" className={styles.smallBtn} onClick={onClose} aria-label={t("common.close")}>x</button>
      </div>
      <div className={styles.sideBody}>
        {!threads.length && <div className={styles.muted}>{t("docs.noComments")}</div>}
        {threads.map(({ root, replies }) => (
          <div key={root.id} className={`${styles.thread} ${root.resolved ? styles.threadResolved : ""}`} data-testid="comment-thread">
            {root.blockId && <div className={styles.quote}>{blockText(root.blockId) || t("docs.blockGone")}</div>}
            {[root, ...replies].map((c, i) => (
              <div key={c.id} className={`${styles.comment} ${i > 0 ? styles.reply : ""}`} data-testid="doc-comment">
                <div className={styles.commentMeta}>{c.authorName ?? "?"} · {fmt(c.createdAt)}</div>
                <div className={styles.commentBody}>{c.body}</div>
                {c.userId === currentUserId && <button type="button" className={styles.smallBtn} style={{ alignSelf: "flex-start" }} onClick={() => void del(c.id)}>{t("common.delete")}</button>}
              </div>
            ))}
            <ReplyBox disabled={!canComment} onSend={(b) => post(root.id, b)} />
            <div className={styles.rowBtns}>
              <button type="button" className={styles.smallBtn} onClick={() => void resolve(root.id, !root.resolved)} data-testid="comment-resolve">{root.resolved ? t("docs.reopen") : t("docs.resolve")}</button>
              {root.blockId && <button type="button" className={styles.smallBtn} onClick={() => onBlockChange(root.blockId)}>{t("docs.goToBlock")}</button>}
            </div>
          </div>
        ))}
      </div>
      {canComment && (
        <div className={styles.sideFoot}>
          {matches.length > 0 && (
            <div className={styles.mentionList} data-testid="comment-mentions">
              {matches.map((u) => (
                <button key={u.id} type="button" className={styles.mentionOpt} onMouseDown={(e) => { e.preventDefault(); setText(text.replace(/@([^@\n]{0,30})$/, `@${u.name} `)); area.current?.focus(); }}>{u.name}</button>
              ))}
            </div>
          )}
          {blockId ? (
            <div className={styles.quote} data-testid="comment-target">{blockText(blockId) || t("docs.thisBlock")} <button type="button" className={styles.smallBtn} onClick={() => onBlockChange(null)}>x</button></div>
          ) : <div className={styles.muted}>{t("docs.commentOnDoc")}</div>}
          <textarea ref={area} className={styles.textarea} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("docs.commentPlaceholder")} data-testid="comment-input" />
          <div className={styles.rowBtns}>
            <span className={styles.spacer} />
            <button type="button" className="mention-item" style={{ background: "var(--app-primary)", color: "#fff", width: "auto" }} disabled={!text.trim() || busy} onClick={() => void post()} data-testid="comment-submit">{t("docs.comment")}</button>
          </div>
        </div>
      )}
    </aside>
  );
}

function ReplyBox({ onSend, disabled }: { onSend: (body: string) => Promise<void>; disabled: boolean }) {
  const t = useT();
  const [v, setV] = useState("");
  if (disabled) return null;
  return (
    <div className={styles.rowBtns}>
      <input className={styles.input} value={v} onChange={(e) => setV(e.target.value)} placeholder={t("docs.reply")} onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { void onSend(v).then(() => setV("")); } }} data-testid="comment-reply" />
    </div>
  );
}

/* ------------------------------------------------------------------ versions */

interface VersionRow { id: string; title: string; createdAt: string; userName: string | null }

export function VersionsPanel({ docId, canEdit, onRestored, onClose }: { docId: string; canEdit: boolean; onRestored: () => void; onClose: () => void }) {
  const t = useT();
  const [rows, setRows] = useState<VersionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () => fetch(`/api/v1/docs/${docId}/versions`).then((r) => (r.ok ? r.json() : [])).then(setRows);
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => { setBusy(true); await fetch(`/api/v1/docs/${docId}/versions`, { method: "POST" }); await load(); setBusy(false); };
  const restore = async (id: string) => {
    if (!window.confirm(t("docs.restoreConfirm"))) return;
    setBusy(true);
    const r = await fetch(`/api/v1/docs/${docId}/versions/${id}`, { method: "POST" });
    setBusy(false);
    if (r.ok) onRestored();
  };
  return (
    <aside className={styles.side} data-testid="versions-panel">
      <div className={styles.sideHead}>
        <span style={{ flex: 1 }}>{t("docs.versions")}</span>
        <button type="button" className={styles.smallBtn} onClick={onClose} aria-label={t("common.close")}>x</button>
      </div>
      <div className={styles.sideBody}>
        {canEdit && <button type="button" className={styles.tbBtn} style={{ border: "1px solid var(--app-border)" }} disabled={busy} onClick={() => void save()} data-testid="version-save">{t("docs.saveVersion")}</button>}
        {!rows.length && <div className={styles.muted}>{t("docs.noVersions")}</div>}
        {rows.map((v) => (
          <div key={v.id} className={styles.version} data-testid="version-row">
            <div><div>{fmt(v.createdAt)}</div><div className={styles.muted}>{v.userName ?? t("docs.system")} · {v.title}</div></div>
            {canEdit && <button type="button" className={styles.smallBtn} disabled={busy} onClick={() => void restore(v.id)} data-testid="version-restore">{t("docs.restore")}</button>}
          </div>
        ))}
      </div>
    </aside>
  );
}
