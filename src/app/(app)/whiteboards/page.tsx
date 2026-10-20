import { requireUser, userToActor } from "@/lib/auth";
import { WhiteboardsList } from "@/modules/boards-extra/whiteboard/whiteboards-list";
import { whiteboards, workspaces } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function WhiteboardsPage() {
  const user = await requireUser();
  const actor = userToActor(user);
  const ws = workspaces.list(actor).map((w) => ({ id: w.id, name: w.name }));
  const boards = whiteboards.list(actor, {}).map((b) => ({ id: b.id, name: b.name, workspaceId: b.workspaceId, elementCount: b.elementCount, updatedAt: b.updatedAt }));
  return <WhiteboardsList boards={boards} workspaces={ws} defaultWorkspaceId={ws.find((w) => w.name === "Delivery")?.id ?? ws[0]?.id ?? null} />;
}
