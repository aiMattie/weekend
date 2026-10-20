"use client";

import { Search as SearchField } from "@vibe/core";
import { Add, Archive, Board, ClassicFolder, Delete, DropdownChevronDown, DropdownChevronRight, Edit, Favorite, Menu as DotsIcon, NavigationDoubleChevronLeft, Search, Workspace } from "@vibe/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ActionMenu, type MenuEntry } from "@/components/board/ui/menu";
import type { NavData } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import { usePersistentState } from "@/lib/use-persistent-state";
import { isNavActive, navFor } from "./nav-registry";
import styles from "./sidebar.module.css";
import { useSidebarActions } from "./sidebar-actions";
import { RecentSection } from "./sidebar-recent";
import { BoardRow, WorkspaceTree } from "./sidebar-tree";
import { useCurrentUser } from "./user-context";

const WS_KEY = "weekend.sidebar.workspace";
/** Same string as TOGGLE_SIDEBAR_EVENT in app-shell.tsx (not imported to avoid a cycle). */
const TOGGLE_SIDEBAR_EVENT = "weekend:toggle-sidebar";

function currentWorkspaceFromPath(pathname: string, nav: NavData): string | null {
  const board = /^\/boards\/(\d+)/.exec(pathname);
  if (board) return nav.boards.find((b) => b.id === board[1])?.workspaceId ?? null;
  const ws = /^\/workspaces\/(\d+)/.exec(pathname);
  return ws ? ws[1] : null;
}

const letter = (name: string) => name.replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toUpperCase();

export function Sidebar({ nav, collapsed }: { nav: NavData; collapsed: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();
  const [stored, setStored] = usePersistentState(WS_KEY, "");
  const [filter, setFilter] = useState("");
  const [searching, setSearching] = useState(false);
  const [favOpen, setFavOpen] = useState(true);
  const [appsOpen, setAppsOpen] = useState(true);
  const [wsEl, setWsEl] = useState<HTMLElement | null>(null);
  const [menu, setMenu] = useState<{ kind: "add" | "ws"; el: HTMLElement } | null>(null);

  // anything that renames/moves/archives boards dispatches this window event: re-render the server nav tree
  useEffect(() => {
    const on = () => router.refresh();
    window.addEventListener("weekend:nav-changed", on);
    return () => window.removeEventListener("weekend:nav-changed", on);
  }, [router]);

  const fromPath = currentWorkspaceFromPath(pathname, nav);
  const selectedId = useMemo(() => {
    const candidates = [fromPath, stored, nav.workspaces.find((w) => w.name === "Delivery")?.id, nav.workspaces[0]?.id];
    return candidates.find((id) => id && nav.workspaces.some((w) => w.id === id)) ?? null;
  }, [fromPath, stored, nav.workspaces]);
  const select = (id: string) => setStored(id);
  const actions = useSidebarActions(select);
  const ws = nav.workspaces.find((w) => w.id === selectedId) ?? null;
  const activeBoardId = /^\/boards\/(\d+)/.exec(pathname)?.[1] ?? null;
  const favorites = nav.favorites.map((id) => nav.boards.find((b) => b.id === id)).filter(Boolean) as NavData["boards"];
  const topItems = navFor("sidebar-top", user.role);

  const wsMenuItems: MenuEntry[] = ws ? [
    { label: t("chrome.editWorkspace"), icon: <Edit size={16} />, testId: "workspace-menu-edit", onClick: () => actions.editWorkspace(ws.id) },
    { label: t("shell.addFolder"), icon: <ClassicFolder size={16} />, testId: "workspace-menu-folder", onClick: () => actions.newFolder(ws.id) },
    { label: t("common.archive"), icon: <Archive size={16} />, testId: "workspace-menu-archive", onClick: () => actions.archiveWorkspace(ws.id, ws.name) },
    { label: t("common.delete"), icon: <Delete size={16} />, danger: true, testId: "workspace-menu-delete", onClick: () => actions.deleteWorkspace(ws.id, ws.name) },
  ] : [];
  const addMenuItems: MenuEntry[] = [
    { label: t("shell.addBoard"), icon: <Board size={16} />, disabled: !ws, testId: "add-board", onClick: () => ws && actions.newBoard(ws.id) },
    { label: t("shell.addFolder"), icon: <ClassicFolder size={16} />, disabled: !ws, testId: "add-folder", onClick: () => ws && actions.newFolder(ws.id) },
    { label: t("shell.addWorkspace"), icon: <Workspace size={16} />, testId: "add-workspace", onClick: () => actions.newWorkspace() },
  ];

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`} data-testid="sidebar" aria-hidden={collapsed}>
      <div className={styles.sidebarInner}>
        <div className={styles.head}>
          <span className={styles.headTitle}>{t("chrome.workspaceHeading")}</span>
          <button type="button" className={styles.iconBtn} onClick={() => setSearching((s) => !s)} aria-label={t("shell.filterBoards")} data-testid="sidebar-search-toggle"><Search size={18} /></button>
          <button type="button" className={styles.iconBtn} onClick={() => window.dispatchEvent(new Event(TOGGLE_SIDEBAR_EVENT))} aria-label={t("shell.collapse")} data-testid="sidebar-collapse"><NavigationDoubleChevronLeft size={18} /></button>
        </div>
        <div className={styles.wsRow}>
          <div className={styles.wsSelect} data-testid="workspace-select">
            <button type="button" className={styles.wsButton} onClick={(e) => setWsEl(wsEl ? null : e.currentTarget)} aria-label={t("shell.workspaces")} aria-haspopup="menu" data-testid="workspace-select-button">
              {ws && <span className={styles.wsBadge} style={{ background: ws.color ?? "#0073ea" }}>{letter(ws.name)}</span>}
              <span className={styles.wsName} data-testid="workspace-select-name">{ws?.name ?? t("shell.workspaces")}</span>
              <DropdownChevronDown size={18} />
            </button>
            {wsEl ? (
              <ActionMenu
                anchorEl={wsEl}
                onClose={() => setWsEl(null)}
                items={nav.workspaces.map((w) => ({ key: w.id, label: w.name, active: w.id === ws?.id, testId: `workspace-option-${w.name}`, onClick: () => select(w.id) }))}
              />
            ) : null}
          </div>
          <button type="button" className={styles.plusBtn} onClick={(e) => setMenu(menu?.kind === "add" ? null : { kind: "add", el: e.currentTarget })} aria-label={t("common.add")} aria-haspopup="menu" data-testid="sidebar-add"><Add size={22} /></button>
        </div>
        {searching || filter ? (
          <div className={styles.filterRow}>
            <SearchField value={filter} onChange={(v: string) => setFilter(v.toLowerCase())} placeholder={t("shell.filterBoards")} size="small" autoFocus data-testid="sidebar-filter" />
          </div>
        ) : null}
        <div className={styles.contentHead}>
          <span className={styles.contentTitle}>{t("chrome.content")}</span>
          {ws && (
            <button type="button" className={styles.iconBtn} onClick={(e) => setMenu(menu?.kind === "ws" ? null : { kind: "ws", el: e.currentTarget })} aria-label={t("chrome.workspaceMenu")} aria-haspopup="menu" data-testid="workspace-menu"><DotsIcon size={18} /></button>
          )}
          {ws && (
            <button type="button" className={styles.iconBtn} onClick={() => actions.newBoard(ws.id)} aria-label={t("shell.addBoard")} data-testid="content-add-board"><Add size={20} /></button>
          )}
        </div>
        {menu ? <ActionMenu anchorEl={menu.el} align={menu.kind === "add" ? "start" : "end"} onClose={() => setMenu(null)} items={menu.kind === "add" ? addMenuItems : wsMenuItems} /> : null}
        <div className={styles.scroll}>
          {ws && (
            <Link href={`/workspaces/${ws.id}`} className={`${styles.sideLink} ${pathname === `/workspaces/${ws.id}` ? styles.sideLinkActive : ""}`} data-testid="nav-manage-workspace">
              <Workspace size={18} className={styles.sideIcon} /> {t("chrome.manageWorkspace")}
            </Link>
          )}
          {ws && <WorkspaceTree workspaceId={ws.id} nav={nav} activeBoardId={activeBoardId} actions={actions} filter={filter} />}
          {actions.error && <div className={styles.emptyHint} role="alert">{actions.error}</div>}

          <div className={styles.divider} />
          <button className={styles.sectionHeader} onClick={() => setFavOpen(!favOpen)} data-testid="favorites-toggle">
            {favOpen ? <DropdownChevronDown size={16} /> : <DropdownChevronRight size={16} />}
            <Favorite size={16} /> {t("shell.favorites")}
          </button>
          {favOpen && (
            <div className={styles.sectionList} data-testid="favorites-list">
              {favorites.length ? favorites.map((b) => <BoardRow key={b.id} board={b} active={b.id === activeBoardId} favorite actions={actions} />) : <div className={styles.emptyHint}>{t("shell.noFavorites")}</div>}
            </div>
          )}
          <RecentSection nav={nav} activeBoardId={activeBoardId} actions={actions} />

          <div className={styles.divider} />
          <button className={styles.sectionHeader} onClick={() => setAppsOpen(!appsOpen)} data-testid="apps-toggle">
            {appsOpen ? <DropdownChevronDown size={16} /> : <DropdownChevronRight size={16} />}
            {t("chrome.apps")}
          </button>
          {appsOpen && (
            <div className={styles.sectionList} data-testid="sidebar-apps">
              {topItems.map((n) => (
                <Link key={n.id} href={n.href} className={`${styles.sideLink} ${isNavActive(n, pathname) ? styles.sideLinkActive : ""}`} data-testid={`nav-${n.id}`}>
                  <n.icon size={18} className={styles.sideIcon} /> {t(n.labelKey)}
                </Link>
              ))}
              <Link href="/archive" className={`${styles.sideLink} ${pathname === "/archive" ? styles.sideLinkActive : ""}`} data-testid="nav-archive"><Archive size={18} className={styles.sideIcon} /> {t("chrome.archive")}</Link>
              <Link href="/trash" className={`${styles.sideLink} ${pathname === "/trash" ? styles.sideLinkActive : ""}`} data-testid="nav-trash"><Delete size={18} className={styles.sideIcon} /> {t("chrome.trash")}</Link>
            </div>
          )}
        </div>
      </div>
      {actions.dialog}
    </aside>
  );
}
