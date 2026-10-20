"use client";

import { Icon } from "@vibe/core";
import { DropdownChevronDown, Favorite, Info, Integrations, Link as LinkIcon, Menu as DotsIcon, Robot } from "@vibe/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/columns/shared";
import { useCurrentUser } from "@/components/shell/user-context";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { BoardFull } from "@/lib/board-types";
import type { BoardActions } from "./use-board";
import { BoardInfoPanel } from "./chrome/board-info-panel";
import { BoardSettingsDialog, type SettingsTab } from "./chrome/board-settings-dialog";
import { absoluteBoardUrl, archiveBoard, copyText, deleteBoard, exportBoardFile, notifyNavChanged } from "./chrome/ops";
import { useDialogs } from "./chrome/use-dialogs";
import { InlineText } from "./ui/inline-text";
import { ActionMenu } from "./ui/menu";
import { AutomateButton } from "@/modules/automations/automate-button";
import styles from "./board-page.module.css";
import chrome from "./chrome/chrome.module.css";

const LONG_DESCRIPTION = 140;

export function BoardHeader({ board, actions, canEditStructure }: { board: BoardFull; actions: BoardActions; canEditStructure: boolean }) {
  const t = useT();
  const router = useRouter();
  const dialogs = useDialogs();
  const me = useCurrentUser();
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const [menuAlign, setMenuAlign] = useState<"start" | "end">("end");
  const [members, setMembers] = useState<{ userId: string; name: string }[]>([]);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [descEditing, setDescEditing] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const b = board.board;

  useEffect(() => {
    let alive = true;
    api.get<{ userId: string; name: string }[]>(`/api/v1/boards/${b.id}/members`).then((m) => alive && setMembers(m)).catch(() => undefined);
    return () => { alive = false; };
  }, [b.id, settingsTab]);

  // remember the visit for "recent boards" (fire and forget)
  useEffect(() => {
    void api.post(`/api/v1/boards/${b.id}/visit`, {}).catch(() => undefined);
  }, [b.id]);

  const openMenu = (el: HTMLElement, align: "start" | "end") => { setMenuAlign(align); setMenuEl(menuEl ? null : el); };
  const toast = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 2500); };
  const after = (path: string | null) => { notifyNavChanged(); router.refresh(); if (path) router.push(path); };
  const fail = (e: unknown) => toast(e instanceof Error ? e.message : t("common.error"));
  const desc = b.description ?? "";
  const longDesc = desc.length > LONG_DESCRIPTION || desc.includes("\n");

  const confirm = (title: string, message: string, confirmLabel: string, onConfirm: () => Promise<unknown>) =>
    dialogs.open({ kind: "confirm", spec: { title, message, confirmLabel, danger: true, onConfirm } });

  return (
    <div className={styles.header}>
      <div className={chrome.hRow}>
        <h1 className={chrome.hTitle} data-testid="board-title">
          <InlineText value={b.name} disabled={!canEditStructure} testId="board-title-text" onCommit={(v) => void actions.updateBoard({ name: v }).then(notifyNavChanged)} />
        </h1>
        <button type="button" className={chrome.hIcon} onClick={(e) => openMenu(e.currentTarget, "start")} aria-label={t("board.menu")} data-testid="board-title-chevron">
          <Icon icon={DropdownChevronDown} size={20} ignoreFocusStyle />
        </button>
        <button type="button" className={`${chrome.hIcon} ${b.isFavorite ? styles.fav : ""}`} onClick={() => void actions.toggleFavorite().then(() => router.refresh())} aria-label={b.isFavorite ? t("board.unfavorite") : t("board.favorite")} title={b.isFavorite ? t("board.unfavorite") : t("board.favorite")} data-testid="favorite-toggle" aria-pressed={b.isFavorite}>
          <Icon icon={Favorite} size={18} ignoreFocusStyle />
        </button>
        <button type="button" className={chrome.hIcon} onClick={() => setInfoOpen((o) => !o)} aria-label={t("chrome.boardInfo")} title={t("chrome.boardInfo")} data-testid="board-info-button" aria-pressed={infoOpen}>
          <Icon icon={Info} size={18} ignoreFocusStyle />
        </button>
        {b.visibility !== "public" ? <span className={chrome.badge} data-testid="board-visibility-badge">{b.visibility === "private" ? t("chrome.typePrivate") : t("chrome.typeShare")}</span> : null}
        <span className={styles.spacer} />
        <div className={chrome.hRight}>
          <button type="button" className={chrome.hGhost} onClick={() => window.dispatchEvent(new CustomEvent("weekend:sidekick-open"))} data-testid="board-ai"><Icon icon={Robot} size={16} ignoreFocusStyle />{t("chrome.aiSuggestions")}<span className={chrome.newTag}>{t("chrome.new")}</span></button>
          <Link href="/integrations" className={chrome.hGhost} data-testid="board-integrate"><Icon icon={Integrations} size={16} ignoreFocusStyle />{t("board.integrate")}</Link>
          <AutomateButton board={board} />
          <Link href="/agents?view=mine" className={chrome.hGhost} data-testid="board-agents"><Icon icon={Robot} size={16} ignoreFocusStyle />{t("chrome.agents")}</Link>
          <span className={styles.members} title={t("board.members")} data-testid="board-members">
            <UserAvatar user={{ id: me.id, name: me.name, photoUrl: me.photoUrl ?? null }} />
          </span>
          <span className={chrome.inviteGroup}>
            <button type="button" className={chrome.inviteMain} onClick={() => setSettingsTab("members")} data-testid="board-share">{t("board.invite")} / {Math.max(members.length, 1)}</button>
            <button type="button" className={chrome.inviteLink} onClick={() => void copyText(absoluteBoardUrl(b.id)).then(() => toast(t("chrome.linkCopied")))} aria-label={t("chrome.copyLink")} title={t("chrome.copyLink")} data-testid="board-copy-link"><Icon icon={LinkIcon} size={16} ignoreFocusStyle /></button>
          </span>
          <button type="button" className={chrome.hIcon} onClick={(e) => openMenu(e.currentTarget, "end")} aria-label={t("board.menu")} data-testid="board-menu">
            <Icon icon={DotsIcon} size={20} ignoreFocusStyle />
          </button>
        </div>
        {menuEl ? (
          <ActionMenu
            anchorEl={menuEl}
            align={menuAlign}
            onClose={() => setMenuEl(null)}
            items={[
              { label: t("chrome.boardSettings"), testId: "menu-settings", onClick: () => setSettingsTab("general") },
              { label: t("chrome.boardInfo"), testId: "menu-info", onClick: () => setInfoOpen(true) },
              { divider: true },
              { label: b.isFavorite ? t("board.unfavorite") : t("board.favorite"), testId: "menu-favorite", onClick: () => void actions.toggleFavorite().then(() => router.refresh()) },
              { label: t("common.duplicate"), testId: "menu-duplicate", onClick: () => dialogs.open({ kind: "duplicate-board", boardId: b.id, name: b.name, onDone: (id) => after(`/boards/${id}`) }) },
              { label: t("chrome.moveTo"), testId: "menu-move", disabled: !canEditStructure, onClick: () => dialogs.open({ kind: "move-board", boardId: b.id, name: b.name, workspaceId: b.workspaceId, folderId: b.folderId, onDone: () => after(null) }) },
              { label: t("chrome.copyLink"), testId: "menu-copy-link", onClick: () => void copyText(absoluteBoardUrl(b.id)).then(() => toast(t("chrome.linkCopied"))) },
              { divider: true },
              { title: t("chrome.export") },
              { label: t("chrome.exportXlsx"), testId: "menu-export-xlsx", onClick: () => void exportBoardFile(b.id, { format: "xlsx" }).catch(fail) },
              { label: t("chrome.exportCsv"), testId: "menu-export-csv", onClick: () => void exportBoardFile(b.id, { format: "csv" }).catch(fail) },
              { divider: true },
              { label: t("common.archive"), testId: "menu-archive", disabled: !canEditStructure, onClick: () => confirm(t("chrome.archiveTitle"), t("chrome.archiveMessage", { name: b.name }), t("common.archive"), () => archiveBoard(b.id).then(() => after("/"))) },
              { label: t("common.delete"), danger: true, disabled: !canEditStructure, testId: "board-delete", onClick: () => confirm(t("chrome.deleteTitle"), t("chrome.deleteMessage", { name: b.name }), t("common.delete"), () => deleteBoard(b.id).then(() => after("/"))) },
            ]}
          />
        ) : null}
      </div>
      <div className={`${chrome.hDesc} ${chrome.descWrap}`}>
        {descEditing ? (
          <InlineText value={desc} placeholder={t("board.addDescription")} disabled={!canEditStructure} multiline editing onEditingChange={setDescEditing} onCommit={(v) => void actions.updateBoard({ description: v || null })} testId="board-description" />
        ) : (
          <>
            <span
              className={!descOpen && longDesc ? chrome.descClamp : undefined}
              style={{ display: !descOpen && longDesc ? undefined : "inline-block", cursor: canEditStructure ? "text" : "default", whiteSpace: "pre-wrap", padding: "0 4px" }}
              data-testid="board-description"
              onClick={() => canEditStructure && setDescEditing(true)}
            >
              {desc || (canEditStructure ? <span style={{ opacity: 0.8 }}>{t("board.addDescription")}</span> : null)}
            </span>
            {longDesc ? <button type="button" className={chrome.linkBtn} onClick={() => setDescOpen((o) => !o)} data-testid="description-toggle">{descOpen ? t("chrome.showLess") : t("chrome.showMore")}</button> : null}
          </>
        )}
      </div>
      {infoOpen ? <BoardInfoPanel board={board} onClose={() => setInfoOpen(false)} /> : null}
      {settingsTab ? <BoardSettingsDialog board={board} actions={actions} initialTab={settingsTab} onClose={() => setSettingsTab(null)} /> : null}
      {dialogs.element}
      {flash ? <div className={styles.toast} role="status" data-testid="header-flash">{flash}</div> : null}
    </div>
  );
}
