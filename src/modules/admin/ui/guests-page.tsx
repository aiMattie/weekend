"use client";

import { Button, Modal, ModalContent, ModalFooter, ModalHeader, TextField, Toggle } from "@vibe/core";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { GuestOverview, GuestRow } from "@/server/services/guests";
import type { InvitationWithLink } from "@/server/services/members";
import { Card, Chip, CopyButton, PageHead, Person, fmtDate, relTime, useAction } from "./ui";
import styles from "./admin.module.css";

type Ws = { id: string; name: string };
type Bd = { id: string; name: string; workspaceId: string; visibility: string };

export function GuestsPage({ overview, invitations, workspaces, boards }: { overview: GuestOverview; invitations: Omit<InvitationWithLink, "link">[]; workspaces: Ws[]; boards: Bd[] }) {
  const t = useT();
  const { run, error, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<GuestRow | null>(null);
  const [link, setLink] = useState<{ email: string; link: string } | null>(null);
  return (
    <>
      <PageHead title={t("admin.guests.title")} sub={t("admin.guests.sub")} actions={<Button onClick={() => setOpen(true)} disabled={!overview.enabled} data-testid="guest-invite">{t("admin.guests.invite")}</Button>} />
      {error && <div className={styles.error} role="alert" data-testid="admin-error">{error}</div>}
      {link && (
        <div className={`${styles.banner} ${styles.bannerInfo}`} data-testid="invite-link-banner">
          <div className={styles.grow}><strong>{t("admin.users.inviteSent", { email: link.email })}</strong><div className={`${styles.mono} ${styles.secret}`} data-testid="invite-link">{link.link}</div></div>
          <CopyButton text={link.link} label={t("admin.copyLink")} />
        </div>
      )}
      <Card title={t("admin.guests.settings")}>
        <div className={styles.fieldRow}>
          <Toggle isSelected={overview.enabled} onChange={(v: boolean) => run(() => api.patch("/api/v1/admin/guests", { enabled: v }))} aria-label={t("admin.guests.enabled")} data-testid="guests-enabled" />
          <span>{t("admin.guests.enabled")}</span>
        </div>
        <div className={styles.fieldRow}>
          <Toggle isSelected={overview.restrictedViews} onChange={(v: boolean) => run(() => api.patch("/api/v1/admin/guests", { restrictedViews: v }))} aria-label={t("admin.guests.restricted")} data-testid="guests-restricted" />
          <span>{t("admin.guests.restricted")}</span>
        </div>
        <p className={styles.hint}>{t("admin.guests.restrictedHint")}</p>
      </Card>
      <Card testId="guests-card">
        <table className={styles.table} data-testid="guests-table">
          <thead><tr><th>{t("admin.users.name")}</th><th>{t("admin.guests.access")}</th><th>{t("admin.users.lastActive")}</th><th /></tr></thead>
          <tbody>
            {overview.guests.map((g) => (
              <tr key={g.id} data-testid="guest-row" data-guest-email={g.email}>
                <td><Person id={g.id} name={g.name} sub={g.email} /></td>
                <td>
                  {g.workspaces.map((w) => <Chip key={w.id} tone="blue">{w.name}</Chip>)}{" "}
                  {g.boards.map((b) => <Chip key={b.id}>{b.name}</Chip>)}
                  {!g.boards.length && !g.workspaces.length && <span className={styles.muted}>{t("admin.guests.noAccess")}</span>}
                </td>
                <td className={styles.muted}>{relTime(g.lastLoginAt)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <Button size="small" kind="tertiary" onClick={() => setEdit(g)}>{t("admin.guests.editAccess")}</Button>
                  <Button size="small" kind="tertiary" color="negative" disabled={busy} onClick={() => confirm(t("admin.guests.confirmRemove", { name: g.name })) && run(() => api.del(`/api/v1/admin/guests/${g.id}`))} data-testid="guest-remove">{t("admin.guests.remove")}</Button>
                </td>
              </tr>
            ))}
            {!overview.guests.length && <tr><td colSpan={4} className={styles.muted}>{t("admin.guests.none")}</td></tr>}
          </tbody>
        </table>
      </Card>
      {invitations.length > 0 && (
        <Card title={t("admin.users.pending")}>
          <table className={styles.table}><tbody>
            {invitations.map((i) => (
              <tr key={i.id} data-testid="invitation-row"><td>{i.email}</td><td className={styles.muted}>{t("admin.users.expires")}: {fmtDate(i.expiresAt, false)}</td>
                <td style={{ textAlign: "right" }}>
                  <Button size="small" kind="tertiary" onClick={async () => { const r = await run(() => api.post<InvitationWithLink>(`/api/v1/admin/invitations/${i.id}`)); if (r) setLink({ email: r.email, link: r.link }); }}>{t("admin.users.resend")}</Button>
                  <Button size="small" kind="tertiary" color="negative" onClick={() => run(() => api.del(`/api/v1/admin/invitations/${i.id}`))}>{t("admin.users.revoke")}</Button>
                </td></tr>
            ))}
          </tbody></table>
        </Card>
      )}
      {open && <GuestDialog workspaces={workspaces} boards={boards} onClose={() => setOpen(false)} onDone={(r) => { setOpen(false); setLink({ email: r.email, link: r.link }); }} />}
      {edit && <AccessDialog guest={edit} boards={boards} workspaces={workspaces} onClose={() => setEdit(null)} />}
    </>
  );
}

function BoardPicker({ boards, workspaces, selected, onChange }: { boards: Bd[]; workspaces: Ws[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className={styles.pickRow} style={{ maxHeight: 180, overflow: "auto" }} data-testid="board-picker">
      {boards.map((b) => (
        <button type="button" key={b.id} className={`${styles.pick} ${selected.includes(b.id) ? styles.pickOn : ""}`} onClick={() => toggle(b.id)} data-testid="board-pick" data-board-name={b.name} aria-pressed={selected.includes(b.id)}>
          {workspaces.find((w) => w.id === b.workspaceId)?.name} / {b.name}
        </button>
      ))}
    </div>
  );
}

function GuestDialog({ workspaces, boards, onClose, onDone }: { workspaces: Ws[]; boards: Bd[]; onClose: () => void; onDone: (r: InvitationWithLink) => void }) {
  const t = useT();
  const { run, error, busy } = useAction();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [ws, setWs] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [role, setRole] = useState("viewer");
  const submit = async () => { const r = await run(() => api.post<InvitationWithLink>("/api/v1/admin/guests", { email, name: name || undefined, workspaceId: ws || undefined, boardIds: ids, role })); if (r) onDone(r); };
  return (
    <Modal id="invite-guest" show size="medium" onClose={onClose}>
      <ModalHeader title={t("admin.guests.inviteTitle")} />
      <ModalContent>
        <div className={styles.field}><span className={styles.fieldLabel}>E-mail</span><TextField value={email} onChange={setEmail} type="email" autoFocus size="medium" data-testid="guest-email" /></div>
        <div className={styles.field}><span className={styles.fieldLabel}>{t("admin.users.nameOptional")}</span><TextField value={name} onChange={setName} size="medium" /></div>
        <div className={styles.field}><span className={styles.fieldLabel}>{t("admin.guests.boards")}</span><BoardPicker boards={boards} workspaces={workspaces} selected={ids} onChange={setIds} /></div>
        <div className={styles.fieldRow}>
          <select className={styles.select} value={ws} onChange={(e) => setWs(e.target.value)} aria-label={t("admin.guests.wholeWorkspace")}>
            <option value="">{t("admin.guests.noWorkspace")}</option>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select className={styles.select} value={role} onChange={(e) => setRole(e.target.value)} aria-label={t("admin.guests.rights")} data-testid="guest-role">
            <option value="viewer">{t("admin.guests.viewer")}</option><option value="editor">{t("admin.guests.editor")}</option>
          </select>
        </div>
        <p className={styles.hint}>{t("admin.guests.shareHint")}</p>
        <div className={styles.error} role="alert">{error}</div>
      </ModalContent>
      <ModalFooter primaryButton={{ text: t("admin.users.sendInvite"), onClick: submit, loading: busy, disabled: !email.includes("@") || (!ws && !ids.length) }} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
    </Modal>
  );
}

function AccessDialog({ guest, boards, workspaces, onClose }: { guest: GuestRow; boards: Bd[]; workspaces: Ws[]; onClose: () => void }) {
  const t = useT();
  const { run, error, busy } = useAction();
  const [ids, setIds] = useState(guest.boards.map((b) => b.id));
  const [role, setRole] = useState(guest.boards[0]?.role === "editor" || guest.workspaces[0]?.role === "editor" ? "editor" : "viewer");
  const wsIds = guest.workspaces.map((w) => w.id);
  const save = async () => { if (await run(() => api.put(`/api/v1/admin/guests/${guest.id}`, { boardIds: ids, workspaceIds: wsIds, role }))) onClose(); };
  return (
    <Modal id="guest-access" show size="medium" onClose={onClose}>
      <ModalHeader title={`${t("admin.guests.editAccess")}: ${guest.name}`} />
      <ModalContent>
        <BoardPicker boards={boards} workspaces={workspaces} selected={ids} onChange={setIds} />
        <div className={styles.fieldRow} style={{ marginTop: 12 }}>
          <select className={styles.select} value={role} onChange={(e) => setRole(e.target.value)} aria-label={t("admin.guests.rights")}>
            <option value="viewer">{t("admin.guests.viewer")}</option><option value="editor">{t("admin.guests.editor")}</option>
          </select>
        </div>
        <div className={styles.error} role="alert">{error}</div>
      </ModalContent>
      <ModalFooter primaryButton={{ text: t("common.save"), onClick: save, loading: busy }} secondaryButton={{ text: t("common.cancel"), onClick: onClose }} />
    </Modal>
  );
}
