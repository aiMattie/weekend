"use client";

import { Button, TextField } from "@vibe/core";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { AccountRole } from "@/server/services/permissions";
import { Card, PageHead, useAction } from "./ui";
import styles from "./admin.module.css";

type Cap = { key: string; group: string; labelKey: string };
type Builtin = { actions: string[]; roles: { role: string; allowed: Record<string, boolean> }[] };

export function RolesPage({ roles, builtin, capabilities, canManage }: { roles: AccountRole[]; builtin: Builtin; capabilities: Cap[]; canManage: boolean }) {
  const t = useT();
  const { run, error, busy } = useAction();
  const [name, setName] = useState("");
  const [base, setBase] = useState("member");
  const create = async () => { if (name.trim() && (await run(() => api.post("/api/v1/admin/roles", { name, baseRole: base })))) setName(""); };
  return (
    <>
      <PageHead title={t("admin.roles.title")} sub={t("admin.roles.sub")} actions={<Link href="/permissions"><Button kind="secondary" data-testid="open-permissions">{t("admin.roles.boardPermissions")}</Button></Link>} />
      {error && <div className={styles.error} role="alert" data-testid="admin-error">{error}</div>}

      <Card title={t("admin.roles.builtin")} testId="builtin-matrix">
        <table className={`${styles.table} ${styles.matrix}`}>
          <thead><tr><th>{t("admin.roles.capability")}</th>{builtin.roles.map((r) => <th key={r.role}>{t(`admin.role.${r.role}`)}</th>)}</tr></thead>
          <tbody>
            {capabilities.map((c) => (
              <tr key={c.key}>
                <td>{t(c.labelKey)}</td>
                {builtin.roles.map((r) => <td key={r.role} className={r.allowed[c.key] ? styles.yes : styles.no}>{r.allowed[c.key] ? "✓" : "–"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.hint} style={{ marginTop: 12 }}>{t("admin.roles.builtinHint")}</p>
      </Card>

      <h2 style={{ fontSize: 18 }}>{t("admin.roles.custom")}</h2>
      {canManage && (
        <Card title={t("admin.roles.new")}>
          <form className={styles.fieldRow} onSubmit={(e) => { e.preventDefault(); create(); }}>
            <TextField value={name} onChange={setName} placeholder={t("admin.roles.namePlaceholder")} size="medium" data-testid="role-name" />
            <select className={styles.select} value={base} onChange={(e) => setBase(e.target.value)} aria-label={t("admin.roles.base")} data-testid="role-base">
              <option value="member">{t("admin.role.member")}</option><option value="viewer">{t("admin.role.viewer")}</option><option value="guest">{t("admin.role.guest")}</option><option value="admin">{t("admin.role.admin")}</option>
            </select>
            <Button type="submit" loading={busy} disabled={!name.trim()} data-testid="role-create">{t("admin.roles.create")}</Button>
          </form>
        </Card>
      )}
      {roles.map((r) => <RoleCard key={r.id} role={r} capabilities={capabilities} canManage={canManage} />)}
      {!roles.length && <p className={styles.hint}>{t("admin.roles.none")}</p>}
    </>
  );
}

function RoleCard({ role, capabilities, canManage }: { role: AccountRole; capabilities: Cap[]; canManage: boolean }) {
  const t = useT();
  const { run, busy } = useAction();
  const [caps, setCaps] = useState<Record<string, boolean>>(role.capabilities);
  const dirty = JSON.stringify(caps) !== JSON.stringify(role.capabilities);
  // tri-state: default (follows the base role) | allow | deny
  const set = (key: string, v: string) => setCaps((c) => { const n = { ...c }; if (v === "default") delete n[key]; else n[key] = v === "allow"; return n; });
  return (
    <Card testId="role-card" title={`${role.name}  ·  ${t(`admin.role.${role.baseRole}`)}`} actions={
      canManage && <Button size="small" kind="tertiary" color="negative" onClick={() => confirm(t("admin.roles.confirmDelete", { name: role.name })) && run(() => api.del(`/api/v1/admin/roles/${role.id}`))} data-testid="role-delete">{t("common.delete")}</Button>
    }>
      <p className={styles.hint}>{t("admin.roles.users", { n: role.userCount })}</p>
      <table className={styles.table} data-testid="role-caps" data-role-name={role.name}>
        <tbody>
          {capabilities.map((c) => (
            <tr key={c.key}>
              <td>{t(c.labelKey)}</td>
              <td style={{ width: 200 }}>
                <select className={styles.select} disabled={!canManage} value={c.key in caps ? (caps[c.key] ? "allow" : "deny") : "default"} onChange={(e) => set(c.key, e.target.value)} aria-label={t(c.labelKey)} data-testid={`cap-${c.key}`}>
                  <option value="default">{t("admin.roles.default")}</option><option value="allow">{t("admin.roles.allow")}</option><option value="deny">{t("admin.roles.deny")}</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {canManage && <div style={{ marginTop: 12 }}><Button size="small" disabled={!dirty || busy} onClick={() => run(() => api.patch(`/api/v1/admin/roles/${role.id}`, { capabilities: caps }))} data-testid="role-save">{t("common.save")}</Button></div>}
    </Card>
  );
}
