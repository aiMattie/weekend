"use client";

import { Avatar, Button, IconButton } from "@vibe/core";
import { Bookmark, Check, Delete, Settings } from "@vibe/icons";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { avatarColor, initials } from "@/lib/colors";
import { useT } from "@/lib/i18n/client";
import { relTime } from "./format";
import styles from "./inbox.module.css";
import { SettingsDialog } from "./settings-dialog";
import type { InboxFilter, NotificationDto, NotificationPage } from "./types";

const FILTERS: InboxFilter[] = ["all", "unread", "mentioned", "assigned", "bookmarked"];

interface UpdateLite { id: string; body: string; createdAt: string; author: { name: string } | null; replies: UpdateLite[] }
const findUpdate = (list: UpdateLite[], id: string): UpdateLite | null => {
  for (const u of list) {
    if (u.id === id) return u;
    const r = findUpdate(u.replies ?? [], id);
    if (r) return r;
  }
  return null;
};

function Avatar1({ n }: { n: NotificationDto }) {
  return <Avatar type="text" text={n.actor ? initials(n.actor.name) : "S"} size="medium" customBackgroundColor={avatarColor(n.actor?.id ?? "system")} withoutTooltip />;
}

function Detail({ n }: { n: NotificationDto }) {
  const t = useT();
  const [update, setUpdate] = useState<UpdateLite | null>(null);
  useEffect(() => {
    let alive = true;
    if (!n.itemId || !n.updateId) { setTimeout(() => alive && setUpdate(null), 0); return; }
    api.get<UpdateLite[]>(`/api/v1/items/${n.itemId}/updates`).then((l) => alive && setUpdate(findUpdate(l, n.updateId!))).catch(() => alive && setUpdate(null));
    return () => { alive = false; };
  }, [n.itemId, n.updateId]);
  return (
    <div data-testid="inbox-detail">
      <h2 className={styles.detailTitle}>{n.title}</h2>
      <div className={styles.detailMeta}>
        {n.actor?.name ?? t("inbox.system")} · {relTime(n.createdAt, t)}
        {n.itemName && <> · {t("inbox.on")} <strong>{n.itemName}</strong></>}{n.boardName && <> ({n.boardName})</>}
      </div>
      {n.updateId && (
        <div className={styles.card}>
          <div className={styles.cardHead}>{t("inbox.context")}{update?.author ? ` - ${update.author.name}` : ""}</div>
          {update ? <div className={styles.cardBody} data-testid="inbox-detail-update" dangerouslySetInnerHTML={{ __html: update.body }} /> : <div className={styles.cardBody}>{n.body ?? t("inbox.noUpdate")}</div>}
        </div>
      )}
      {!n.updateId && n.body && <div className={styles.card}><div className={styles.cardBody}>{n.body}</div></div>}
      {n.link && <Link href={n.link} className={styles.openBtn} data-testid="inbox-open-item">{t("inbox.openItem")}</Link>}
    </div>
  );
}

export function InboxPage() {
  const t = useT();
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [rows, setRows] = useState<NotificationDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<NotificationDto | null>(null);
  const selectedId = selected?.id ?? null;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async (more = false, from: string | null = null) => {
    const p = new URLSearchParams({ filter, limit: "30" });
    if (more && from) p.set("cursor", from);
    try {
      const r = await api.get<NotificationPage>(`/api/v1/inbox?${p}`);
      setRows((cur) => (more ? [...cur, ...r.notifications.filter((n) => !cur.some((c) => c.id === n.id))] : r.notifications));
      setCursor(r.nextCursor);
    } finally { setLoaded(true); }
  }, [filter]);

  useEffect(() => { const id = setTimeout(() => load(), 0); return () => clearTimeout(id); }, [load]);
  useEffect(() => {
    const on = () => load();
    window.addEventListener("focus", on);
    const iv = setInterval(on, 15_000);
    return () => { window.removeEventListener("focus", on); clearInterval(iv); };
  }, [load]);

  const patch = async (n: NotificationDto, body: { read?: boolean; bookmarked?: boolean }) => {
    const merge = <T extends NotificationDto>(x: T): T => ({ ...x, ...(body.read !== undefined ? { read: body.read } : {}), ...(body.bookmarked !== undefined ? { bookmarked: body.bookmarked } : {}) });
    setRows((cur) => cur.map((x) => (x.id === n.id ? merge(x) : x)));
    setSelected((cur) => (cur?.id === n.id ? merge(cur) : cur));
    await api.patch(`/api/v1/inbox/${n.id}`, body).catch(() => undefined);
    if (filter === "bookmarked") setTimeout(() => load(), 400);
  };
  const select = (n: NotificationDto) => {
    setSelected(n);
    if (!n.read) patch(n, { read: true });
  };
  const remove = async (n: NotificationDto) => {
    await api.del(`/api/v1/inbox/${n.id}`);
    setRows((cur) => cur.filter((x) => x.id !== n.id));
    if (selectedId === n.id) setSelected(null);
  };
  const markAll = async () => { await api.post("/api/v1/inbox/read-all"); await load(); };

  return (
    <div className={styles.layout} data-testid="inbox-page">
      <div className={styles.left}>
        <div className={styles.leftHead}>
          <h1 className={styles.title}>
            {t("inbox.title")}
            <IconButton icon={Settings} kind="tertiary" size="small" aria-label={t("inbox.settings")} onClick={() => setSettingsOpen(true)} data-testid="inbox-settings-button" />
          </h1>
          <div className={styles.tabs} role="tablist">
            {FILTERS.map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} className={`${styles.tab} ${filter === f ? styles.tabActive : ""}`} onClick={() => { setFilter(f); setSelected(null); }} data-testid={`inbox-tab-${f}`}>
                {t(`inbox.filter.${f}`)}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.tools}>
          <button type="button" className={styles.linkBtn} onClick={markAll} data-testid="inbox-mark-all">{t("inbox.markAllRead")}</button>
        </div>
        <div className={styles.list} data-testid="inbox-list">
          {loaded && rows.length === 0 && <div className={styles.empty} data-testid="inbox-empty">{filter === "unread" ? t("inbox.emptyUnread") : t("inbox.empty")}</div>}
          {rows.map((n) => (
            <div key={n.id} role="button" tabIndex={0} className={`${styles.row} ${n.read ? "" : styles.unread} ${n.id === selectedId ? styles.rowSelected : ""}`} onClick={() => select(n)} onKeyDown={(e) => { if (e.key === "Enter") select(n); }} data-testid="inbox-row" data-notification-id={n.id} data-read={n.read} data-type={n.type}>
              {!n.read && <span className={styles.dot} data-testid="inbox-unread-dot" />}
              <Avatar1 n={n} />
              <div className={styles.rowBody}>
                <div className={styles.rowTitle}>{n.title}</div>
                {n.body && <div className={styles.rowSnippet}>{n.body}</div>}
                <div className={styles.rowMeta}>
                  {relTime(n.createdAt, t)}{n.boardName ? ` · ${n.boardName}` : ""}
                  {n.bookmarked && <Bookmark size={14} className={styles.starred} />}
                </div>
              </div>
              <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                <IconButton icon={Check} size="xs" kind="tertiary" aria-label={n.read ? t("inbox.markUnread") : t("inbox.markRead")} onClick={() => patch(n, { read: !n.read })} data-testid="inbox-toggle-read" />
                <IconButton icon={Bookmark} size="xs" kind="tertiary" aria-label={n.bookmarked ? t("inbox.unbookmark") : t("inbox.bookmark")} onClick={() => patch(n, { bookmarked: !n.bookmarked })} data-testid="inbox-bookmark" />
                <IconButton icon={Delete} size="xs" kind="tertiary" aria-label={t("inbox.delete")} onClick={() => remove(n)} data-testid="inbox-delete" />
              </div>
            </div>
          ))}
          {cursor && <div style={{ padding: 12, textAlign: "center" }}><Button kind="tertiary" size="small" onClick={() => load(true, cursor)}>{t("inbox.loadMore")}</Button></div>}
        </div>
      </div>
      <div className={styles.right}>{selected ? <Detail n={selected} /> : <div className={styles.empty} data-testid="inbox-select-hint">{t("inbox.selectOne")}</div>}</div>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} onSaved={() => load()} />}
    </div>
  );
}
