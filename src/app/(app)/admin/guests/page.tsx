import { requireUser, userToActor } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { GuestsPage } from "@/modules/admin/ui/guests-page";
import { NoAccess } from "@/modules/admin/ui/no-access";
import { boards, guests, members, workspaces } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function Page() {
  const actor = userToActor(await requireUser());
  if (!can(actor, "account:guests")) return <NoAccess />;
  const ws = workspaces.list(actor);
  const bs = boards.list(actor).filter((b) => b.visibility !== "private");
  return (
    <GuestsPage
      overview={JSON.parse(JSON.stringify(guests.overview(actor)))}
      invitations={JSON.parse(JSON.stringify(members.listInvitations(actor, { status: "pending", guests: true })))}
      workspaces={ws.map((w) => ({ id: w.id, name: w.name }))}
      boards={bs.map((b) => ({ id: b.id, name: b.name, workspaceId: b.workspaceId, visibility: b.visibility }))}
    />
  );
}
