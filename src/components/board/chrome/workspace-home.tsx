"use client";

import { Icon } from "@vibe/core";
import { Board, DropdownChevronDown, Favorite, Locked, Menu as DotsIcon, Time, Workspace as WorkspaceIcon, Team } from "@vibe/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserAvatar } from "@/components/columns/shared";
import { ActionMenu } from "@/components/board/ui/menu";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { notifyNavChanged } from "./ops";
import { useDialogs } from "./use-dialogs";
import styles from "./chrome.module.css";

export interface WsHomeData {
  workspace: { id: string; name: string; description: string | null; kind: "open" | "closed"; color: string | null };
  boards: { id: string; name: string; kind: string; folderId: string | null; visibility: string }[];
  folders: { id: string; name: string; parentFolderId: string | null }[];
  recentIds: string[];
  favoriteIds: string[];
  members: { userId: string; name: string; role: string }[];
  canManage: boolean;
}

type Tab = "recents" | "content" | "collaborators" | "permissions";

/** Workspace page (): grey banner, big letter tile, name, tabs Recents / Content / Collaborators / Permissions. */
export function WorkspaceHome({ data }: { data: WsHomeData }) {
  const t = useT();
  const router = useRouter();
  const dialogs = useDialogs();
  const { workspace: ws } = data;
  const [tab, setTab] = useState<Tab>("recents");
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null);
  const [favs, setFavs] = useState(new Set(data.favoriteIds));
  const color = ws.color ?? "#0073ea";
  const refresh = () => { notifyNavChanged(); router.refresh(); };

  const toggleFav = async (id: string) => {
    setFavs((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    await api.post(`/api/v1/boards/${id}/favorite`, {}).catch(() => undefined);
    refresh();
  };

  const boardRow = (b: WsHomeData["boards"][number]) => (
    <div key={b.id} className={styles.wsRow} data-testid="ws-board-row">
      <Link href={`/boards/${b.id}`} className={styles.wsRowLink}>
        <Icon icon={Board} size={18} ignoreFocusStyle />
        <span>{b.name}</span>
        {b.visibility !== "public" ? <span className={styles.badge}>{b.visibility === "private" ? t("chrome.typePrivate") : t("chrome.typeShare")}</span> : null}
      </Link>
      <button type="button" className={`${styles.wsStar} ${favs.has(b.id) ? styles.wsStarOn : ""}`} onClick={() => void toggleFav(b.id)} aria-label={favs.has(b.id) ? t("board.unfavorite") : t("board.favorite")} aria-pressed={favs.has(b.id)} data-testid="ws-board-star">
        <Icon icon={Favorite} size={20} ignoreFocusStyle />
      </button>
    </div>
  );

  const byId = new Map(data.boards.map((b) => [b.id, b]));
  const recents = data.recentIds.map((id) => byId.get(id)).filter(Boolean) as WsHomeData["boards"];
  const recentRows = recents.length ? recents : data.boards.slice(0, 8);

  const folderTree = (parent: string | null, depth: number): React.ReactNode =>
    data.folders.filter((f) => f.parentFolderId === parent).map((f) => (
      <div key={f.id} data-testid="ws-folder">
        <div className={styles.wsFolder} style={{ paddingLeft: 8 + depth * 20 }}>{f.name}</div>
        {data.boards.filter((b) => b.folderId === f.id).map((b) => <div key={b.id} style={{ paddingLeft: (depth + 1) * 20 }}>{boardRow(b)}</div>)}
        {folderTree(f.id, depth + 1)}
      </div>
    ));

  const tabBtn = (id: Tab, label: string, icon: React.ComponentProps<typeof Icon>["icon"]) => (
    <button key={id} type="button" role="tab" aria-selected={tab === id} className={`${styles.wsTab} ${tab === id ? styles.wsTabOn : ""}`} onClick={() => setTab(id)} data-testid={`ws-tab-${id}`}>
      <Icon icon={icon} size={18} ignoreFocusStyle /> {label}
    </button>
  );

  return (
    <div className={styles.wsPage} data-testid="workspace-page">
      <div className={styles.wsBanner} />
      <div className={styles.wsBody}>
        <div className={styles.wsTile} style={{ background: color }} data-testid="ws-tile">{ws.name.replace(/[^\p{L}\p{N}]/gu, "").charAt(0).toUpperCase()}</div>
        <div className={styles.wsHead}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className={styles.wsName} data-testid="ws-name">
              {ws.name}
              <button type="button" className={styles.wsChevron} onClick={(e) => setMenuEl(menuEl ? null : e.currentTarget)} aria-label={t("chrome.workspaceMenu")} data-testid="workspace-chevron"><Icon icon={DropdownChevronDown} size={24} ignoreFocusStyle /></button>
            </h1>
            <button type="button" className={styles.wsDesc} disabled={!data.canManage} onClick={() => dialogs.open({ kind: "workspace", workspaceId: ws.id, onSaved: refresh })} data-testid="ws-description">
              {ws.description || t("chrome.addWorkspaceDescription")}
            </button>
          </div>
          <span className={styles.wsMembers}>{data.members.slice(0, 3).map((m) => <UserAvatar key={m.userId} user={{ id: m.userId, name: m.name, photoUrl: null }} />)}</span>
          <button type="button" className={styles.wsInvite} onClick={() => setTab("collaborators")} data-testid="ws-invite">{t("board.invite")} / {data.members.length}</button>
          <button type="button" className={styles.iconBtn2} onClick={(e) => setMenuEl(menuEl ? null : e.currentTarget)} aria-label={t("chrome.workspaceMenu")} data-testid="workspace-more"><Icon icon={DotsIcon} size={20} ignoreFocusStyle /></button>
          {menuEl ? (
            <ActionMenu
              anchorEl={menuEl}
              align="end"
              onClose={() => setMenuEl(null)}
              items={[
                { label: t("shell.addBoard"), testId: "workspace-add-board", onClick: () => dialogs.open({ kind: "add-board", workspaceId: ws.id, onCreated: (id) => router.push(`/boards/${id}`) }) },
                { label: t("shell.addFolder"), testId: "workspace-add-folder", onClick: () => dialogs.open({ kind: "folder", workspaceId: ws.id, onSaved: refresh }) },
                { label: t("chrome.editWorkspace"), testId: "workspace-edit", disabled: !data.canManage, onClick: () => dialogs.open({ kind: "workspace", workspaceId: ws.id, onSaved: refresh }) },
                { divider: true },
                { label: t("common.delete"), danger: true, testId: "workspace-delete", disabled: !data.canManage, onClick: () => dialogs.open({ kind: "confirm", spec: { title: t("chrome.deleteWorkspaceTitle"), message: t("chrome.deleteWorkspaceMessage", { name: ws.name }), confirmLabel: t("common.delete"), danger: true, onConfirm: async () => { await api.del(`/api/v1/workspaces/${ws.id}`); notifyNavChanged(); router.push("/"); router.refresh(); } } }) },
              ]}
            />
          ) : null}
        </div>
        <div className={styles.wsTabs} role="tablist">
          {tabBtn("recents", t("chrome.tabRecents"), Time)}
          {tabBtn("content", t("chrome.content"), WorkspaceIcon)}
          {tabBtn("collaborators", t("chrome.tabCollaborators"), Team)}
          {tabBtn("permissions", t("chrome.tabPermissions"), Locked)}
        </div>
        <div data-testid={`ws-panel-${tab}`}>
          {tab === "recents" ? (recentRows.length ? recentRows.map(boardRow) : <div className={styles.empty}>{t("chrome.noBoardsYet")}</div>) : null}
          {tab === "content" ? (
            <>
              {folderTree(null, 0)}
              {data.boards.filter((b) => !b.folderId).map(boardRow)}
              {data.boards.length === 0 && data.folders.length === 0 ? <div className={styles.empty}>{t("chrome.noBoardsYet")}</div> : null}
            </>
          ) : null}
          {tab === "collaborators" ? (
            data.members.length ? data.members.map((m) => (
              <div key={m.userId} className={styles.wsRow} data-testid="ws-member-row">
                <span className={styles.wsRowLink} style={{ cursor: "default" }}><UserAvatar user={{ id: m.userId, name: m.name, photoUrl: null }} size="small" /><span>{m.name}</span></span>
                <span className={styles.hint}>{t(`chrome.wsRole.${m.role}`)}</span>
              </div>
            )) : <div className={styles.empty}>{t("chrome.wsNoMembers")}</div>
          ) : null}
          {tab === "permissions" ? (
            <div className={styles.form} style={{ padding: "20px 4px", maxWidth: 560 }}>
              <div className={styles.radio + " " + styles.radioOn}><span><span className={styles.radioTitle}>{t(`chrome.ws.${ws.kind}`)}</span><br /><span className={styles.hint}>{t(`chrome.ws.${ws.kind}Hint`)}</span></span></div>
              {data.canManage ? <button type="button" className={styles.btn} style={{ alignSelf: "flex-start" }} onClick={() => dialogs.open({ kind: "workspace", workspaceId: ws.id, onSaved: refresh })} data-testid="ws-change-kind">{t("chrome.editWorkspace")}</button> : null}
              <Link href={`/permissions?workspace=${ws.id}`} className={styles.linkBtn} style={{ alignSelf: "flex-start" }} data-testid="ws-manage-permissions">{t("chrome.managePermissions")}</Link>
            </div>
          ) : null}
        </div>
      </div>
      {dialogs.element}
    </div>
  );
}
