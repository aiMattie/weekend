"use client";

import { Button, TextField } from "@vibe/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { Card, Chip, Field } from "@/modules/admin/ui/ui";
import styles from "@/modules/admin/ui/admin.module.css";
import type { PlatformProps, TokenDto } from "./types";
import local from "./platform.module.css";

const fmt = (iso: string | null, never: string) => (iso ? new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" }) : never);

function statusOf(tk: TokenDto): "active" | "revoked" | "expired" {
  if (tk.revokedAt) return "revoked";
  if (tk.expiresAt && Date.parse(tk.expiresAt) < Date.now()) return "expired";
  return "active";
}

export function TokensPanel({ tokens, workspaces, defaultBudget, isAdmin }: Pick<PlatformProps, "tokens" | "workspaces" | "defaultBudget" | "isAdmin">) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [read, setRead] = useState(true);
  const [write, setWrite] = useState(true);
  const [limitWs, setLimitWs] = useState(false);
  const [wsIds, setWsIds] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [days, setDays] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [all, setAll] = useState(false);
  const [allTokens, setAllTokens] = useState<TokenDto[] | null>(null);

  const reset = () => { setName(""); setRead(true); setWrite(true); setLimitWs(false); setWsIds([]); setBudget(""); setDays(""); setError(""); };

  async function submit() {
    if (!name.trim()) { setError(t("platform.tokens.nameRequired")); return; }
    setBusy(true);
    setError("");
    try {
      const scopes = [...(read ? ["read"] : []), ...(write ? ["write"] : [])];
      const res = await api.post<{ token: string }>("/api/v1/api-tokens", {
        name: name.trim(), scopes: scopes.length ? scopes : ["read"], workspaceIds: limitWs && wsIds.length ? wsIds : null,
        dailyBudget: budget ? Number(budget) : null, expiresInDays: days ? Number(days) : null,
      });
      setCreated(res.token);
      setOpen(false);
      reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Mislukt");
    } finally { setBusy(false); }
  }

  async function revoke(id: string) {
    if (!window.confirm(t("platform.tokens.revokeConfirm"))) return;
    await api.del(`/api/v1/api-tokens/${id}`);
    router.refresh();
    if (all) setAllTokens(await api.get<TokenDto[]>("/api/v1/api-tokens?all=1"));
  }

  async function toggleAll(v: boolean) {
    setAll(v);
    setAllTokens(v ? await api.get<TokenDto[]>("/api/v1/api-tokens?all=1") : null);
  }

  const rows = all && allTokens ? allTokens : tokens;
  const wsName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id;

  return (
    <>
      {created && (
        <div className={`${styles.banner} ${styles.bannerWarn}`} data-testid="token-created" role="status">
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{t("platform.tokens.created")}</strong>
            <div>{t("platform.tokens.copyOnce")}</div>
            <div className={`${styles.secret} ${styles.mono}`} data-testid="token-value">{created}</div>
            <div className={styles.actions}>
              <Button size="small" data-testid="token-copy" onClick={() => { void navigator.clipboard?.writeText(created); setCopied(true); }}>{copied ? t("platform.tokens.copied") : t("platform.tokens.copy")}</Button>
              <Button size="small" kind="tertiary" data-testid="token-done" onClick={() => { setCreated(null); setCopied(false); }}>{t("platform.tokens.done")}</Button>
            </div>
          </div>
        </div>
      )}

      <Card title={t("platform.tokens.title")} testId="tokens-card" actions={
        <div className={styles.actions}>
          {isAdmin && <label className={styles.muted} style={{ fontSize: 13 }}><input type="checkbox" checked={all} onChange={(e) => void toggleAll(e.target.checked)} data-testid="tokens-show-all" /> {t("platform.tokens.showAll")}</label>}
          <Button size="small" onClick={() => { setOpen((o) => !o); setCreated(null); }} data-testid="token-new">{t("platform.tokens.create")}</Button>
        </div>
      }>
        <p className={styles.hint}>{t("platform.tokens.hint")}</p>

        {open && (
          <form className={local.form} data-testid="token-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <Field label={t("platform.tokens.name")}>
              <TextField value={name} onChange={setName} placeholder={t("platform.tokens.namePlaceholder")} data-testid="token-name" autoFocus />
            </Field>
            <Field label={t("platform.tokens.scopes")}>
              <div className={styles.fieldRow} style={{ marginBottom: 0 }}>
                <label><input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} data-testid="token-scope-read" /> {t("platform.tokens.scope.read")}</label>
                <label><input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} data-testid="token-scope-write" /> {t("platform.tokens.scope.write")}</label>
              </div>
            </Field>
            <Field label={t("platform.tokens.workspaces")}>
              <select className={styles.select} value={limitWs ? "some" : "all"} onChange={(e) => setLimitWs(e.target.value === "some")} data-testid="token-ws-mode">
                <option value="all">{t("platform.tokens.allWorkspaces")}</option>
                <option value="some">{t("platform.tokens.onlyWorkspaces")}</option>
              </select>
              {limitWs && (
                <div className={styles.pickRow} data-testid="token-ws-list">
                  {workspaces.map((w) => (
                    <label key={w.id}><input type="checkbox" checked={wsIds.includes(w.id)} onChange={(e) => setWsIds(e.target.checked ? [...wsIds, w.id] : wsIds.filter((x) => x !== w.id))} /> {w.name}</label>
                  ))}
                </div>
              )}
            </Field>
            <div className={styles.fieldRow}>
              <Field label={t("platform.tokens.budget")} hint={`${t("platform.tokens.budgetHint")} (${defaultBudget.toLocaleString("nl-NL")})`}>
                <TextField value={budget} onChange={setBudget} type="number" data-testid="token-budget" />
              </Field>
              <Field label={t("platform.tokens.expires")} hint={t("platform.tokens.expiresHint")}>
                <TextField value={days} onChange={setDays} type="number" data-testid="token-days" />
              </Field>
            </div>
            <div className={styles.error} role="alert">{error}</div>
            <div className={styles.actions}>
              <Button type="submit" loading={busy} data-testid="token-submit">{t("platform.tokens.submit")}</Button>
              <Button kind="tertiary" onClick={() => { setOpen(false); reset(); }}>{t("common.cancel")}</Button>
            </div>
          </form>
        )}

        {rows.length === 0 ? <p className={styles.muted} data-testid="tokens-empty">{t("platform.tokens.empty")}</p> : (
          <div className={local.tableWrap}>
            <table className={styles.table} data-testid="tokens-table">
              <thead>
                <tr>
                  <th>{t("platform.tokens.col.name")}</th>
                  {all && <th>{t("platform.tokens.owner")}</th>}
                  <th>{t("platform.tokens.col.token")}</th>
                  <th>{t("platform.tokens.col.scopes")}</th>
                  <th>{t("platform.tokens.col.workspaces")}</th>
                  <th>{t("platform.tokens.col.lastUsed")}</th>
                  <th>{t("platform.tokens.col.today")}</th>
                  <th>{t("platform.tokens.col.status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((tk) => {
                  const st = statusOf(tk);
                  return (
                    <tr key={tk.id} data-testid="token-row" data-token-name={tk.name} data-status={st}>
                      <td><strong>{tk.name}</strong></td>
                      {all && <td>{tk.userName}</td>}
                      <td className={styles.mono}>{tk.tokenPrefix}...</td>
                      <td>{tk.scopes.map((s) => <Chip key={s} tone={s === "write" ? "orange" : "blue"}>{t(`platform.tokens.scope.${s}`)}</Chip>)}</td>
                      <td>{tk.workspaceIds ? tk.workspaceIds.map(wsName).join(", ") : t("platform.tokens.all")}</td>
                      <td data-testid="token-last-used">{fmt(tk.lastUsedAt, t("platform.tokens.never"))}</td>
                      <td>{tk.usedToday.toLocaleString("nl-NL")} / {(tk.dailyBudget ?? defaultBudget).toLocaleString("nl-NL")}</td>
                      <td><Chip tone={st === "active" ? "green" : "red"}>{t(`platform.tokens.${st}`)}</Chip></td>
                      <td>{st === "active" && <Button size="xs" kind="tertiary" color="negative" onClick={() => void revoke(tk.id)} data-testid="token-revoke">{t("platform.tokens.revoke")}</Button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
