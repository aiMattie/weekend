import { headers } from "next/headers";
import { requireUser, userToActor } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { NoAccess } from "@/modules/admin/ui/no-access";
import { SecurityPage } from "@/modules/admin/ui/security-page";
import { security } from "@/server/services";
import { panicStatus } from "@/server/services/security";

export const dynamic = "force-dynamic";

export default async function Page() {
  const actor = userToActor(await requireUser());
  // a locked account (panic button) only lets the recovery session in here, so this screen must stay reachable
  if (!can(actor, "account:security")) return <NoAccess />;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  return (
    <SecurityPage
      settings={JSON.parse(JSON.stringify(security.get(actor)))}
      sso={JSON.parse(JSON.stringify(security.getSso(actor, origin)))}
      panic={panicStatus(actor.accountId)}
      origin={origin}
    />
  );
}
