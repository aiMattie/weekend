"use client";

import { Avatar, IconButton } from "@vibe/core";
import { Notifications } from "@vibe/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { api } from "@/lib/api-client";
import { avatarColor, initials } from "@/lib/colors";
import { useT } from "@/lib/i18n/client";
import { relTime } from "./format";
import styles from "./inbox.module.css";
import type { NotificationPage } from "./types";

const POLL_MS = 10_000;

/** Top bar bell: unread badge (polled) + dropdown with the latest notifications. */
export function NotificationBell() {
  const t = useT();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<NotificationPage | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const refreshCount = useCallback(async () => {
    try { setUnread((await api.get<{ unread: number }>("/api/v1/inbox/unread-count")).unread); } catch { /* offline or logged out */ }
  }, []);
  const loadList = useCallback(async () => {
    try { const p = await api.get<NotificationPage>("/api/v1/inbox?limit=10"); setPage(p); setUnread(p.unread); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const first = setTimeout(refreshCount, 0);
    const iv = setInterval(refreshCount, POLL_MS);
    window.addEventListener("focus", refreshCount);
    return () => { clearTimeout(first); clearInterval(iv); window.removeEventListener("focus", refreshCount); };
  }, [refreshCount]);
  useEffect(() => { if (open) { const id = setTimeout(loadList, 0); return () => clearTimeout(id); } }, [open, loadList]);

  const markAll = async () => { await api.post("/api/v1/inbox/read-all"); await loadList(); };
  const go = async (n: NotificationPage["notifications"][number]) => {
    setOpen(false);
    if (!n.read) { await api.patch(`/api/v1/inbox/${n.id}`, { read: true }).catch(() => undefined); refreshCount(); }
    if (n.link) router.push(n.link);
  };

  return (
    <>
      <span ref={setAnchor} className={styles.bellWrap}>
        <IconButton icon={Notifications} kind="tertiary" aria-label={t("inbox.bellOpen")} onClick={() => setOpen((o) => !o)} data-testid="notification-bell" />
        {unread > 0 && <span className={styles.badge} data-testid="notification-badge">{unread > 99 ? "99+" : unread}</span>}
      </span>
      {open && (
        <Popover anchorEl={anchor} onClose={() => setOpen(false)} align="end">
          <div className={styles.bellPanel} data-testid="bell-dropdown">
            <div className={styles.bellHead}>
              {t("inbox.bellOpen")}
              <button type="button" className={styles.linkBtn} onClick={markAll} data-testid="bell-mark-all">{t("inbox.markAllRead")}</button>
            </div>
            <div className={styles.bellList}>
              {page && page.notifications.length === 0 && <div className={styles.empty}>{t("inbox.empty")}</div>}
              {page?.notifications.map((n) => (
                <button key={n.id} type="button" className={`${styles.row} ${n.read ? "" : styles.unread}`} onClick={() => go(n)} data-testid="bell-item">
                  {!n.read && <span className={styles.dot} />}
                  <Avatar type="text" text={n.actor ? initials(n.actor.name) : "S"} size="small" customBackgroundColor={avatarColor(n.actor?.id ?? "system")} withoutTooltip />
                  <span className={styles.rowBody}>
                    <span className={styles.rowTitle}>{n.title}</span>
                    {n.body && <span className={styles.rowSnippet} style={{ display: "block" }}>{n.body}</span>}
                    <span className={styles.rowMeta}>{relTime(n.createdAt, t)}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.bellFoot}><Link href="/inbox" onClick={() => setOpen(false)} data-testid="bell-view-all">{t("inbox.viewAll")}</Link></div>
          </div>
        </Popover>
      )}
    </>
  );
}
