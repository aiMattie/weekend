import { requireUser, userToActor } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AccountPage } from "@/modules/admin/ui/account-page";
import { NoAccess } from "@/modules/admin/ui/no-access";
import { account } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function Page() {
  const actor = userToActor(await requireUser());
  if (!can(actor, "account:manage")) return <NoAccess />;
  return <AccountPage info={account.get(actor)} />;
}
