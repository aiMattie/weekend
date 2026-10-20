"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { UserAvatar } from "@/components/columns/shared";
import { api } from "@/lib/api-client";
import type { BoardFull } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import type { BoardActions } from "../use-board";
import { ChromeModal } from "./modal";
import { notifyNavChanged } from "./ops";
import styles from "./chrome.module.css";

export type SettingsTab = "general" | "permissions" | "members";
type Role = "owner" | "editor" | "viewer";
interface Member { userId: string; role: Role; name: string; email: string }
interface Team { id: string; name: string; memberIds: string[] }
type Visibility = "public" | "share" | "private";

export function BoardSettingsDialog({ board, actions, initialTab = "general", onClose }: { board: BoardFull; actions: BoardActions; initialTab?: SettingsTab; onClose: () => void }) {
  const t = useT();
  const b = board.board;
  const canStructure = board.permissions.editStructure;
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [name, setName] = useState(b.name);
  const [description, setDescription] = useState(b.description ?? "");
  const [visibility, setVisibility] = useState<Visibility>(b.visibility);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setError(null);
    try {
      if (name.trim() !== b.name || (description.trim() || null) !== b.description) await actions.updateBoard({ name: name.trim() || b.name, description: description.trim() || null });
      if (visibility !== b.visibility) await api.patch(`/api/v1/boards/${b.id}`, { visibility });
      notifyNavChanged();
      await actions.refetch();
      setSaved(true);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const tabBtn = (id: SettingsTab, label: string) => (
    <button key={id} type="button" className={`${styles.tab} ${tab === id ? styles.tabOn : ""}`} onClick={() => setTab(id)} data-testid={`settings-tab-${id}`} role="tab" aria-selected={tab === id}>{label}</button>
  );

  return (
    <ChromeModal id="board-settings-dialog" title={t("chrome.boardSettings")} size="medium" onClose={onClose} error={error}
      primary={tab === "members" ? undefined : { text: t("common.save"), onClick: () => void save(), disabled: !canStructure || saved || !name.trim(), testId: "settings-save" }}
      secondaryText={tab === "members" ? t("common.close") : undefined}>
      <div className={styles.tabs} role="tablist">
        {tabBtn("general", t("chrome.tabGeneral"))}
        {tabBtn("permissions", t("chrome.tabPermissions"))}
        {tabBtn("members", t("chrome.tabMembers"))}
      </div>
      {tab === "general" ? (
        <div className={styles.form}>
          <label className={styles.field}>
            <span className={styles.label}>{t("chrome.boardName")}</span>
            <input className={styles.input} value={name} disabled={!canStructure} onChange={(e) => setName(e.target.value)} data-testid="settings-name" />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t("chrome.description")}</span>
            <textarea className={styles.textarea} value={description} disabled={!canStructure} onChange={(e) => setDescription(e.target.value)} data-testid="settings-description" />
          </label>
          {!canStructure ? <div className={styles.hint}>{t("board.viewReadOnly")}</div> : null}
        </div>
      ) : null}
      {tab === "permissions" ? (
        <div className={styles.form}>
          <div className={styles.hint}>{t("chrome.permissionsIntro")}</div>
          <div className={styles.radioList}>
            {(["public", "share", "private"] as const).map((v) => (
              <label key={v} className={`${styles.radio} ${visibility === v ? styles.radioOn : ""}`}>
                <input type="radio" name="visibility" disabled={!canStructure} checked={visibility === v} onChange={() => setVisibility(v)} data-testid={`settings-visibility-${v}`} />
                <span><span className={styles.radioTitle}>{t(`chrome.type${v === "public" ? "Main" : v === "share" ? "Share" : "Private"}`)}</span><br /><span className={styles.hint}>{t(`chrome.perm.${v}`)}</span></span>
              </label>
            ))}
          </div>
          <button type="button" className={styles.linkBtn} style={{ alignSelf: "flex-start" }} onClick={() => setTab("members")} data-testid="manage-permissions">{t("chrome.managePermissions")}</button>
          <a href={`/permissions?workspace=${b.workspaceId}`} className={styles.linkBtn} style={{ alignSelf: "flex-start" }} data-testid="admin-permissions-link">{t("chrome.adminPermissions")}</a>
        </div>
      ) : null}
      {tab === "members" ? <MembersTab board={board} canManage={canStructure} /> : null}
    </ChromeModal>
  );
}

function MembersTab({ board, canManage }: { board: BoardFull; canManage: boolean }) {
  const t = useT();
  const boardId = board.board.id;
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setMembers(await api.get<Member[]>(`/api/v1/boards/${boardId}/members`)); } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
  }, [boardId, t]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); api.get<Team[]>("/api/v1/teams").then(setTeams).catch(() => undefined); }, [load]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);
  const needle = q.trim().toLowerCase();
  const userHits = needle ? board.users.filter((u) => !memberIds.has(u.id) && !u.isAiAgent && `${u.name} ${u.email}`.toLowerCase().includes(needle)).slice(0, 6) : [];
  const teamHits = needle ? teams.filter((x) => x.name.toLowerCase().includes(needle)).slice(0, 4) : [];

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
  };
  const setMember = (userId: string, r: Role) => api.put(`/api/v1/boards/${boardId}/members`, { userId, role: r });
  const roleSelect = (m: Member) => (
    <select className={styles.select} value={m.role} disabled={!canManage} onChange={(e) => void run(() => setMember(m.userId, e.target.value as Role))} data-testid={`member-role-${m.userId}`} style={{ minHeight: 30 }}>
      <option value="owner">{t("chrome.roleOwner")}</option>
      <option value="editor">{t("chrome.roleEditor")}</option>
      <option value="viewer">{t("chrome.roleViewer")}</option>
    </select>
  );

  return (
    <div className={styles.form} data-testid="members-tab">
      {canManage ? (
        <div className={styles.field}>
          <span className={styles.label}>{t("chrome.addMember")}</span>
          <div className={styles.row}>
            <input className={styles.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("chrome.searchPeople")} data-testid="member-search" />
            <select className={styles.select} value={role} onChange={(e) => setRole(e.target.value as Role)} style={{ flex: "0 0 150px" }} data-testid="member-new-role">
              <option value="owner">{t("chrome.roleOwner")}</option>
              <option value="editor">{t("chrome.roleEditor")}</option>
              <option value="viewer">{t("chrome.roleViewer")}</option>
            </select>
          </div>
          {userHits.map((u) => (
            <button key={u.id} type="button" className={styles.memberRow} style={{ background: "transparent", border: 0, cursor: "pointer", textAlign: "left" }} onClick={() => { setQ(""); void run(() => setMember(u.id, role)); }} data-testid={`add-member-${u.name}`}>
              <UserAvatar user={u} size="xs" /><span className={styles.memberName}>{u.name} <span className={styles.memberMail}>{u.email}</span></span>
            </button>
          ))}
          {teamHits.map((x) => (
            <button key={x.id} type="button" className={styles.memberRow} style={{ background: "transparent", border: 0, cursor: "pointer", textAlign: "left" }} onClick={() => { setQ(""); void run(async () => { for (const id of x.memberIds) await setMember(id, role); }); }} data-testid={`add-team-${x.name}`}>
              <span className={styles.badge}>{t("chrome.team")}</span><span className={styles.memberName}>{x.name} <span className={styles.memberMail}>({x.memberIds.length})</span></span>
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.field}>
        <span className={styles.label}>{t("chrome.membersCount", { n: members.length })}</span>
        <div data-testid="member-list">
          {members.map((m) => (
            <div key={m.userId} className={styles.memberRow} data-testid="member-row" data-user-id={m.userId}>
              <UserAvatar user={{ id: m.userId, name: m.name, photoUrl: null }} size="small" />
              <div className={styles.memberName}>{m.name}<div className={styles.memberMail}>{m.email}</div></div>
              {roleSelect(m)}
              {canManage ? <button type="button" className={`${styles.linkBtn} ${styles.danger}`} onClick={() => void run(() => api.del(`/api/v1/boards/${boardId}/members?userId=${m.userId}`))} data-testid="member-remove">{t("chrome.remove")}</button> : null}
            </div>
          ))}
          {members.length === 0 ? <div className={styles.hint}>{t("chrome.noMembers")}</div> : null}
        </div>
      </div>
      {error ? <div className={styles.error}>{error}</div> : null}
    </div>
  );
}
