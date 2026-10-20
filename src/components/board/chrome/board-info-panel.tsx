"use client";

import { Icon } from "@vibe/core";
import { Close } from "@vibe/icons";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/columns/shared";
import { api } from "@/lib/api-client";
import type { BoardFull } from "@/lib/board-types";
import { useLocale, useT } from "@/lib/i18n/client";
import styles from "./chrome.module.css";

interface Info {
  description: string | null; kind: string; visibility: string; createdAt: string; updatedAt: string;
  workspace: { id: string; name: string } | null; folder: { id: string; name: string } | null; owner: { id: string; name: string } | null;
  counts: { items: number; subitems: number; groups: number; columns: number; members: number; views: number };
}
interface Member { userId: string; role: string; name: string }

/** Right-hand board info panel (opened with the "i" button in the board header). */
export function BoardInfoPanel({ board, onClose }: { board: BoardFull; onClose: () => void }) {
  const t = useT();
  const locale = useLocale();
  const id = board.board.id;
  const [info, setInfo] = useState<Info | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    let alive = true;
    api.get<Info>(`/api/v1/boards/${id}/info`).then((i) => alive && setInfo(i)).catch(() => undefined);
    api.get<Member[]>(`/api/v1/boards/${id}/members`).then((m) => alive && setMembers(m)).catch(() => undefined);
    return () => { alive = false; };
  }, [id, board.items.length, board.groups.length, board.board.description, board.board.workspaceId, board.board.folderId, board.board.name, board.board.visibility]);
  const date = (iso: string) => new Date(iso).toLocaleString(locale === "nl" ? "nl-NL" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  const count = (n: number | undefined, label: string) => (
    <div className={styles.count}><div className={styles.countNum}>{n ?? "-"}</div><div className={styles.countLabel}>{label}</div></div>
  );
  return (
    <aside className={styles.infoPanel} data-testid="board-info-panel">
      <div className={styles.infoHead}>
        <div className={styles.infoTitle}>{t("chrome.boardInfo")}</div>
        <button type="button" onClick={onClose} aria-label={t("common.close")} data-testid="info-close" style={{ border: 0, background: "transparent", cursor: "pointer" }}><Icon icon={Close} size={20} ignoreFocusStyle /></button>
      </div>
      <div className={styles.infoBody}>
        <div className={styles.infoSection}>
          <span className={styles.infoLabel}>{t("chrome.boardName")}</span>
          <span className={styles.infoValue} style={{ fontSize: 18, fontWeight: 600 }} data-testid="info-name">{board.board.name}</span>
        </div>
        <div className={styles.infoSection}>
          <span className={styles.infoLabel}>{t("chrome.description")}</span>
          <span className={styles.infoValue} data-testid="info-description">{board.board.description || t("chrome.noDescription")}</span>
        </div>
        <div className={styles.infoSection}>
          <span className={styles.infoLabel}>{t("chrome.boardType")}</span>
          <span className={styles.infoValue}>{t(`chrome.type${board.board.visibility === "public" ? "Main" : board.board.visibility === "share" ? "Share" : "Private"}`)}</span>
        </div>
        <div className={styles.infoSection}>
          <span className={styles.infoLabel}>{t("chrome.owner")}</span>
          <span className={styles.infoValue} data-testid="info-owner">{info?.owner?.name ?? "-"}</span>
        </div>
        <div className={styles.infoSection}>
          <span className={styles.infoLabel}>{t("chrome.location")}</span>
          <span className={styles.infoValue} data-testid="info-location">{info?.workspace?.name ?? "-"}{info?.folder ? ` / ${info.folder.name}` : ""}</span>
        </div>
        <div className={styles.infoSection}>
          <span className={styles.infoLabel}>{t("chrome.created")}</span>
          <span className={styles.infoValue}>{info ? date(info.createdAt) : "-"}</span>
        </div>
        <div className={styles.infoSection}>
          <span className={styles.infoLabel}>{t("chrome.lastChanged")}</span>
          <span className={styles.infoValue}>{info ? date(info.updatedAt) : "-"}</span>
        </div>
        <div className={styles.counts} data-testid="info-counts">
          {count(info?.counts.items, "Items")}
          {count(info?.counts.subitems, "Subitems")}
          {count(info?.counts.groups, "Groups")}
          {count(info?.counts.columns, t("chrome.columns"))}
          {count(info?.counts.views, "Views")}
          {count(info?.counts.members, t("chrome.tabMembers"))}
        </div>
        <div className={styles.infoSection}>
          <span className={styles.infoLabel}>{t("chrome.tabMembers")}</span>
          {members.map((m) => (
            <div key={m.userId} className={styles.memberRow} style={{ borderBottom: 0 }}>
              <UserAvatar user={{ id: m.userId, name: m.name, photoUrl: null }} size="xs" /><span className={styles.memberName}>{m.name}</span><span className={styles.memberMail}>{t(`chrome.role${m.role === "owner" ? "Owner" : m.role === "editor" ? "Editor" : "Viewer"}`)}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
