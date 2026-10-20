import { requireUser, userToActor } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PermissionsPage } from "@/modules/admin/ui/permissions-page";
import { boards, permissionsAdmin, users, workspaces } from "@/server/services";

export const dynamic = "force-dynamic";

/** Workspace and board permissions (owners and admins). ?workspace=<id> or ?board=<id> selects what to edit. */
export default async function Page({ searchParams }: { searchParams: Promise<{ workspace?: string; board?: string }> }) {
  const sp = await searchParams;
  const actor = userToActor(await requireUser());
  const ws = workspaces.list(actor).filter((w) => can(actor, "workspace:update", { workspaceId: w.id }));
  const bs = boards.list(actor).filter((b) => can(actor, "board:manage_members", { boardId: b.id }));
  const wsInfo = sp.workspace && ws.some((w) => w.id === sp.workspace) ? permissionsAdmin.getWorkspace(actor, sp.workspace) : null;
  const bInfo = sp.board && bs.some((b) => b.id === sp.board) ? permissionsAdmin.getBoard(actor, sp.board) : null;
  const people = users.list(actor).map((u) => ({ id: u.id, name: u.name, role: u.role }));
  return (
    <PermissionsPage
      workspaces={ws.map((w) => ({ id: w.id, name: w.name }))}
      boards={bs.map((b) => ({ id: b.id, name: b.name, workspaceId: b.workspaceId }))}
      workspace={wsInfo ? JSON.parse(JSON.stringify(wsInfo)) : null}
      board={bInfo ? JSON.parse(JSON.stringify(bInfo)) : null}
      columnPerms={bInfo ? JSON.parse(JSON.stringify(permissionsAdmin.listColumnPermissions(actor, bInfo.id))) : []}
      people={people}
    />
  );
}
