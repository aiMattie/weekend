import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { items } from "@/db/schema/core";
import { requireUser, userToActor } from "@/lib/auth";
import type { UserLite } from "@/lib/board-types";
import { ServiceError } from "@/lib/errors";
import { t, type Locale } from "@/lib/i18n";
import { DocPage } from "@/modules/boards-extra/docs/doc-page";
import { docs, users, workspaces } from "@/server/services";
import styles from "@/components/board/board-page.module.css";

export const dynamic = "force-dynamic";

export default async function DocRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const locale = (user.locale as Locale) ?? "nl";
  const actor = userToActor(user);
  let doc;
  try {
    doc = docs.get(actor, id);
  } catch (e) {
    if (e instanceof ServiceError) return <div className={styles.message} data-testid="doc-not-found">{t(locale, "docs.notFound")}</div>;
    throw e;
  }
  const people: UserLite[] = users.list(actor).map((u) => ({ id: u.id, name: u.name, email: u.email, photoUrl: u.photoUrl, title: u.title, isAiAgent: u.isAiAgent }));
  let workspaceName = "";
  try { workspaceName = workspaces.get(actor, doc.workspaceId).name; } catch { workspaceName = ""; }
  const item = doc.itemId ? db.select({ name: items.name, boardId: items.boardId }).from(items).where(eq(items.id, doc.itemId)).get() : undefined;
  return (
    <DocPage
      key={doc.id}
      initial={JSON.parse(JSON.stringify(doc))}
      users={people}
      currentUserId={user.id}
      isAdmin={user.role === "admin"}
      crumbs={{ workspaceName, workspaceHref: `/workspaces/${doc.workspaceId}`, itemName: item?.name ?? null, itemHref: item ? `/boards/${item.boardId}?item=${doc.itemId}` : null }}
    />
  );
}
