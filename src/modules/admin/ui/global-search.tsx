"use client";

import { Search } from "@vibe/core";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { SearchHit, SearchKind, SearchResult } from "@/server/services/search";
import styles from "./global-search.module.css";

const ORDER: SearchKind[] = ["board", "item", "update", "doc", "workspace", "user"];

/**
 * Top bar search (module admin): grouped results over boards, items, updates, docs, workspaces and users
 * (permission filtered on the server), recent searches, keyboard: "/" or Ctrl+K focuses, arrows + Enter, Esc closes.
 */
export function GlobalSearch() {
  const t = useT();
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [forQuery, setForQuery] = useState("");
  const [active, setActive] = useState(0);
  const seq = useRef(0);

  const input = () => box.current?.querySelector("input") as HTMLInputElement | null;

  const loadRecent = useCallback(() => { api.get<string[]>("/api/v1/search/recent").then(setRecent).catch(() => undefined); }, []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        input()?.focus();
        input()?.select();
        setOpen(true);
        loadRecent(); // the box may already have focus (no focus event then)
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loadRecent]);

  // close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // debounced search (state is only set from the async callbacks)
  useEffect(() => {
    const text = q.trim();
    if (text.length < 1) return;
    const id = ++seq.current;
    const h = setTimeout(() => {
      api.get<SearchResult>(`/api/v1/search?q=${encodeURIComponent(text)}&limit=6`)
        .then((r) => { if (id === seq.current) { setResult(r); setForQuery(text); setActive(0); } })
        .catch(() => undefined);
    }, 180);
    return () => clearTimeout(h);
  }, [q]);
  const busy = q.trim() !== "" && forQuery !== q.trim();

  const flat = useMemo<SearchHit[]>(() => {
    const groups = [...(result?.groups ?? [])].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
    return groups.flatMap((g) => g.hits);
  }, [result]);

  const go = (href: string) => {
    if (q.trim().length >= 2) api.post("/api/v1/search/recent", { q: q.trim() }).catch(() => undefined);
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); input()?.blur(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && flat[active]) { e.preventDefault(); go(flat[active].href); }
  };

  const showRecent = open && q.trim() === "" && recent.length > 0;
  const showResults = open && q.trim() !== "";
  let index = -1;
  return (
    <div className={styles.box} ref={box} onKeyDown={onKeyDown} data-testid="global-search-box">
      <Search value={q} onChange={(v: string) => { setQ(v); setOpen(true); }} onFocus={() => { setOpen(true); loadRecent(); }} placeholder={t("search.placeholder")} size="small" data-testid="global-search" />
      {showRecent && (
        <div className={styles.popover} data-testid="search-popover" role="listbox">
          <div className={styles.groupHead}>{t("search.recent")}<button className={styles.clear} onMouseDown={(e) => { e.preventDefault(); api.del("/api/v1/search/recent").then(() => setRecent([])); }}>{t("search.clear")}</button></div>
          {recent.map((r) => <button key={r} className={styles.hit} onMouseDown={(e) => { e.preventDefault(); setQ(r); }} data-testid="search-recent">{r}</button>)}
          <div className={styles.footer}>{t("search.shortcut")}</div>
        </div>
      )}
      {showResults && (
        <div className={styles.popover} data-testid="search-popover" role="listbox">
          {busy && !result && <div className={styles.empty}>{t("search.searching")}</div>}
          {result && result.total === 0 && !busy && <div className={styles.empty} data-testid="search-empty">{t("search.none", { q: q.trim() })}</div>}
          {result && [...result.groups].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)).map((g) => (
            <div key={g.kind} data-testid={`search-group-${g.kind}`}>
              <div className={styles.groupHead}>{t(`search.kind.${g.kind}`)}</div>
              {g.hits.map((h) => {
                index += 1;
                const i = index;
                return (
                  <a key={`${h.kind}-${h.id}`} href={h.href} className={`${styles.hit} ${i === active ? styles.hitActive : ""}`} role="option" aria-selected={i === active} data-testid="search-hit" data-kind={h.kind}
                    onMouseEnter={() => setActive(i)} onClick={(e) => { e.preventDefault(); go(h.href); }}>
                    <span className={styles.hitTitle}><Highlight text={h.title} q={q} /></span>
                    {h.subtitle && <span className={styles.hitSub}>{h.subtitle}</span>}
                    {h.snippet.length > 0 && <span className={styles.snippet}>{h.snippet.map((p, k) => <Fragment key={k}>{p.hit ? <mark>{p.text}</mark> : p.text}</Fragment>)}</span>}
                  </a>
                );
              })}
              {g.more && <div className={styles.more}>{t("search.more")}</div>}
            </div>
          ))}
          <div className={styles.footer}>{t("search.shortcut")}</div>
        </div>
      )}
    </div>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const words = q.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "ig"));
  return <>{parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>))}</>;
}
