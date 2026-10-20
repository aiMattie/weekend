import { requireUser, userToActor } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { BillingPage } from "@/modules/admin/ui/billing-page";
import { NoAccess } from "@/modules/admin/ui/no-access";
import { account } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function Page() {
  const actor = userToActor(await requireUser());
  if (!can(actor, "account:billing") && !can(actor, "account:manage")) return <NoAccess />;
  return <BillingPage overview={account.planOverview(actor)} canChange={can(actor, "account:billing")} />;
}
