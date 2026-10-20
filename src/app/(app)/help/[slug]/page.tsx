import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpShell } from "@/modules/help/help-shell";
import { loadChapter, loadIndex } from "@/modules/help/content";
import styles from "@/modules/help/help.module.css";

export const dynamic = "force-dynamic";

/** /help/<slug>: one chapter of docs/handleiding/<slug>.md. */
export default async function HelpChapterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const chapter = loadChapter(slug);
  if (!chapter) notFound();
  const index = loadIndex();
  const pos = index.findIndex((c) => c.slug === slug);
  const prev = pos > 0 ? index[pos - 1] : null;
  const next = pos >= 0 && pos < index.length - 1 ? index[pos + 1] : null;
  return (
    <HelpShell index={index} active={slug}>
      <div data-testid="help-chapter" dangerouslySetInnerHTML={{ __html: chapter.html }} />
      <div className={styles.pager}>
        {prev ? <Link href={`/help/${prev.slug}`} className={styles.pagerLink} data-testid="help-prev"><span className={styles.pagerLabel}>Vorige</span><span className={styles.pagerTitle}>{prev.title}</span></Link> : <span />}
        {next ? <Link href={`/help/${next.slug}`} className={`${styles.pagerLink} ${styles.pagerNext}`} data-testid="help-next"><span className={styles.pagerLabel}>Volgende</span><span className={styles.pagerTitle}>{next.title}</span></Link> : null}
      </div>
    </HelpShell>
  );
}
