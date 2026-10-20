"use client";

import { Search } from "@vibe/core";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ChapterIndexEntry } from "./content";
import styles from "./help.module.css";

/** Help frame: sidebar with search + table of contents, article to the right. */
export function HelpShell({ index, active, children }: { index: ChapterIndexEntry[]; active: string | null; children: React.ReactNode }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const results = useMemo(() => {
    if (!query) return null;
    return index
      .map((c) => ({
        slug: c.slug,
        title: c.title,
        titleMatch: c.title.toLowerCase().includes(query),
        headings: c.headings.filter((h) => h.text.toLowerCase().includes(query)),
      }))
      .filter((c) => c.titleMatch || c.headings.length > 0);
  }, [index, query]);

  return (
    <div className={styles.layout} data-testid="help-page">
      <nav className={styles.side} aria-label="Inhoudsopgave" data-testid="help-toc">
        <Link href="/help" className={styles.sideTitle} data-testid="help-home">Handleiding</Link>
        <div className={styles.searchBox} data-testid="help-search">
          <Search value={q} onChange={setQ} placeholder="Zoek in de handleiding" size="small" />
        </div>
        {results ? (
          <div data-testid="help-results">
            {results.length === 0 ? <p className={styles.noResults} data-testid="help-no-results">Geen resultaten voor &ldquo;{q.trim()}&rdquo;.</p> : null}
            {results.map((c) => (
              <div key={c.slug} className={styles.resultGroup}>
                <Link href={`/help/${c.slug}`} className={styles.sideLink} data-testid={`help-result-${c.slug}`}>{c.title}</Link>
                {c.headings.map((h) => (
                  <Link key={h.id} href={`/help/${c.slug}#${h.id}`} className={styles.subLink} data-testid="help-result-heading">{h.text}</Link>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <ul className={styles.toc} data-testid="help-chapters">
            {index.map((c) => {
              const isActive = c.slug === active;
              return (
                <li key={c.slug}>
                  <Link href={`/help/${c.slug}`} className={`${styles.sideLink} ${isActive ? styles.sideLinkActive : ""}`} aria-current={isActive ? "page" : undefined} data-testid={`help-chapter-${c.slug}`}>{c.title}</Link>
                  {isActive ? (
                    <div className={styles.subList}>
                      {c.headings.filter((h) => h.level === 2).map((h) => (
                        <Link key={h.id} href={`/help/${c.slug}#${h.id}`} className={styles.subLink}>{h.text}</Link>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </nav>
      <div className={styles.content}>
        <article className={styles.article} data-testid="help-article">{children}</article>
      </div>
    </div>
  );
}
