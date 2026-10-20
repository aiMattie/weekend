import { requireUser, userToActor } from "@/lib/auth";
import { ServiceError } from "@/lib/errors";
import { t, type Locale } from "@/lib/i18n";
import { WhiteboardCanvas } from "@/modules/boards-extra/whiteboard/canvas";
import { whiteboards, workspaces } from "@/server/services";
import styles from "@/components/board/board-page.module.css";

export const dynamic = "force-dynamic";

export default async function WhiteboardRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const actor = userToActor(user);
  let wb;
  try {
    wb = whiteboards.get(actor, id);
  } catch (e) {
    if (e instanceof ServiceError) return <div className={styles.message} data-testid="wb-not-found">{t((user.locale as Locale) ?? "nl", "docs.wb.notFound")}</div>;
    throw e;
  }
  let wsName = "";
  try { wsName = workspaces.get(actor, wb.workspaceId).name; } catch { /* hidden workspace */ }
  return <WhiteboardCanvas key={wb.id} id={wb.id} name={wb.name} workspace={{ id: wb.workspaceId, name: wsName }} version={wb.version} elements={wb.data.elements} canEdit={wb.canEdit} />;
}
