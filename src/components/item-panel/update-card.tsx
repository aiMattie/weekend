"use client";

import { Icon } from "@vibe/core";
import { Delete, Edit, Pin, Reply, ThumbsUp } from "@vibe/icons";
import { useState } from "react";
import { UserAvatar } from "@/components/columns/shared";
import { api } from "@/lib/api-client";
import { useLocale, useT } from "@/lib/i18n/client";
import type { BoardFull } from "@/lib/board-types";
import type { UpdateDto } from "@/server/services/updates";
import { AttachmentList } from "./attachments";
import type { AssetDto } from "./assets";
import { timeAgo } from "./time";
import { UpdateEditor } from "./update-editor";
import styles from "./item-panel.module.css";

export type Dto = Omit<UpdateDto, "replies"> & { replies: Dto[] };

export interface CardCtx {
  board: BoardFull;
  itemId: string;
  me: { id: string; role: string };
  canComment: boolean;
  assetsByUpdate: Map<string, AssetDto[]>;
  /** ids that were unread when the panel opened (stay marked while the panel is open) */
  unreadIds: Set<string>;
  onChanged: () => void;
  submitUpdate: (body: string, files: File[], parentUpdateId?: string) => Promise<void>;
}

export function UpdateCard({ u, ctx, depth }: { u: Dto; ctx: CardCtx; depth: number }) {
  const t = useT();
  const locale = useLocale();
  const { board, me, canComment, onChanged } = ctx;
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const own = u.userId === me.id;
  const mayManage = (own || me.role === "admin") && canComment;
  const liked = u.likes.includes(me.id);
  const likers = u.likes.map((id) => board.users.find((x) => x.id === id)?.name ?? "?");
  const unread = ctx.unreadIds.has(u.id);
  const files = ctx.assetsByUpdate.get(u.id) ?? [];
  const seen = u.seenBy;

  const del = async () => {
    if (!window.confirm(t("panel.deleteUpdateConfirm"))) return;
    await api.del(`/api/v1/updates/${u.id}`);
    onChanged();
  };

  return (
    <div className={`${styles.card} ${depth ? styles.reply : ""} ${unread ? styles.unread : ""} ${u.pinned ? styles.pinnedCard : ""}`} data-testid="update-card" data-update-id={u.id} data-unread={unread ? "true" : "false"} data-pinned={u.pinned ? "true" : "false"}>
      <div className={styles.cardHead}>
        {u.author ? <UserAvatar user={u.author} size="small" /> : null}
        <span className={styles.author} data-testid="update-author">{u.author?.name ?? "System"}</span>
        <span className={styles.time} title={new Date(u.createdAt).toLocaleString(locale === "nl" ? "nl-NL" : "en-GB")}>{timeAgo(u.createdAt, locale)}{u.editedAt ? ` (${t("panel.edited")})` : ""}</span>
        {unread ? <span className={styles.newDot} data-testid="update-unread-dot" title={t("panel.unread")} /> : null}
        <span className={styles.spacer} />
        {u.pinned ? <span className={styles.pinIcon} data-testid="update-pinned-icon" title={t("panel.pinned")}><Icon icon={Pin} size={14} ignoreFocusStyle /></span> : null}
        {depth === 0 && canComment ? (
          <button type="button" className={styles.linkBtn} onClick={() => void api.post(`/api/v1/updates/${u.id}/pin`, { pinned: !u.pinned }).then(onChanged)} data-testid="update-pin">{u.pinned ? t("panel.unpin") : t("panel.pin")}</button>
        ) : null}
        {own && canComment ? (
          <button type="button" className={styles.iconBtn} onClick={() => setEditing((e) => !e)} aria-label={t("panel.editUpdate")} title={t("panel.editUpdate")} data-testid="update-edit">
            <Icon icon={Edit} size={16} ignoreFocusStyle />
          </button>
        ) : null}
        {mayManage ? (
          <button type="button" className={styles.iconBtn} onClick={() => void del()} aria-label={t("panel.deleteUpdate")} title={t("panel.deleteUpdate")} data-testid="update-delete">
            <Icon icon={Delete} size={16} ignoreFocusStyle />
          </button>
        ) : null}
      </div>
      {editing ? (
        <UpdateEditor
          compact autoFocus allowFiles={false} testPrefix="update-edit" users={board.users} teams={board.teams}
          initialHtml={u.body} submitLabel={t("common.save")} onCancel={() => setEditing(false)}
          onSubmit={async (body) => { await api.patch(`/api/v1/updates/${u.id}`, { body }); setEditing(false); onChanged(); }}
        />
      ) : (
        <div className={styles.body} data-testid="update-body" dangerouslySetInnerHTML={{ __html: u.body }} />
      )}
      <AttachmentList assets={files} canDelete={(a) => mayManage && !!a} onDelete={(a) => void api.del(`/api/v1/assets/${a.id}`).then(onChanged)} />
      <div className={styles.cardFoot}>
        <button type="button" className={`${styles.footBtn} ${liked ? styles.liked : ""}`} onClick={() => void api.post(`/api/v1/updates/${u.id}/like`, {}).then(onChanged)} data-testid="update-like" data-liked={liked ? "true" : "false"} title={likers.length ? t("panel.likedBy", { names: likers.join(", ") }) : undefined}>
          <Icon icon={ThumbsUp} size={14} ignoreFocusStyle /> {t("panel.like")}{u.likes.length ? ` (${u.likes.length})` : ""}
        </button>
        {canComment ? (
          <button type="button" className={styles.footBtn} onClick={() => setReplying((r) => !r)} data-testid="update-reply">
            <Icon icon={Reply} size={14} ignoreFocusStyle /> {t("panel.reply")}{u.replies.length ? ` (${u.replies.length})` : ""}
          </button>
        ) : null}
        <span className={styles.spacer} />
        {seen.length ? (
          <span className={styles.seen} data-testid="update-seen-by" title={t("panel.seenBy", { names: seen.map((s) => s.name).join(", ") })}>
            <span className={styles.seenAvatars}>
              {seen.slice(0, 4).map((s) => <UserAvatar key={s.id} user={{ id: s.id, name: s.name, photoUrl: board.users.find((x) => x.id === s.id)?.photoUrl ?? null }} size="xs" />)}
            </span>
            <span data-testid="update-seen-count">{t("panel.seenCount", { n: seen.length })}</span>
          </span>
        ) : null}
      </div>
      {u.replies.map((r) => <UpdateCard key={r.id} u={r} ctx={ctx} depth={1} />)}
      {replying ? (
        <UpdateEditor compact autoFocus testPrefix="reply" users={board.users} teams={board.teams} placeholder={t("panel.writeReply")} submitLabel={t("panel.reply")}
          onCancel={() => setReplying(false)}
          onSubmit={async (body, f) => { await ctx.submitUpdate(body, f, u.id); setReplying(false); }} />
      ) : null}
    </div>
  );
}
