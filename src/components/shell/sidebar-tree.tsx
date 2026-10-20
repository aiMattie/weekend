"use client";

import { ActionMenu, type MenuEntry } from "@/components/board/ui/menu";
import { Archive, Board, BoardPrivate, Delete, DropdownChevronDown, DropdownChevronRight, Duplicate, Edit, ClassicFolder, Favorite, Link as LinkIcon, Menu as DotsIcon, Open, Workspace } from "@vibe/icons";
import Link from "next/link";
import { useState } from "react";
import type { NavBoard, NavData, NavFolder } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import styles from "./sidebar.module.css";
import type { SidebarActions } from "./sidebar-actions";

/** "..." button + action menu of a sidebar row (own popover menu: works the same in every browser/test). */
function RowMenu({ label, testId, items }: { label: string; testId?: string; items: MenuEntry[] }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return (
    <span className={styles.rowMenu} data-open={el ? "true" : undefined} onClick={(e) => e.stopPropagation()}>
      <button type="button" className={styles.iconBtn} aria-label={label} aria-haspopup="menu" data-testid={testId} onClick={(e) => setEl(el ? null : e.currentTarget)}>
        <DotsIcon size={16} />
      </button>
      {el ? <ActionMenu anchorEl={el} onClose={() => setEl(null)} items={items} /> : null}
    </span>
  );
}

export function BoardRow({ board, active, favorite, actions, canEdit = true }: { board: NavBoard; active: boolean; favorite: boolean; actions: SidebarActions; canEdit?: boolean }) {
  const t = useT();
  const Icon = board.kind === "board" ? Board : BoardPrivate;
  const items: MenuEntry[] = [
    { label: t("chrome.openNewTab"), icon: <Open size={16} />, testId: "board-menu-newtab", onClick: () => actions.openInNewTab(board.id) },
    { label: favorite ? t("board.unfavorite") : t("board.favorite"), icon: <Favorite size={16} />, testId: "board-menu-favorite", onClick: () => actions.toggleFavorite(board.id) },
    { label: t("chrome.copyLink"), icon: <LinkIcon size={16} />, testId: "board-menu-link", onClick: () => void actions.copyLink(board.id) },
    ...(canEdit ? [
      { label: t("common.rename"), icon: <Edit size={16} />, testId: "board-menu-rename", onClick: () => actions.renameBoard(board.id, board.name) },
      { label: t("common.duplicate"), icon: <Duplicate size={16} />, testId: "board-menu-duplicate", onClick: () => actions.duplicateBoard(board.id, board.name) },
      { label: t("chrome.moveTo"), icon: <Workspace size={16} />, testId: "board-menu-move", onClick: () => actions.moveBoard(board.id, board.name, board.workspaceId, board.folderId) },
      { label: t("common.archive"), icon: <Archive size={16} />, testId: "board-menu-archive", onClick: () => actions.archiveBoard(board.id, board.name) },
      { label: t("common.delete"), icon: <Delete size={16} />, danger: true, testId: "board-menu-delete", onClick: () => actions.deleteBoard(board.id, board.name) },
    ] : []),
  ];
  return (
    <div className={`${styles.boardRow} ${active ? styles.boardRowActive : ""}`} data-testid={`nav-board-${board.id}`}>
      <Link href={`/boards/${board.id}`} className={styles.boardName} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Icon size={18} className={styles.boardIcon} />
        <span className={styles.boardName}>{board.name}</span>
      </Link>
      <RowMenu label={t("board.menu")} testId={`nav-board-menu-${board.id}`} items={items} />
    </div>
  );
}

function FolderNode({ folder, nav, activeBoardId, actions, filter }: { folder: NavFolder; nav: NavData; activeBoardId: string | null; actions: SidebarActions; filter: string }) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const subFolders = nav.folders.filter((f) => f.parentFolderId === folder.id);
  const boards = nav.boards.filter((b) => b.folderId === folder.id && b.name.toLowerCase().includes(filter));
  if (filter && !boards.length && !subFolders.length) return null;
  const items: MenuEntry[] = [
    { label: t("shell.addBoard"), icon: <Board size={16} />, testId: "folder-menu-newboard", onClick: () => actions.newBoard(folder.workspaceId, folder.id) },
    { label: t("chrome.newSubfolder"), icon: <ClassicFolder size={16} />, testId: "folder-menu-subfolder", onClick: () => actions.newFolder(folder.workspaceId, folder.id) },
    { label: t("common.rename"), icon: <Edit size={16} />, testId: "folder-menu-rename", onClick: () => actions.renameFolder(folder.id, folder.name) },
    { label: t("chrome.changeColor"), icon: <Edit size={16} />, testId: "folder-menu-color", onClick: () => actions.editFolder(folder.workspaceId, folder) },
    { label: t("common.delete"), icon: <Delete size={16} />, danger: true, testId: "folder-menu-delete", onClick: () => actions.deleteFolder(folder.id, folder.name) },
  ];
  return (
    <div>
      <div className={styles.treeFolder} onClick={() => setOpen(!open)} data-testid={`nav-folder-${folder.id}`}>
        {open ? <DropdownChevronDown size={16} /> : <DropdownChevronRight size={16} />}
        <ClassicFolder size={18} className={styles.boardIcon} />
        <span className={styles.boardName}>{folder.name}</span>
        <RowMenu label={t("board.menu")} testId={`folder-menu-${folder.id}`} items={items} />
      </div>
      {open && (
        <div className={styles.treeChildren}>
          {subFolders.map((f) => <FolderNode key={f.id} folder={f} nav={nav} activeBoardId={activeBoardId} actions={actions} filter={filter} />)}
          {boards.map((b) => <BoardRow key={b.id} board={b} active={b.id === activeBoardId} favorite={nav.favorites.includes(b.id)} actions={actions} />)}
        </div>
      )}
    </div>
  );
}

/** Folders + boards of one workspace. */
export function WorkspaceTree({ workspaceId, nav, activeBoardId, actions, filter }: { workspaceId: string; nav: NavData; activeBoardId: string | null; actions: SidebarActions; filter: string }) {
  const t = useT();
  const rootFolders = nav.folders.filter((f) => f.workspaceId === workspaceId && !f.parentFolderId);
  const rootBoards = nav.boards.filter((b) => b.workspaceId === workspaceId && !b.folderId && b.name.toLowerCase().includes(filter));
  const any = rootFolders.length || rootBoards.length;
  return (
    <div className={styles.tree} data-testid="sidebar-tree">
      {rootFolders.map((f) => <FolderNode key={f.id} folder={f} nav={nav} activeBoardId={activeBoardId} actions={actions} filter={filter} />)}
      {rootBoards.map((b) => <BoardRow key={b.id} board={b} active={b.id === activeBoardId} favorite={nav.favorites.includes(b.id)} actions={actions} />)}
      {!any && <div className={styles.emptyHint}>{t("shell.noBoards")}</div>}
    </div>
  );
}

