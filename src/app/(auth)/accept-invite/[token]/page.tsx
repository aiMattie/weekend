import { AcceptInvite } from "@/modules/admin/ui/accept-invite";
import { passwordViolations } from "@/server/services/security";
import { members } from "@/server/services";
import { db } from "@/db/client";
import { accounts } from "@/db/schema/core";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = members.getInvitationByToken(token);
  const accountId = db.select({ id: accounts.id }).from(accounts).get()?.id;
  const rules = accountId ? passwordViolations(accountId, "").join(", ") : "";
  return <AcceptInvite token={token} invitation={inv} rules={rules} />;
}
