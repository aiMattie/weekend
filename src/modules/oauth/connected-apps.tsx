"use client";

import { Button } from "@vibe/core";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { Card, Chip } from "@/modules/admin/ui/ui";
import styles from "@/modules/admin/ui/admin.module.css";
import local from "@/modules/platform/ui/platform.module.css";

export interface ConnectedAppDto { id: string; clientName: string; userName: string; scopes: ("read" | "write")[]; workspaceIds: string[] | null; createdAt: string; lastUsedAt: string | null }

const fmt = (iso: string | null, never: string) => (iso ? new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" }) : never);

function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return <Button size="xs" kind="tertiary" data-testid="claude-copy-url" onClick={() => { void navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>{done ? t("oauth.connect.copied") : t("oauth.connect.copy")}</Button>;
}

/** Step-by-step manual: connect Claude (claude.ai, Desktop, mobile, Claude Code) to this environment over OAuth. */
export function ClaudeConnectCard({ baseUrl }: { baseUrl: string }) {
  const t = useT();
  const url = `${baseUrl}/api/mcp`;
  return (
    <Card title={t("oauth.connect.title")} testId="oauth-connect-card">
      <p className={styles.hint}>{t("oauth.connect.intro")}</p>
      <div className={local.endpointRow}>
        <span>{t("oauth.connect.url")}</span><code className={styles.mono} data-testid="claude-mcp-url">{url}</code><CopyButton text={url} />
      </div>
      <h3 style={{ margin: "16px 0 6px", fontSize: 14 }}>{t("oauth.connect.webTitle")}</h3>
      <ol className={local.steps}>
        <li>{t("oauth.connect.web1")}</li>
        <li>{t("oauth.connect.web2")}</li>
        <li>{t("oauth.connect.web3")}</li>
        <li>{t("oauth.connect.web4")}</li>
        <li>{t("oauth.connect.web5")}</li>
      </ol>
      <h3 style={{ margin: "16px 0 6px", fontSize: 14 }}>{t("oauth.connect.codeTitle")}</h3>
      <ol className={local.steps}>
        <li>{t("oauth.connect.code1")}</li>
        <li>{t("oauth.connect.code2")}</li>
      </ol>
      <pre className={local.code}>{`claude mcp add --transport http weekend ${url}`}</pre>
      <p className={styles.hint}>{t("oauth.connect.try")}</p>
    </Card>
  );
}

/** The user's OAuth grants (admins on Admin > API see their own too), each revocable. */
export function ConnectedAppsCard({ apps: initial, workspaces }: { apps: ConnectedAppDto[]; workspaces: { id: string; name: string }[] }) {
  const t = useT();
  const [apps, setApps] = useState(initial);
  const wsName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id;
  async function revoke(a: ConnectedAppDto) {
    if (!window.confirm(t("oauth.apps.revokeConfirm", { client: a.clientName }))) return;
    await api.del(`/api/v1/oauth-grants/${a.id}`);
    setApps(await api.get<ConnectedAppDto[]>("/api/v1/oauth-grants"));
  }
  return (
    <Card title={t("oauth.apps.title")} testId="oauth-apps-card">
      {apps.length === 0 ? <p className={styles.hint}>{t("oauth.apps.empty")}</p> : (
        <div className={local.tableWrap}>
          <table className={styles.table} data-testid="oauth-apps">
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} data-testid="oauth-app-row">
                  <td><strong>{a.clientName}</strong></td>
                  <td>{a.scopes.map((s) => <Chip key={s} tone={s === "read" ? "blue" : "orange"}>{t(`oauth.scope.${s}`)}</Chip>)}</td>
                  <td>{a.workspaceIds?.length ? a.workspaceIds.map(wsName).join(", ") : t("oauth.apps.allWorkspaces")}</td>
                  <td>{t("oauth.apps.lastUsed")}: {fmt(a.lastUsedAt, t("oauth.apps.never"))}</td>
                  <td><Button size="xs" kind="tertiary" color="negative" onClick={() => void revoke(a)} data-testid="oauth-app-revoke">{t("oauth.apps.revoke")}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Admin > API > MCP tab: manual + connected apps. */
export function ConnectedApps({ baseUrl, apps, workspaces }: { baseUrl: string; apps: ConnectedAppDto[]; workspaces: { id: string; name: string }[] }) {
  return <><ClaudeConnectCard baseUrl={baseUrl} /><ConnectedAppsCard apps={apps} workspaces={workspaces} /></>;
}
