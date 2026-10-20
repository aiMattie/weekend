import { requireUser, userToActor } from "@/lib/auth";
import { FormsListPage } from "@/modules/boards-extra/forms/forms-list";
import { boards, forms, workspaces } from "@/server/services";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function FormsRoute() {
  const user = await requireUser();
  const actor = userToActor(user);
  const ws = workspaces.list(actor);
  const bs = boards.list(actor);
  const wsName = new Map(ws.map((w) => [w.id, w.name]));
  const boardName = new Map(bs.map((b) => [b.id, b.name]));
  const list = forms.list(actor).map((f) => ({ ...f, boardName: boardName.get(f.boardId) ?? "-", workspaceName: wsName.get(f.workspaceId) ?? "-" }));
  const canCreate = ws.some((w) => can(actor, "workspace:create_board", { workspaceId: w.id }));
  return (
    <FormsListPage
      forms={list}
      workspaces={ws.filter((w) => can(actor, "workspace:create_board", { workspaceId: w.id })).map((w) => ({ id: w.id, name: w.name }))}
      boards={bs.filter((b) => b.kind === "board" && can(actor, "board:edit_structure", { boardId: b.id })).map((b) => ({ id: b.id, name: b.name, workspaceId: b.workspaceId }))}
      canCreate={canCreate}
    />
  );
}
