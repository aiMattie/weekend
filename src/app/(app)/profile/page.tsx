import { requireUser, userToActor, getCurrentSessionId } from "@/lib/auth";
import { ProfilePage } from "@/modules/admin/ui/profile-page";
import { profile, sessions, security, workspaces } from "@/server/services";
import { issuer, listGrants } from "@/server/services/oauth";
import { passwordViolations } from "@/server/services/security";
import { profileView } from "@/server/services/sso-settings";
import { isSsoErrorCode } from "@/server/sso/oauth";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ setup2fa?: string; google?: string; microsoft?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const actor = userToActor(user);
  const sid = await getCurrentSessionId();
  void security;
  return (
    <ProfilePage
      profile={profile.get(actor)}
      sessions={JSON.parse(JSON.stringify(sessions.list(actor, actor.id, sid)))}
      autoSetup2fa={sp.setup2fa === "1"}
      policyHint={passwordViolations(actor.accountId, "").join(", ")}
      google={profileView(actor)}
      googleFlash={sp.google === "linked" || isSsoErrorCode(sp.google) ? sp.google : null}
      microsoft={profileView(actor, "microsoft")}
      microsoftFlash={sp.microsoft === "linked" || isSsoErrorCode(sp.microsoft) ? sp.microsoft : null}
      claude={JSON.parse(JSON.stringify({ baseUrl: issuer(), apps: listGrants(actor), workspaces: workspaces.list(actor).map((w) => ({ id: w.id, name: w.name })) }))}
    />
  );
}
