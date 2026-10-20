import { redirect } from "next/navigation";
import { getCurrentUser, userToActor } from "@/lib/auth";
import { translate, type Locale } from "@/lib/i18n";
import { workspaces } from "@/server/services";
import { AuthorizeFatalError, OAuthError, errorRedirect, parseAuthorizeRequest, resolveClientRedirect, type AuthorizeRequest } from "@/server/services/oauth";
import styles from "./consent.module.css";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

function validate(sp: Search): { req: AuthorizeRequest } | { fatal: string } | { redirectTo: string } {
  try {
    return { req: parseAuthorizeRequest(sp) };
  } catch (err) {
    if (err instanceof AuthorizeFatalError) return { fatal: err.message };
    if (err instanceof OAuthError) return { redirectTo: errorRedirect(resolveClientRedirect(sp), err.error, err.message) };
    throw err;
  }
}

/** OAuth consent screen: the signed-in user approves or denies an MCP client (Claude). */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v]])));
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${qs}`)}`);
  }
  const locale = (user.locale === "en" ? "en" : "nl") as Locale;
  const t = (key: string, vars?: Record<string, string>) => translate(locale, key, vars);
  const v = validate(sp);
  if ("redirectTo" in v) redirect(v.redirectTo);
  if ("fatal" in v) {
    return (
      <main className={styles.wrap}>
        <div className={styles.card} data-testid="oauth-invalid">
          <div className={styles.logo}>Weekend</div>
          <h1 className={styles.title}>{t("oauth.consent.invalidTitle")}</h1>
          <p className={styles.error}>{v.fatal}</p>
        </div>
      </main>
    );
  }
  const { req } = v;
  const ws = workspaces.list(userToActor(user));
  const hidden: Record<string, string> = {
    client_id: req.client.id, redirect_uri: req.redirectUri, response_type: "code", code_challenge: req.codeChallenge,
    code_challenge_method: "S256", scope: req.scopes.join(" "), ...(req.state ? { state: req.state } : {}), ...(req.resource ? { resource: req.resource } : {}),
  };
  return (
    <main className={styles.wrap}>
      <form className={styles.card} method="post" action="/api/oauth/authorize" data-testid="oauth-consent">
        <div className={styles.logo}>Weekend</div>
        <h1 className={styles.title}>{t("oauth.consent.title", { client: req.client.name })}</h1>
        <p className={styles.muted}>{t("oauth.consent.signedInAs", { name: user.name, email: user.email })}</p>
        {Object.entries(hidden).map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />)}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{t("oauth.consent.scopes")}</legend>
          <label className={styles.check}>
            <input type="checkbox" checked disabled readOnly />
            <input type="hidden" name="grant_read" value="on" />
            <span>{t("oauth.consent.scopeRead")}</span>
          </label>
          {req.scopes.includes("write") && (
            <label className={styles.check}>
              <input type="checkbox" name="grant_write" defaultChecked data-testid="oauth-scope-write" />
              <span>{t("oauth.consent.scopeWrite")}</span>
            </label>
          )}
        </fieldset>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{t("oauth.consent.workspace")}</legend>
          <select name="workspace_id" className={styles.select} defaultValue="" aria-label={t("oauth.consent.workspace")} data-testid="oauth-workspace">
            <option value="">{t("oauth.consent.allWorkspaces")}</option>
            {ws.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </fieldset>
        <p className={styles.muted}>{t("oauth.consent.redirect", { host: new URL(req.redirectUri).host })} {t("oauth.consent.note")}</p>
        <div className={styles.buttons}>
          <button type="submit" name="decision" value="deny" className={styles.secondary} data-testid="oauth-deny">{t("oauth.consent.deny")}</button>
          <button type="submit" name="decision" value="approve" className={styles.primary} data-testid="oauth-approve">{t("oauth.consent.approve")}</button>
        </div>
      </form>
    </main>
  );
}
