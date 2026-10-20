import { requireUser, userToActor } from "@/lib/auth";
import { DocsList } from "@/modules/boards-extra/docs/docs-list";
import { docs, workspaces } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function DocsPage() {
  const user = await requireUser();
  const actor = userToActor(user);
  const ws = workspaces.list(actor).map((w) => ({ id: w.id, name: w.name }));
  const list = docs.list(actor, {});
  const preferred = ws.find((w) => w.name === "Delivery")?.id ?? ws[0]?.id ?? null;
  return <DocsList docs={list} workspaces={ws} defaultWorkspaceId={preferred} />;
}
