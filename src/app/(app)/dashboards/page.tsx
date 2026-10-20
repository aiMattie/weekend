import { requireUser, userToActor } from "@/lib/auth";
import { DashboardsList } from "@/modules/boards-extra/dashboards/dashboards-list";
import { boards, dashboards, workspaces } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function DashboardsPage() {
  const actor = userToActor(await requireUser());
  const ws = workspaces.list(actor);
  const wsName = new Map(ws.map((w) => [w.id, w.name]));
  const list = dashboards.list(actor).map((d) => ({ id: d.id, name: d.name, workspaceName: wsName.get(d.workspaceId) ?? "", boardCount: d.boardIds.length, widgetCount: d.widgetCount, locked: d.locked, visibility: d.visibility }));
  const bs = boards.list(actor).filter((b) => b.kind !== "dashboard").map((b) => ({ id: b.id, name: b.name, workspaceName: wsName.get(b.workspaceId) ?? "" }));
  return <DashboardsList dashboards={list} boards={bs} workspaces={ws.map((w) => ({ id: w.id, name: w.name }))} />;
}
