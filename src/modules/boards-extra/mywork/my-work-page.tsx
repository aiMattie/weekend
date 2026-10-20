"use client";

import { Checkbox, Search } from "@vibe/core";
import { DropdownChevronDown, DropdownChevronRight } from "@vibe/icons";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { UserAvatar } from "@/components/columns/shared";
import { api } from "@/lib/api-client";
import { contrastText } from "@/lib/colors";
import { useT } from "@/lib/i18n/client";
import { usePersistentState } from "@/lib/use-persistent-state";
import type { MyWorkResult, MyWorkRow } from "@/server/services/my-work";
import type { Bucket } from "./buckets";
import styles from "./mywork.module.css";

const BAR: Record<Bucket, string> = { overdue: "#df2f4a", today: "#00c875", this_week: "#579bfc", next_week: "#a25ddc", later: "#fdab3d", no_date: "#c4c4c4" };

const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });

function StatusCell({ row, onPick }: { row: MyWorkRow; onPick: (labelId: number) => void }) {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const st = row.status;
  if (!st) return <span style={{ color: "#999", fontSize: 13 }}>{t("mywork.noStatus")}</span>;
  const bg = st.text ? st.color : "#c4c4c4";
  return (
    <>
      <button type="button" className={styles.status} style={{ background: bg, color: contrastText(bg) }} data-testid="mywork-status" onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}>
        {st.text || " "}
      </button>
      {anchor && (
        <Popover anchorEl={anchor} onClose={() => setAnchor(null)}>
          <div className={styles.statusMenu} data-testid="mywork-status-menu">
            {st.labels.map((l) => (
              <button key={l.id} type="button" className={styles.statusOpt} style={{ background: l.color, color: contrastText(l.color) }} data-testid="mywork-status-option" data-label={l.text} onClick={() => { setAnchor(null); onPick(l.id); }}>
                {l.text}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

export function MyWorkPage() {
  const t = useT();
  const [data, setData] = useState<MyWorkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [boardId, setBoardId] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [includeTeams, setIncludeTeams] = useState(true);
  const [collapsedRaw, setCollapsedRaw] = usePersistentState("weekend.mywork.collapsed", "");
  const collapsed = new Set(collapsedRaw.split(",").filter(Boolean));
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    const p = new URLSearchParams();
    if (search.trim()) p.set("search", search.trim());
    if (boardId) p.set("boardIds", boardId);
    if (showDone) p.set("showDone", "true");
    if (!includeTeams) p.set("includeTeams", "false");
    try {
      const r = await api.get<MyWorkResult>(`/api/v1/my-work?${p}`);
      if (my === seq.current) { setData(r); setError(null); }
    } catch (e) {
      if (my === seq.current) setError(e instanceof Error ? e.message : t("common.error"));
    }
  }, [search, boardId, showDone, includeTeams, t]);

  useEffect(() => {
    const id = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, search]);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const iv = setInterval(load, 30_000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(iv); };
  }, [load]);

  const changeStatus = async (row: MyWorkRow, labelId: number) => {
    if (!row.status) return;
    try {
      await api.put(`/api/v1/items/${row.itemId}/values/${row.status.columnId}`, { value: { index: labelId } });
    } catch {
      setError(t("mywork.statusFailed"));
    }
    await load();
  };
  const toggle = (b: Bucket) => {
    const s = new Set(collapsed);
    if (s.has(b)) s.delete(b); else s.add(b);
    setCollapsedRaw([...s].join(","));
  };
  const users = new Map((data?.users ?? []).map((u) => [u.id, u]));
  const hasFilters = !!(search || boardId || showDone);

  return (
    <div className={styles.page} data-testid="my-work-page">
      <h1 className={styles.title}>{t("mywork.title")}</h1>
      <p className={styles.sub}>{t("mywork.subtitle")}</p>
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search value={search} onChange={(v: string) => setSearch(v)} placeholder={t("mywork.search")} size="small" data-testid="mywork-search" />
        </div>
        <select className={styles.select} value={boardId} onChange={(e) => setBoardId(e.target.value)} aria-label={t("mywork.col.board")} data-testid="mywork-board-filter">
          <option value="">{t("mywork.allBoards")}</option>
          {(data?.boards ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <Checkbox label={t("mywork.showDone")} checked={showDone} onChange={() => setShowDone(!showDone)} data-testid="mywork-show-done" />
        <Checkbox label={t("mywork.includeTeams")} checked={includeTeams} onChange={() => setIncludeTeams(!includeTeams)} data-testid="mywork-include-teams" />
      </div>
      {error && <div role="alert" style={{ color: "#df2f4a", marginBottom: 12 }}>{error}</div>}
      {data && data.total === 0 && !hasFilters ? (
        <div className={styles.emptyAll} data-testid="mywork-empty">{t("mywork.emptyAll")}</div>
      ) : (
        data?.sections.map((s) => {
          const open = !collapsed.has(s.bucket);
          return (
            <section key={s.bucket} className={styles.section} data-testid={`mywork-section-${s.bucket}`}>
              <button type="button" className={styles.sectionHead} style={{ color: BAR[s.bucket] === "#c4c4c4" ? "#676879" : BAR[s.bucket] }} onClick={() => toggle(s.bucket)} aria-expanded={open} data-testid={`mywork-toggle-${s.bucket}`}>
                {open ? <DropdownChevronDown size={20} /> : <DropdownChevronRight size={20} />}
                {t(`mywork.section.${s.bucket}`)}
                <span className={styles.sectionCount} data-testid={`mywork-count-${s.bucket}`}>{s.rows.length}</span>
              </button>
              {open && (s.rows.length === 0 ? (
                <div className={styles.empty}>{t("mywork.empty")}</div>
              ) : (
                <div className={styles.table} style={{ ["--bar" as string]: BAR[s.bucket] }}>
                  <div className={`${styles.row} ${styles.head}`}>
                    <div className={styles.cell}>{t("mywork.col.item")}</div>
                    <div className={styles.cell}>{t("mywork.col.board")}</div>
                    <div className={styles.cell}>{t("mywork.col.status")}</div>
                    <div className={styles.cell}>{t("mywork.col.due")}</div>
                    <div className={styles.cell}>{t("mywork.col.people")}</div>
                  </div>
                  {s.rows.map((r) => (
                    <div key={r.itemId} className={styles.row} data-testid="mywork-row" data-item-id={r.itemId} data-item-name={r.name}>
                      <div className={styles.cell}>
                        <Link href={`/boards/${r.boardId}?item=${r.parentItemId ?? r.itemId}`} className={styles.itemLink}>{r.name}</Link>
                        {r.parentName && <span className={styles.parent}>{t("mywork.subitemOf", { name: r.parentName })}</span>}
                      </div>
                      <div className={styles.cell}><Link href={`/boards/${r.boardId}`} className={styles.boardLink}>{r.boardName}</Link></div>
                      <div className={styles.cell} style={{ padding: 0 }}><StatusCell row={r} onPick={(id) => changeStatus(r, id)} /></div>
                      <div className={styles.cell}>
                        {r.dueDate ? <span className={`${styles.due} ${s.bucket === "overdue" ? styles.dueOverdue : ""}`} title={r.dueColumnTitle ?? undefined}>{fmtDate(r.dueDate)}</span> : null}
                      </div>
                      <div className={styles.cell}>
                        <div className={styles.avatars}>
                          {r.peopleIds.slice(0, 4).map((id) => users.get(id)).filter(Boolean).map((u) => <UserAvatar key={u!.id} user={u!} size="xs" />)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}
