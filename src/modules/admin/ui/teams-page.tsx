"use client";

import { Button, TextField } from "@vibe/core";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { TeamFull } from "@/server/services/teams";
import { Card, Chip, PageHead, useAction } from "./ui";
import styles from "./admin.module.css";

type Person = { id: string; name: string; email: string; isAiAgent: boolean };

export function TeamsPage({ teams, people }: { teams: TeamFull[]; people: Person[] }) {
  const t = useT();
  const { run, error, busy } = useAction();
  const [name, setName] = useState("");
  const create = async () => { if (name.trim() && (await run(() => api.post("/api/v1/admin/teams", { name })))) setName(""); };
  return (
    <>
      <PageHead title={t("admin.teams.title")} sub={t("admin.teams.sub")} />
      {error && <div className={styles.error} role="alert" data-testid="admin-error">{error}</div>}
      <Card title={t("admin.teams.new")}>
        <form className={styles.fieldRow} onSubmit={(e) => { e.preventDefault(); create(); }}>
          <TextField value={name} onChange={setName} placeholder={t("admin.teams.namePlaceholder")} size="medium" data-testid="team-name" />
          <Button type="submit" loading={busy} disabled={!name.trim()} data-testid="team-create">{t("admin.teams.create")}</Button>
        </form>
      </Card>
      {teams.map((tm) => <TeamCard key={tm.id} team={tm} people={people} />)}
      {!teams.length && <p className={styles.hint}>{t("admin.teams.none")}</p>}
    </>
  );
}

function TeamCard({ team, people }: { team: TeamFull; people: Person[] }) {
  const t = useT();
  const { run, busy } = useAction();
  const [name, setName] = useState(team.name);
  const [add, setAdd] = useState("");
  const outside = people.filter((p) => !team.memberIds.includes(p.id));
  const setMembers = (ids: string[]) => run(() => api.put(`/api/v1/admin/teams/${team.id}/members`, { userIds: ids }));
  return (
    <Card testId="team-card" title={team.name} actions={
      team.canManage && <Button size="small" kind="tertiary" color="negative" onClick={() => confirm(t("admin.teams.confirmDelete", { name: team.name })) && run(() => api.del(`/api/v1/admin/teams/${team.id}`))} data-testid="team-delete">{t("common.delete")}</Button>
    }>
      <div className={styles.fieldRow}>
        <span className={styles.muted}>@{team.name.toLowerCase().replace(/\s+/g, "")}</span>
        <Chip>{t("admin.teams.members", { n: team.members.length })}</Chip>
      </div>
      {team.canManage && (
        <div className={styles.fieldRow}>
          <TextField value={name} onChange={setName} size="small" aria-label={t("admin.teams.rename")} />
          <Button size="small" kind="secondary" disabled={busy || !name.trim() || name === team.name} onClick={() => run(() => api.patch(`/api/v1/admin/teams/${team.id}`, { name }))}>{t("admin.teams.rename")}</Button>
        </div>
      )}
      <table className={styles.table}>
        <tbody>
          {team.members.map((m) => (
            <tr key={m.userId} data-testid="team-member">
              <td>{m.name} <span className={styles.muted}>{m.email}</span></td>
              <td>{m.isOwner && <Chip tone="blue">{t("admin.teams.owner")}</Chip>}</td>
              <td style={{ textAlign: "right" }}>
                {team.canManage && (
                  <>
                    <Button size="small" kind="tertiary" onClick={() => run(() => api.put(`/api/v1/admin/teams/${team.id}/owner`, { userId: m.userId, isOwner: !m.isOwner }))}>{m.isOwner ? t("admin.teams.removeOwner") : t("admin.teams.makeOwner")}</Button>
                    <Button size="small" kind="tertiary" color="negative" onClick={() => setMembers(team.memberIds.filter((id) => id !== m.userId))}>{t("admin.teams.removeMember")}</Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {team.canManage && outside.length > 0 && (
        <div className={styles.fieldRow} style={{ marginTop: 12 }}>
          <select className={styles.select} value={add} onChange={(e) => setAdd(e.target.value)} aria-label={t("admin.teams.addMember")} data-testid="team-add-select">
            <option value="">{t("admin.teams.addMember")}</option>
            {outside.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Button size="small" kind="secondary" disabled={!add || busy} onClick={async () => { await setMembers([...team.memberIds, add]); setAdd(""); }} data-testid="team-add">{t("admin.teams.add")}</Button>
        </div>
      )}
    </Card>
  );
}
