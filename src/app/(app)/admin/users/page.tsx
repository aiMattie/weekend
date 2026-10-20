import { requireUser, userToActor } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { NoAccess } from "@/modules/admin/ui/no-access";
import { UsersPage } from "@/modules/admin/ui/users-page";
import { members, permissionsAdmin } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function Page() {
  const actor = userToActor(await requireUser());
  if (!can(actor, "account:invite")) return <NoAccess />;
  return (
    <UsersPage
      users={JSON.parse(JSON.stringify(members.list(actor)))}
      invitations={JSON.parse(JSON.stringify(members.listInvitations(actor, { status: "pending", guests: false })))}
      roles={JSON.parse(JSON.stringify(permissionsAdmin.listRoles(actor)))}
      meId={actor.id}
    />
  );
}
