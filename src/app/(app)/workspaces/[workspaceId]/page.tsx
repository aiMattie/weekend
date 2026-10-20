import { WorkspaceHome, type WsHomeData } from "@/components/board/chrome/workspace-home";
import { requireUser, userToActor } from "@/lib/auth";
import { ServiceError } from "@/lib/errors";
import { translate, type Locale } from "@/lib/i18n";
import { can } from "@/lib/permissions";
import { boards, folders, recent, workspaces } from "@/server/services";
import styles from "@/components/shell/shell.module.css";

export const dynamic = "force-dynamic";

function load(actor: ReturnType<typeof userToActor>, workspaceId: string): WsHomeData | null {
  try {
    const ws = workspaces.get(actor, workspaceId);
    const list = boards.list(actor, { workspaceId });
    const ids = new Set(list.map((b) => b.id));
    return {
      workspace: { id: ws.id, name: ws.name, description: ws.description, kind: ws.kind, color: ws.color },
      boards: list.map((b) => ({ id: b.id, name: b.name, kind: b.kind, folderId: b.folderId, visibility: b.visibility })),
      folders: folders.list(actor, workspaceId).map((f) => ({ id: f.id, name: f.name, parentFolderId: f.parentFolderId })),
      recentIds: recent.list(actor, 30).map((r) => r.board.id).filter((id) => ids.has(id)).slice(0, 10),
      favoriteIds: boards.listFavorites(actor).map((b) => b.id),
      members: workspaces.listMembers(actor, workspaceId).map((m) => ({ userId: m.userId, name: m.name, role: m.role })),
      canManage: can(actor, "workspace:update", { workspaceId }),
    };
  } catch (e) {
    if (e instanceof ServiceError) return null;
    throw e;
  }
}

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const user = await requireUser();
  const data = load(userToActor(user), workspaceId);
  if (!data) return <div className={styles.page}>{translate((user.locale as Locale) ?? "nl", "shell.workspaceNotFound")}</div>;
  return <WorkspaceHome data={data} />;
}
