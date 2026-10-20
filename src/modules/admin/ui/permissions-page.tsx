"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { BoardPermissionInfo, ColumnPermissionInfo, WorkspacePermissionInfo } from "@/server/services/permissions";
import { Card, PageHead, useAction } from "./ui";
import styles from "./admin.module.css";

type Person = { id: string; name: string; role: string };

export function PermissionsPage({ workspaces, boards, workspace, board, people, columnPerms }: {
  workspaces: { id: string; name: string }[]; boards: { id: string; name: string; workspaceId: string }[];
  workspace: WorkspacePermissionInfo | null; board: BoardPermissionInfo | null; people: Person[]; columnPerms: ColumnPermissionInfo[];
}) {
  const t = useT();
  const router = useRouter();
  return (
    <div style={{ padding: "28px 40px", overflow: "auto", flex: 1 }} data-testid="permissions-page">
      <div className={styles.page}>
        <PageHead title={t("perm.title")} sub={t("perm.sub")} />
        <div className={styles.split}>
          <Card title="Workspace">
            <select className={styles.select} style={{ maxWidth: "100%" }} value={workspace?.id ?? ""} onChange={(e) => router.push(e.target.value ? `/permissions?workspace=${e.target.value}` : "/permissions")} aria-label="Workspace" data-testid="perm-workspace-select">
              <option value="">{t("perm.choose")}</option>
              {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Card>
          <Card title="Board">
            <select className={styles.select} style={{ maxWidth: "100%" }} value={board?.id ?? ""} onChange={(e) => router.push(e.target.value ? `/permissions?board=${e.target.value}` : "/permissions")} aria-label="Board" data-testid="perm-board-select">
              <option value="">{t("perm.choose")}</option>
              {boards.map((b) => <option key={b.id} value={b.id}>{workspaces.find((w) => w.id === b.workspaceId)?.name} / {b.name}</option>)}
            </select>
          </Card>
        </div>
        {workspace && <WorkspaceEditor key={workspace.id} info={workspace} people={people} />}
        {board && <BoardEditor key={board.id} info={board} people={people} />}
        {board && <ColumnPermissions key={`c-${board.id}`} columns={columnPerms} people={people} />}
      </div>
    </div>
  );
}

function WorkspaceEditor({ info, people }: { info: WorkspacePermissionInfo; people: Person[] }) {
  const t = useT();
  const { run, error } = useAction();
  const [uid, setUid] = useState("");
  const [role, setRole] = useState("member");
  const patch = (b: object) => run(() => api.patch(`/api/v1/admin/permissions/workspaces/${info.id}`, b));
  const setMember = (userId: string, r: string | null) => run(() => api.put(`/api/v1/admin/permissions/workspaces/${info.id}/members`, { userId, role: r }));
  const outside = people.filter((p) => p.role !== "guest" && !info.members.some((m) => m.userId === p.id));
  return (
    <Card title={`Workspace: ${info.name}`} testId="workspace-permissions">
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.fieldRow}>
        <span style={{ minWidth: 220 }}>{t("perm.ws.kind")}</span>
        <select className={styles.select} value={info.kind} onChange={(e) => patch({ kind: e.target.value })} aria-label={t("perm.ws.kind")} data-testid="ws-kind">
          <option value="open">{t("perm.ws.open")}</option><option value="closed">{t("perm.ws.closed")}</option>
        </select>
      </div>
      <div className={styles.fieldRow}>
        <span style={{ minWidth: 220 }}>{t("perm.ws.createBoards")}</span>
        <select className={styles.select} value={info.createBoards} onChange={(e) => patch({ createBoards: e.target.value })} aria-label={t("perm.ws.createBoards")} data-testid="ws-create-boards">
          <option value="members">{t("perm.ws.allMembers")}</option><option value="owners">{t("perm.ws.ownersOnly")}</option>
        </select>
      </div>
      <p className={styles.hint}>{info.kind === "open" ? t("perm.ws.openHint") : t("perm.ws.closedHint")}</p>
      <table className={styles.table}>
        <tbody>
          {info.members.map((m) => (
            <tr key={m.userId} data-testid="ws-member"><td>{m.name} <span className={styles.muted}>{m.email}</span></td>
              <td style={{ textAlign: "right" }}>
                <select className={styles.select} value={m.role} onChange={(e) => setMember(m.userId, e.target.value)} aria-label={m.name}>
                  <option value="owner">{t("perm.ws.roleOwner")}</option><option value="member">{t("perm.ws.roleMember")}</option><option value="viewer">{t("perm.ws.roleViewer")}</option>
                </select>{" "}
                <button className={styles.pick} onClick={() => setMember(m.userId, null)}>{t("perm.remove")}</button>
              </td></tr>
          ))}
        </tbody>
      </table>
      <div className={styles.fieldRow} style={{ marginTop: 12 }}>
        <select className={styles.select} value={uid} onChange={(e) => setUid(e.target.value)} aria-label={t("perm.addPerson")}><option value="">{t("perm.addPerson")}</option>{outside.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select className={styles.select} value={role} onChange={(e) => setRole(e.target.value)} aria-label={t("perm.role")}><option value="owner">{t("perm.ws.roleOwner")}</option><option value="member">{t("perm.ws.roleMember")}</option><option value="viewer">{t("perm.ws.roleViewer")}</option></select>
        <button className={styles.pick} disabled={!uid} onClick={async () => { await setMember(uid, role); setUid(""); }}>{t("perm.add")}</button>
      </div>
    </Card>
  );
}

function BoardEditor({ info, people }: { info: BoardPermissionInfo; people: Person[] }) {
  const t = useT();
  const { run, error } = useAction();
  const [uid, setUid] = useState("");
  const [role, setRole] = useState("editor");
  const patch = (b: object) => run(() => api.patch(`/api/v1/admin/permissions/boards/${info.id}`, b));
  const setMember = (userId: string, r: string | null) => run(() => api.put(`/api/v1/admin/permissions/boards/${info.id}/members`, { userId, role: r }));
  const outside = people.filter((p) => !info.members.some((m) => m.userId === p.id));
  return (
    <Card title={`Board: ${info.name}`} testId="board-permissions">
      {error && <div className={styles.error} role="alert" data-testid="perm-error">{error}</div>}
      <div className={styles.fieldRow}>
        <span style={{ minWidth: 220 }}>{t("perm.board.visibility")}</span>
        <select className={styles.select} value={info.visibility} onChange={(e) => patch({ visibility: e.target.value })} aria-label={t("perm.board.visibility")} data-testid="board-visibility">
          <option value="public">{t("perm.board.main")}</option><option value="private">{t("perm.board.private")}</option><option value="share">{t("perm.board.share")}</option>
        </select>
      </div>
      <div className={styles.fieldRow}>
        <span style={{ minWidth: 220 }}>{t("perm.board.level")}</span>
        <select className={styles.select} value={info.level} onChange={(e) => patch({ level: e.target.value })} aria-label={t("perm.board.level")} data-testid="board-level">
          <option value="edit_all">{t("perm.level.edit_all")}</option><option value="edit_content">{t("perm.level.edit_content")}</option>
          <option value="edit_assigned">{t("perm.level.edit_assigned")}</option><option value="view_only">{t("perm.level.view_only")}</option>
        </select>
      </div>
      <p className={styles.hint}>{t(`perm.levelHint.${info.level}`)}</p>
      <table className={styles.table} data-testid="board-members">
        <tbody>
          {info.members.map((m) => (
            <tr key={m.userId} data-testid="board-member"><td>{m.name} <span className={styles.muted}>{m.email}</span> {m.accountRole === "guest" && <span className={`${styles.chip} ${styles.chipOrange}`}>{t("admin.role.guest")}</span>}</td>
              <td style={{ textAlign: "right" }}>
                <select className={styles.select} value={m.role} onChange={(e) => setMember(m.userId, e.target.value)} aria-label={m.name}>
                  <option value="owner">{t("perm.board.owner")}</option><option value="editor">{t("perm.board.editor")}</option><option value="viewer">{t("perm.board.viewer")}</option>
                </select>{" "}
                <button className={styles.pick} onClick={() => setMember(m.userId, null)}>{t("perm.remove")}</button>
              </td></tr>
          ))}
          {!info.members.length && <tr><td className={styles.muted}>{t("perm.board.noMembers")}</td></tr>}
        </tbody>
      </table>
      <div className={styles.fieldRow} style={{ marginTop: 12 }}>
        <select className={styles.select} value={uid} onChange={(e) => setUid(e.target.value)} aria-label={t("perm.addPerson")} data-testid="board-add-person"><option value="">{t("perm.addPerson")}</option>{outside.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select className={styles.select} value={role} onChange={(e) => setRole(e.target.value)} aria-label={t("perm.role")}><option value="owner">{t("perm.board.owner")}</option><option value="editor">{t("perm.board.editor")}</option><option value="viewer">{t("perm.board.viewer")}</option></select>
        <button className={styles.pick} disabled={!uid} data-testid="board-add" onClick={async () => { await setMember(uid, role); setUid(""); }}>{t("perm.add")}</button>
      </div>
    </Card>
  );
}

type Access = { mode: "everyone" | "owners" | "specific" | "assigned"; userIds: string[]; teamIds: string[] };

function ColumnPermissions({ columns, people }: { columns: ColumnPermissionInfo[]; people: Person[] }) {
  const t = useT();
  const { run, error } = useAction();
  const save = (columnId: string, body: { edit?: Access; view?: Access }) => run(() => api.put(`/api/v1/admin/permissions/columns/${columnId}`, body));
  const withMode = (a: Access, mode: Access["mode"]): Access => ({ ...a, mode, userIds: mode === "specific" ? a.userIds : [] });
  const toggle = (a: Access, id: string): Access => ({ ...a, userIds: a.userIds.includes(id) ? a.userIds.filter((x) => x !== id) : [...a.userIds, id] });
  return (
    <Card title={t("perm.col.title")} testId="column-permissions">
      <p className={styles.hint}>{t("perm.col.hint")}</p>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <table className={styles.table}>
        <thead><tr><th>{t("perm.col.column")}</th><th>{t("perm.col.view")}</th><th>{t("perm.col.edit")}</th></tr></thead>
        <tbody>
          {columns.filter((c) => c.type !== "name").map((c) => (
            <tr key={c.columnId} data-testid="column-perm-row" data-column-title={c.title}>
              <td>{c.title} <span className={styles.muted}>({c.type})</span></td>
              <td>
                <select className={styles.select} value={c.view.mode} onChange={(e) => save(c.columnId, { view: withMode(c.view, e.target.value as Access["mode"]) })} aria-label={`${c.title} ${t("perm.col.view")}`} data-testid="column-view-mode">
                  <option value="everyone">{t("perm.col.everyone")}</option><option value="owners">{t("perm.col.owners")}</option><option value="specific">{t("perm.col.specific")}</option>
                </select>
                {c.view.mode === "specific" && <PeoplePick people={people} selected={c.view.userIds} onToggle={(id) => save(c.columnId, { view: toggle(c.view, id) })} />}
              </td>
              <td>
                <select className={styles.select} value={c.edit.mode} onChange={(e) => save(c.columnId, { edit: withMode(c.edit, e.target.value as Access["mode"]) })} aria-label={`${c.title} ${t("perm.col.edit")}`} data-testid="column-edit-mode">
                  <option value="everyone">{t("perm.col.everyone")}</option><option value="owners">{t("perm.col.owners")}</option><option value="assigned">{t("perm.col.assigned")}</option><option value="specific">{t("perm.col.specific")}</option>
                </select>
                {c.edit.mode === "specific" && <PeoplePick people={people} selected={c.edit.userIds} onToggle={(id) => save(c.columnId, { edit: toggle(c.edit, id) })} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function PeoplePick({ people, selected, onToggle }: { people: Person[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className={styles.pickRow} style={{ marginTop: 6 }}>
      {people.map((p) => <button type="button" key={p.id} className={`${styles.pick} ${selected.includes(p.id) ? styles.pickOn : ""}`} onClick={() => onToggle(p.id)} aria-pressed={selected.includes(p.id)}>{p.name}</button>)}
    </div>
  );
}
