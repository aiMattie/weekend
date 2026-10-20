import { requireUser, userToActor } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { NoAccess } from "@/modules/admin/ui/no-access";
import { SsoPage } from "@/modules/sso/ui/sso-page";
import { adminView } from "@/server/services/sso-settings";
import { isSsoErrorCode } from "@/server/sso/oauth";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ test?: string; match?: string; email?: string; provider?: string }> }) {
  const actor = userToActor(await requireUser());
  if (!can(actor, "account:security")) return <NoAccess />;
  const sp = await searchParams;
  const provider = sp.provider === "microsoft" ? "microsoft" as const : "google" as const;
  const test = sp.test === "ok" ? { ok: true as const, match: sp.match ?? "none", email: (sp.email ?? "").slice(0, 200), provider } : isSsoErrorCode(sp.test) ? { ok: false as const, code: sp.test, provider } : null;
  return <SsoPage view={JSON.parse(JSON.stringify(adminView(actor)))} test={test} />;
}
