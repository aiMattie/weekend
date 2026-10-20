"use client";

import { Button, Modal, ModalContent, ModalFooter, ModalHeader, TextField } from "@vibe/core";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { InvitationWithLink, MemberRow } from "@/server/services/members";
import { Card, Chip, CopyButton, PageHead, Person, relTime, fmtDate, useAction } from "./ui";
import styles from "./admin.module.css";

type RoleOpt = { id: string; name: string; baseRole: string };
type Invitation = Omit<InvitationWithLink, "link">;

export function UsersPage({ users, invitations, roles, meId }: { users: MemberRow[]; invitations: Invitation[]; roles: RoleOpt[]; meId: string }) {
  const t = useT();
  const { run, error, busy } = useAction();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [lastLink, setLastLink] = useState<{ email: string; link: string } | null>(null);

  const shown = users.filter((u) => u.role !== "guest" && !u.isAiAgent)
    .filter((u) => filter === "all" || (filter === "inactive" ? !u.isActive : filter.startsWith("custom:") ? u.customRoleId === filter.slice(7) : u.role === filter))
    .filter((u) => !q.trim() || `${u.name} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  const agents = users.filter((u) => u.isAiAgent);

  const roleValue = (u: MemberRow) => (u.customRoleId ? `custom:${u.customRoleId}` : u.role);
  const changeRole = (u: MemberRow, v: string) =>
    run(() => api.patch(`/api/v1/admin/users/${u.id}`, v.startsWith("custom:") ? { role: roles.find((r) => r.id === v.slice(7))?.baseRole ?? "member", customRoleId: v.slice(7) } : { role: v, customRoleId: null }));

  return (
    <>
      <PageHead title={t("admin.users.title")} sub={t("admin.users.sub")} actions={
        <>
          <Button kind="secondary" onClick={() => setImportOpen(true)} data-testid="users-import">{t("admin.users.import")}</Button>
          <Button onClick={() => setInviteOpen(true)} data-testid="users-invite">{t("admin.users.invite")}</Button>
        </>
      } />
      {error && <div className={styles.error} role="alert" data-testid="admin-error">{error}</div>}
      {lastLink && (
        <div className={`${styles.banner} ${styles.bannerInfo}`} data-testid="invite-link-banner">
          <div className={styles.grow}>
            <strong>{t("admin.users.inviteSent", { email: lastLink.email })}</strong>
            <div className={`${styles.mono} ${styles.secret}`} data-testid="invite-link">{lastLink.link}</div>
          </div>
          <CopyButton text={lastLink.link} label={t("admin.copyLink")} />
          <Button kind="tertiary" size="small" onClick={() => setLastLink(null)}>{t("common.close")}</Button>
        </div>
      )}
      <Card testId="users-card">
        <div className={styles.toolbar}>
          <TextField value={q} onChange={setQ} placeholder={t("admin.users.search")} size="small" data-testid="users-search" />
          <select className={styles.select} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t("admin.users.filter")} data-testid="users-filter">
            <option value="all">{t("admin.users.filterAll")}</option>
            <option value="admin">{t("admin.role.admin")}</option>
            <option value="member">{t("admin.role.member")}</option>
            <option value="viewer">{t("admin.role.viewer")}</option>
            <option value="inactive">{t("admin.users.inactive")}</option>
            {roles.map((r) => <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>)}
          </select>
          <span className={styles.muted}>{t("admin.users.count", { n: shown.length })}</span>
        </div>
        <table className={styles.table} data-testid="users-table">
          <thead><tr><th>{t("admin.users.name")}</th><th>{t("admin.users.role")}</th><th>{t("admin.users.lastActive")}</th><th>2FA</th><th>{t("admin.users.status")}</th><th /></tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} data-testid="user-row" data-user-email={u.email}>
                <td><Person id={u.id} name={u.name} sub={u.email} photoUrl={u.photoUrl} /></td>
                <td>
                  <select className={styles.select} value={roleValue(u)} onChange={(e) => changeRole(u, e.target.value)} disabled={busy} aria-label={t("admin.users.role")} data-testid="user-role">
                    <option value="admin">{t("admin.role.admin")}</option>
                    <option value="member">{t("admin.role.member")}</option>
                    <option value="viewer">{t("admin.role.viewer")}</option>
                    {roles.map((r) => <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>)}
                  </select>
                </td>
                <td className={styles.muted} title={fmtDate(u.lastActiveAt)}>{relTime(u.lastActiveAt)}</td>
                <td>{u.twoFactor ? <Chip tone="green">{t("admin.on")}</Chip> : <span className={styles.muted}>-</span>}</td>
                <td>{u.isActive ? <Chip tone="green">{t("admin.users.active")}</Chip> : <Chip tone="red">{t("admin.users.deactivated")}</Chip>}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {u.twoFactor && <Button size="small" kind="tertiary" onClick={() => run(() => api.post(`/api/v1/admin/users/${u.id}/reset-2fa`))}>{t("admin.users.reset2fa")}</Button>}
                  {u.id !== meId && (
                    <Button size="small" kind="tertiary" color={u.isActive ? "negative" : "positive"} disabled={busy} onClick={() => run(() => api.patch(`/api/v1/admin/users/${u.id}`, { isActive: !u.isActive }))} data-testid={u.isActive ? "user-deactivate" : "user-reactivate"}>
                      {u.isActive ? t("admin.users.deactivate") : t("admin.users.reactivate")}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className={styles.muted}>{t("admin.users.none")}</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card title={t("admin.users.pending")} testId="invitations-card">
        {invitations.length === 0 ? <p className={styles.hint}>{t("admin.users.noPending")}</p> : (
          <table className={styles.table}>
            <thead><tr><th>E-mail</th><th>{t("admin.users.role")}</th><th>{t("admin.users.expires")}</th><th /></tr></thead>
            <tbody>
              {invitations.map((i) => (
                <tr key={i.id} data-testid="invitation-row">
                  <td>{i.email}</td>
                  <td>{t(`admin.role.${i.role}`)}</td>
                  <td className={styles.muted}>{fmtDate(i.expiresAt, false)}</td>
                  <td style={{ textAlign: "right" }}>
                    <Button size="small" kind="tertiary" onClick={async () => { const r = await run(() => api.post<InvitationWithLink>(`/api/v1/admin/invitations/${i.id}`)); if (r) setLastLink({ email: r.email, link: r.link }); }}>{t("admin.users.resend")}</Button>
                    <Button size="small" kind="tertiary" color="negative" onClick={() => run(() => api.del(`/api/v1/admin/invitations/${i.id}`))}>{t("admin.users.revoke")}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {agents.length > 0 && <p className={styles.hint}>{t("admin.users.agents", { names: agents.map((a) => a.name).join(", ") })}</p>}

      {inviteOpen && <InviteDialog roles={roles} onClose={() => setInviteOpen(false)} onDone={(r) => { setInviteOpen(false); setLastLink({ email: r.email, link: r.link }); }} />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
    </>
  );
}

function InviteDialog({ roles, onClose, onDone }: { roles: RoleOpt[]; onClose: () => void; onDone: (r: InvitationWithLink) => void }) {
  const t = useT();
  const { run, error, busy } = useAction();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("member");
  const submit = async () => {
    const custom = role.startsWith("custom:") ? roles.find((r) => r.id === role.slice(7)) : null;
    const r = await run(() => api.post<InvitationWithLink>("/api/v1/admin/users", { email, name: name || undefined, role: custom ? custom.baseRole : role, customRoleId: custom?.id ?? null }));
    if (r) onDone(r);
  };
  return (
    <Modal id="invite-user" show size="small" onClose={onClose}>
      <ModalHeader title={t("admin.users.inviteTitle")} />
      <ModalContent>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} data-testid="invite-form">
          <div className={styles.field}><span className={styles.fieldLabel}>E-mail</span><TextField value={email} onChange={setEmail} type="email" autoFocus size="medium" placeholder="naam@bedrijf.nl" data-testid="invite-email" /></div>
          <div className={styles.field}><span className={styles.fieldLabel}>{t("admin.users.nameOptional")}</span><TextField value={name} onChange={setName} size="medium" data-testid="invite-name" /></div>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t("admin.users.role")}</span>
            <select className={styles.select} value={role} onChange={(e) => setRole(e.target.value)} data-testid="invite-role">
              <option value="member">{t("admin.role.member")}</option><option value="viewer">{t("admin.role.viewer")}</option><option value="admin">{t("admin.role.admin")}</option>
              {roles.map((r) => <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>)}
            </select>
          </div>
          <div className={styles.error} role="alert">{error}</div>
        </form>
      </ModalContent>
      <ModalFooter primaryButton={{ text: t("admin.users.sendInvite"), onClick: submit, loading: busy, disabled: !email.includes("@") }} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
    </Modal>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { run, error, busy } = useAction();
  const [csv, setCsv] = useState("naam,email,rol\n");
  const [result, setResult] = useState<{ created: { email: string; link: string }[]; skipped: { row: number; email: string; reason: string }[] } | null>(null);
  const submit = async () => { const r = await run(() => api.post<NonNullable<typeof result>>("/api/v1/admin/users/import", { csv })); if (r) setResult(r); };
  return (
    <Modal id="import-users" show size="medium" onClose={onClose}>
      <ModalHeader title={t("admin.users.importTitle")} />
      <ModalContent>
        <p className={styles.hint}>{t("admin.users.importHint")}</p>
        <input type="file" accept=".csv,text/csv" aria-label="CSV" data-testid="import-file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
        <textarea className={`${styles.textarea} ${styles.mono}`} value={csv} onChange={(e) => setCsv(e.target.value)} data-testid="import-csv" style={{ marginTop: 8 }} />
        <div className={styles.error} role="alert">{error}</div>
        {result && (
          <div data-testid="import-result">
            <p className={styles.ok}>{t("admin.users.importDone", { n: result.created.length, m: result.skipped.length })}</p>
            {result.skipped.map((s) => <div key={s.row} className={styles.muted}>{t("admin.users.importSkipped", { row: s.row, email: s.email, reason: s.reason })}</div>)}
          </div>
        )}
      </ModalContent>
      <ModalFooter primaryButton={{ text: t("admin.users.importRun"), onClick: submit, loading: busy }} secondaryButton={{ text: t("common.close"), onClick: onClose }} />
    </Modal>
  );
}
