import Link from "next/link";
import { requireUser, userToActor } from "@/lib/auth";
import { translate, type Locale } from "@/lib/i18n";
import { boards, recent, workspaces } from "@/server/services";
import styles from "@/components/shell/shell.module.css";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const actor = userToActor(user);
  const locale = (user.locale as Locale) ?? "nl";
  const t = (k: string) => translate(locale, k);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("shell.greetingMorning") : hour < 18 ? t("shell.greetingAfternoon") : t("shell.greetingEvening");
  const favs = boards.listFavorites(actor);
  const all = boards.list(actor);
  const wsNames = new Map(workspaces.list(actor).map((w) => [w.id, w.name]));
  const shown = favs.length ? favs : all.slice(0, 12);
  const recents = recent.list(actor, 8);
  return (
    <div className={styles.page} data-testid="home-page">
      <h1 className={styles.pageTitle}>{greeting}, {user.name.split(" ")[0]}</h1>
      <p className={styles.pageSub}>{t("shell.homeSub")}</p>
      <h2 className={styles.sectionTitle}>{favs.length ? t("shell.favorites") : t("shell.recentBoards")}</h2>
      <div className={styles.cardGrid}>
        {shown.map((b) => (
          <Link key={b.id} href={`/boards/${b.id}`} className={styles.card} data-testid={`home-board-${b.id}`}>
            <span className={styles.cardTitle}>{b.name}</span>
            <span className={styles.cardMeta}>work management &gt; {wsNames.get(b.workspaceId)}</span>
          </Link>
        ))}
      </div>
      {recents.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>{t("chrome.recentBoards")}</h2>
          <div className={styles.cardGrid} data-testid="home-recent">
            {recents.map((r) => (
              <Link key={r.board.id} href={`/boards/${r.board.id}`} className={styles.card} data-testid={`home-recent-${r.board.id}`}>
                <span className={styles.cardTitle}>{r.board.name}</span>
                <span className={styles.cardMeta}>work management &gt; {wsNames.get(r.board.workspaceId)}</span>
              </Link>
            ))}
          </div>
        </>
      )}
      <h2 className={styles.sectionTitle}>{t("shell.workspaces")}</h2>
      <div className={styles.cardGrid}>
        {[...wsNames.entries()].map(([id, name]) => (
          <Link key={id} href={`/workspaces/${id}`} className={styles.card}>
            <span className={styles.cardTitle}>{name}</span>
            <span className={styles.cardMeta}>{all.filter((b) => b.workspaceId === id).length} boards</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
