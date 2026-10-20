import { Suspense } from "react";
import { requireUser, userToActor } from "@/lib/auth";
import { ServiceError } from "@/lib/errors";
import { t, type Locale } from "@/lib/i18n";
import { getBoardFull } from "@/server/services";
import { BoardPage } from "@/components/board/board-page";
import styles from "@/components/board/board-page.module.css";

export const dynamic = "force-dynamic";

/** /boards/<id>/pulses/<itemId>: the board with the item panel open on that item. */
export default async function PulseRoute({ params }: { params: Promise<{ boardId: string; itemId: string }> }) {
  const { boardId, itemId } = await params;
  const user = await requireUser();
  const locale = (user.locale as Locale) ?? "nl";
  let initial;
  try {
    initial = getBoardFull(userToActor(user), boardId);
  } catch (e) {
    if (e instanceof ServiceError) return <div className={styles.message} data-testid="board-not-found">{t(locale, "shell.boardNotFound")}</div>;
    throw e;
  }
  return (
    <Suspense>
      <BoardPage key={boardId} initial={initial} pulseItemId={itemId} />
    </Suspense>
  );
}
