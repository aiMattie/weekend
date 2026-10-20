"use client";

import { Button } from "@vibe/core";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import s from "@/modules/ai/ai.module.css";

type Status = "new" | "personal" | "saved";
interface Meeting {
  id: string; title: string; startedAt: string | null; attendees: string[]; preview: string; status: Status;
  workspaceId: string | null; boardId: string | null; itemId: string | null; meetingId: string | null; docId: string | null;
}
interface Detail extends Meeting { detail: { summary: string; notes: string; transcript: string; attendees: string[] } }
interface WisprStatus { connected: boolean; label: string | null; lastSyncAt: string | null; lastError: string | null; counts: Record<Status, number> }
interface Option { id: string; name: string; kind?: string; workspaceId?: string | null }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");

/** /meetings: the user's Wispr Flow meetings. Pick where each one goes (workspace, board item) or mark it personal. */
export function MeetingsPage() {
  const t = useT();
  const sp = useSearchParams();
  const [st, setSt] = useState<WisprStatus | null>(null);
  const [tab, setTab] = useState<Status>("new");
  const [list, setList] = useState<Meeting[]>([]);
  const [cur, setCur] = useState<Detail | null>(null);
  const [workspaces, setWorkspaces] = useState<Option[]>([]);
  // fetched lists keyed by their parent, so a stale list never shows for another workspace/board
  const [boardsOf, setBoardsOf] = useState<{ key: string; list: Option[] }>({ key: "", list: [] });
  const [itemsOf, setItemsOf] = useState<{ key: string; list: Option[] }>({ key: "", list: [] });
  const [target, setTarget] = useState({ workspaceId: "", boardId: "", itemId: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(sp.get("wispr") === "error" ? sp.get("reason") ?? t("wispr.error") : "");
  const [msg, setMsg] = useState(sp.get("wispr") === "connected" ? t("wispr.connectedMsg") : "");

  const err = (e: unknown) => setError(e instanceof Error ? e.message : t("wispr.error"));
  const loadStatus = useCallback(() => api.get<WisprStatus>("/api/v1/wispr").then(setSt).catch(err), []); // eslint-disable-line react-hooks/exhaustive-deps
  const loadList = useCallback((which: Status) => api.get<Meeting[]>(`/api/v1/wispr/meetings?status=${which}`).then(setList).catch(err), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadStatus();
    void api.get<Option[]>("/api/v1/workspaces").then(setWorkspaces).catch(() => undefined);
  }, [loadStatus]);
  useEffect(() => { if (st?.connected) void loadList(tab); }, [st?.connected, tab, loadList]);
  useEffect(() => {
    const ws = target.workspaceId;
    if (ws) void api.get<Option[]>(`/api/v1/boards?workspaceId=${ws}`).then((b) => setBoardsOf({ key: ws, list: b.filter((x) => !x.kind || x.kind === "board") })).catch(() => undefined);
  }, [target.workspaceId]);
  useEffect(() => {
    const b = target.boardId;
    if (b) void api.get<Option[]>(`/api/v1/items?boardId=${b}&limit=500`).then((l) => setItemsOf({ key: b, list: l })).catch(() => undefined);
  }, [target.boardId]);
  const boards = boardsOf.key === target.workspaceId ? boardsOf.list : [];
  const items = itemsOf.key === target.boardId ? itemsOf.list : [];

  const sync = async () => {
    setBusy("sync"); setError(""); setMsg("");
    try { const r = await api.post<{ fetched: number; added: number }>("/api/v1/wispr/sync", {}); setMsg(t("wispr.synced", { n: r.added })); await loadStatus(); await loadList(tab); }
    catch (e) { err(e); } finally { setBusy(""); }
  };
  const open = async (m: Meeting) => {
    setBusy("open"); setError(""); setMsg(""); setCur({ ...m, detail: { summary: "", notes: "", transcript: "", attendees: m.attendees } });
    setTarget({ workspaceId: m.workspaceId ?? "", boardId: m.boardId ?? "", itemId: m.itemId ?? "" });
    try { setCur(await api.get<Detail>(`/api/v1/wispr/meetings/${m.id}`)); } catch (e) { err(e); } finally { setBusy(""); }
  };
  const personal = async (flag: boolean) => {
    if (!cur) return;
    try { await api.post(`/api/v1/wispr/meetings/${cur.id}/personal`, { personal: flag }); setCur(null); setMsg(flag ? t("wispr.markedPersonal") : t("wispr.unmarked")); await loadStatus(); await loadList(tab); } catch (e) { err(e); }
  };
  const save = async () => {
    if (!cur || !target.workspaceId) return;
    setBusy("save"); setError(""); setMsg("");
    try {
      const r = await api.post<Meeting>(`/api/v1/wispr/meetings/${cur.id}/save`, { workspaceId: target.workspaceId, boardId: target.boardId || null, itemId: target.itemId || null });
      setCur({ ...cur, ...r }); setMsg(t("wispr.saved")); await loadStatus(); await loadList(tab);
    } catch (e) { err(e); } finally { setBusy(""); }
  };
  const disconnect = async () => { await api.del("/api/v1/wispr"); setCur(null); setList([]); await loadStatus(); };

  if (!st) return <div className={`${s.pageScroll} ${s.ai}`}><div className={s.wrap}><span className={s.muted}>{t("common.loading")}</span></div></div>;

  return (
    <div className={`${s.pageScroll} ${s.ai}`} data-testid="wispr-page">
      <div className={s.wrap}>
        <div className={s.row}>
          <h1 className={s.h1} style={{ flex: 1 }}>{t("wispr.title")}</h1>
          {st.connected ? <>
            <span className={s.muted} data-testid="wispr-account">{t("wispr.linkedAs", { name: st.label ?? "Wispr Flow" })}</span>
            <Button size="small" kind="primary" onClick={() => void sync()} disabled={!!busy} data-testid="wispr-sync">{busy === "sync" ? t("wispr.syncing") : t("wispr.sync")}</Button>
            <Button size="small" kind="tertiary" onClick={() => void disconnect()} data-testid="wispr-disconnect">{t("wispr.disconnect")}</Button>
          </> : null}
        </div>
        <p className={s.sub}>{t("wispr.sub")}</p>
        {error ? <div className={s.err} role="alert" style={{ marginBottom: 12 }} data-testid="wispr-error">{error}</div> : null}
        {msg ? <div className={s.ok} style={{ marginBottom: 12 }} data-testid="wispr-msg">{msg}</div> : null}

        {!st.connected ? (
          <div className={s.panelBox} data-testid="wispr-connect-box">
            <p style={{ marginTop: 0 }}>{t("wispr.connectIntro")}</p>
            {st.lastError ? <p className={s.hint}>{st.lastError}</p> : null}
            <a href="/api/v1/wispr/connect" data-testid="wispr-connect"><Button size="small" kind="primary">{t("wispr.connect")}</Button></a>
          </div>
        ) : (
          <div className={s.split}>
            <div>
              <div className={s.row} role="tablist">
                {(["new", "saved", "personal"] as const).map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${s.pill} ${tab === k ? s.pillBlue : ""}`} style={{ border: 0, cursor: "pointer" }} onClick={() => { setTab(k); setCur(null); }} data-testid={`wispr-tab-${k}`}>
                    {t(`wispr.tab.${k}`)} ({st.counts[k]})
                  </button>
                ))}
              </div>
              <div className={s.list} style={{ marginTop: 10 }} data-testid="wispr-list">
                {list.length ? list.map((m) => (
                  <button key={m.id} type="button" className={`${s.listItem} ${cur?.id === m.id ? s.listOn : ""}`} onClick={() => void open(m)} data-testid="wispr-meeting">
                    <strong>{m.title}</strong><br /><span className={s.muted}>{fmt(m.startedAt)}{m.attendees.length ? ` · ${m.attendees.slice(0, 3).join(", ")}${m.attendees.length > 3 ? " +" + (m.attendees.length - 3) : ""}` : ""}</span>
                  </button>
                )) : <span className={s.muted} data-testid="wispr-empty">{st.lastSyncAt ? t("wispr.empty") : t("wispr.firstSync")}</span>}
              </div>
            </div>
            <div>
              {cur ? (
                <div data-testid="wispr-detail">
                  <h2 style={{ margin: "0 0 4px" }}>{cur.title}</h2>
                  <p className={s.muted} style={{ marginTop: 0 }}>{fmt(cur.startedAt)}{cur.detail.attendees.length ? ` · ${cur.detail.attendees.join(", ")}` : ""}</p>

                  <div className={s.panelBox} data-testid="wispr-target">
                    <div className={s.label} style={{ marginBottom: 8 }}>{cur.status === "saved" ? t("wispr.savedIn") : t("wispr.saveTo")}</div>
                    <div className={s.row}>
                      <select className={s.text} style={{ flex: 1, minWidth: 160 }} value={target.workspaceId} onChange={(e) => setTarget({ workspaceId: e.target.value, boardId: "", itemId: "" })} aria-label={t("wispr.workspace")} data-testid="wispr-workspace">
                        <option value="">{t("wispr.pickWorkspace")}</option>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                      <select className={s.text} style={{ flex: 1, minWidth: 160 }} value={target.boardId} disabled={!target.workspaceId} onChange={(e) => setTarget({ ...target, boardId: e.target.value, itemId: "" })} aria-label={t("wispr.board")} data-testid="wispr-board">
                        <option value="">{t("wispr.noBoard")}</option>{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <select className={s.text} style={{ flex: 1, minWidth: 160 }} value={target.itemId} disabled={!target.boardId} onChange={(e) => setTarget({ ...target, itemId: e.target.value })} aria-label={t("wispr.item")} data-testid="wispr-item">
                        <option value="">{t("wispr.noItem")}</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </div>
                    <p className={s.hint}>{t("wispr.saveHint")}</p>
                    <div className={s.row}>
                      <Button size="small" kind="primary" onClick={() => void save()} disabled={!target.workspaceId || !!busy} data-testid="wispr-save">{busy === "save" ? t("wispr.saving") : cur.status === "saved" ? t("wispr.saveAgain") : t("wispr.save")}</Button>
                      {cur.status === "new" ? <Button size="small" kind="tertiary" onClick={() => void personal(true)} data-testid="wispr-personal">{t("wispr.personal")}</Button> : null}
                      {cur.status === "personal" ? <Button size="small" kind="tertiary" onClick={() => void personal(false)} data-testid="wispr-unpersonal">{t("wispr.notPersonal")}</Button> : null}
                      {cur.docId ? <Link href={`/docs/${cur.docId}`} data-testid="wispr-open-doc">{t("wispr.openDoc")}</Link> : null}
                      {cur.meetingId ? <Link href="/notetaker">{t("wispr.openNotetaker")}</Link> : null}
                    </div>
                  </div>

                  {busy === "open" ? <span className={s.muted}>{t("common.loading")}</span> : <>
                    <div className={s.panelBox}><div className={s.label}>{t("wispr.summary")}</div><p className={s.pre} data-testid="wispr-summary">{cur.detail.summary || cur.preview || "-"}</p></div>
                    {cur.detail.notes ? <div className={s.panelBox}><div className={s.label}>{t("wispr.notes")}</div><p className={s.pre}>{cur.detail.notes}</p></div> : null}
                    {cur.detail.transcript ? <details className={s.panelBox}><summary className={s.label} style={{ cursor: "pointer" }}>{t("wispr.transcript")}</summary><p className={s.pre} style={{ marginTop: 8 }}>{cur.detail.transcript}</p></details> : null}
                  </>}
                </div>
              ) : <span className={s.muted}>{t("wispr.pick")}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
