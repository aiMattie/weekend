"use client";

import { Button } from "@vibe/core";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import s from "../ai.module.css";

interface ActionItem { id: string; text: string; assigneeName?: string | null; assigneeId?: string | null; due?: string | null; status: "proposed" | "created" | "skipped"; itemId?: string | null }
interface Meeting {
  id: string; title: string; heldAt: string; clientName: string | null; workspaceId: string | null; attendees: string[]; transcript?: string; summary: string; decisions: string[];
  actionItems: ActionItem[]; method: "ai" | "fallback"; docId: string | null;
}
interface Option { id: string; name: string; kind?: string }

/** /notetaker: pasted transcript -> summary, decisions, action items; report doc in the klant workspace; tasks after confirmation. */
export function NotetakerPage() {
  const t = useT();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [current, setCurrent] = useState<Meeting | null>(null);
  const [workspaces, setWorkspaces] = useState<Option[]>([]);
  const [boards, setBoards] = useState<Option[]>([]);
  const [form, setForm] = useState({ title: "", clientName: "", workspaceId: "", transcript: "" });
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [taskBoard, setTaskBoard] = useState("");
  const [aiOn, setAiOn] = useState<boolean | null>(null);

  const loadList = useCallback(() => { void api.get<{ meetings: Meeting[] }>("/api/v1/ai/notetaker/meetings").then((r) => setMeetings(r.meetings)).catch(() => undefined); }, []);
  useEffect(() => {
    loadList();
    void api.get<Option[]>("/api/v1/workspaces").then(setWorkspaces).catch(() => undefined);
    void api.get<Option[]>("/api/v1/boards").then((b) => { const l = b.filter((x) => !x.kind || x.kind === "board"); setBoards(l); setTaskBoard((c) => c || l.find((x) => /taken/i.test(x.name))?.id || l[0]?.id || ""); }).catch(() => undefined);
    void api.get<{ configured: boolean; enabled: boolean }>("/api/v1/ai/status").then((x) => setAiOn(x.configured && x.enabled)).catch(() => undefined);
  }, [loadList]);

  const open = async (id: string) => { const m = await api.get<Meeting>(`/api/v1/ai/notetaker/meetings/${id}`); setCurrent(m); setCreating(false); setMsg(""); setError(""); setPicked(m.actionItems.filter((a) => a.status === "proposed").map((a) => a.id)); };
  const process = async () => {
    setBusy(true); setError("");
    try {
      const m = await api.post<Meeting>("/api/v1/ai/notetaker/meetings", { title: form.title, transcript: form.transcript, clientName: form.clientName || undefined, workspaceId: form.workspaceId || undefined });
      setForm({ title: "", clientName: "", workspaceId: "", transcript: "" }); loadList(); await open(m.id);
    } catch (e) { setError(e instanceof Error ? e.message : t("ai.error")); } finally { setBusy(false); }
  };
  const saveWs = async (workspaceId: string) => { if (!current) return; setCurrent(await api.patch<Meeting>(`/api/v1/ai/notetaker/meetings/${current.id}`, { workspaceId: workspaceId || null })); };
  const report = async () => {
    if (!current) return;
    setError(""); setMsg("");
    try { const r = await api.post<{ docId: string }>(`/api/v1/ai/notetaker/meetings/${current.id}/report`, {}); setMsg(t("ai.nt.reportDone")); setCurrent({ ...current, docId: r.docId }); }
    catch (e) { setError(e instanceof Error ? e.message : t("ai.error")); }
  };
  const tasks = async () => {
    if (!current) return;
    setError(""); setMsg("");
    try { const r = await api.post<{ created: unknown[] }>(`/api/v1/ai/notetaker/meetings/${current.id}/tasks`, { actionIds: picked, boardId: taskBoard }); await open(current.id); setMsg(t("ai.nt.tasksDone", { n: r.created.length })); loadList(); }
    catch (e) { setError(e instanceof Error ? e.message : t("ai.error")); }
  };
  const del = async () => { if (!current) return; await api.del(`/api/v1/ai/notetaker/meetings/${current.id}`); setCurrent(null); loadList(); };
  const reprocess = async () => { if (!current) return; setBusy(true); try { setCurrent(await api.post<Meeting>(`/api/v1/ai/notetaker/meetings/${current.id}/reprocess`, {})); } catch (e) { setError(e instanceof Error ? e.message : t("ai.error")); } finally { setBusy(false); } };

  return (
    <div className={`${s.pageScroll} ${s.ai}`} data-testid="notetaker-page">
      <div className={s.wrap}>
        <h1 className={s.h1}>{t("ai.nt.title")}</h1>
        <p className={s.sub}>{t("ai.nt.sub")}</p>
        {aiOn === false ? <div className={s.banner} style={{ margin: "0 0 16px" }} data-testid="ai-not-configured"><strong>{t("ai.notConfigured")}</strong>{t("ai.nt.method.fallback")}</div> : null}
        <div className={s.split}>
          <div>
            <Button size="small" kind="primary" onClick={() => { setCreating(true); setCurrent(null); }} data-testid="nt-new">{t("ai.nt.new")}</Button>
            <div className={s.sideSep} style={{ paddingLeft: 0 }}>{t("ai.nt.list")}</div>
            <div className={s.list} data-testid="nt-list">
              {meetings.length ? meetings.map((m) => <button key={m.id} type="button" className={`${s.listItem} ${current?.id === m.id ? s.listOn : ""}`} onClick={() => void open(m.id)} data-testid="nt-meeting"><strong>{m.title}</strong><br /><span className={s.muted}>{m.heldAt.slice(0, 10)}{m.clientName ? ` · ${m.clientName}` : ""}</span></button>) : <span className={s.muted} data-testid="nt-empty">{t("ai.nt.empty")}</span>}
            </div>
          </div>
          <div>
            {creating || (!current && !meetings.length) ? (
              <div className={s.panelBox} data-testid="nt-form">
                <label className={s.field}><span className={s.label}>{t("ai.nt.meetingTitle")}</span><input className={s.text} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="nt-title" /></label>
                <div className={s.row}>
                  <label className={s.field} style={{ flex: 1, minWidth: 180 }}><span className={s.label}>{t("ai.nt.client")}</span><input className={s.text} value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} data-testid="nt-client" /></label>
                  <label className={s.field} style={{ flex: 1, minWidth: 180 }}><span className={s.label}>{t("ai.nt.workspace")}</span>
                    <select className={s.text} value={form.workspaceId} onChange={(e) => setForm({ ...form, workspaceId: e.target.value })} data-testid="nt-workspace"><option value="">{t("ai.nt.noWorkspace")}</option>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
                </div>
                <label className={s.field}><span className={s.label}>{t("ai.nt.transcript")}</span><textarea className={s.text} rows={10} value={form.transcript} onChange={(e) => setForm({ ...form, transcript: e.target.value })} placeholder={t("ai.nt.transcriptPh")} data-testid="nt-transcript" /></label>
                {error ? <div className={s.err} role="alert" data-testid="nt-error">{error}</div> : null}
                <div className={s.rowEnd}><Button size="small" kind="primary" onClick={() => void process()} disabled={busy || !form.title.trim() || form.transcript.trim().length < 10} data-testid="nt-process">{busy ? t("ai.nt.processing") : t("ai.nt.process")}</Button></div>
              </div>
            ) : current ? (
              <div data-testid="nt-detail">
                <div className={s.row} style={{ marginBottom: 8 }}>
                  <h2 style={{ margin: 0, flex: 1 }} data-testid="nt-detail-title">{current.title}</h2>
                  <span className={`${s.pill} ${current.method === "ai" ? s.pillBlue : s.pillOrange}`} data-testid="nt-method">{t(`ai.nt.method.${current.method}`)}</span>
                </div>
                <div className={s.panelBox}><div className={s.label}>{t("ai.nt.summary")}</div><p className={s.pre} data-testid="nt-summary">{current.summary}</p></div>
                <div className={s.panelBox}><div className={s.label}>{t("ai.nt.decisions")}</div>
                  {current.decisions.length ? <ul data-testid="nt-decisions">{current.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul> : <span className={s.muted}>{t("ai.nt.noDecisions")}</span>}</div>
                <div className={s.panelBox}><div className={s.label}>{t("ai.nt.actions")}</div>
                  {current.actionItems.length ? (
                    <table className={s.table} data-testid="nt-actions"><tbody>
                      {current.actionItems.map((a) => (
                        <tr key={a.id} data-testid="nt-action" data-status={a.status}>
                          <td style={{ width: 28 }}><input type="checkbox" disabled={a.status === "created"} checked={a.status === "created" || picked.includes(a.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, a.id] : picked.filter((x) => x !== a.id))} aria-label={a.text} data-testid="nt-action-check" /></td>
                          <td>{a.text}{a.status === "created" ? <span className={s.ok}> · {t("ai.nt.created")}</span> : null}</td>
                          <td className={s.muted}>{a.assigneeName ?? ""}</td><td className={s.muted}>{a.due ?? ""}</td>
                        </tr>
                      ))}
                    </tbody></table>
                  ) : <span className={s.muted}>{t("ai.nt.noActions")}</span>}
                  <div className={s.row} style={{ marginTop: 12 }}>
                    <select className={s.text} style={{ width: 240 }} value={taskBoard} onChange={(e) => setTaskBoard(e.target.value)} aria-label={t("ai.nt.taskBoard")} data-testid="nt-task-board">{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                    <Button size="small" kind="primary" onClick={() => void tasks()} disabled={!picked.length || !taskBoard} data-testid="nt-create-tasks">{t("ai.nt.tasks")}</Button>
                  </div>
                </div>
                <div className={s.panelBox}>
                  <div className={s.row}>
                    <select className={s.text} style={{ width: 260 }} value={current.workspaceId ?? ""} onChange={(e) => void saveWs(e.target.value)} aria-label={t("ai.nt.workspace")} data-testid="nt-detail-workspace"><option value="">{t("ai.nt.noWorkspace")}</option>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
                    <Button size="small" kind="secondary" onClick={() => void report()} disabled={!current.workspaceId} data-testid="nt-report">{t("ai.nt.report")}</Button>
                    {current.docId ? <Link href={`/docs/${current.docId}`} data-testid="nt-open-doc">{t("ai.nt.openDoc")}</Link> : null}
                  </div>
                  {!current.workspaceId ? <p className={s.hint} style={{ marginTop: 6 }}>{t("ai.nt.pickWorkspace")}</p> : null}
                </div>
                {msg ? <div className={s.ok} data-testid="nt-msg">{msg}</div> : null}
                {error ? <div className={s.err} role="alert" data-testid="nt-error">{error}</div> : null}
                <div className={s.row} style={{ marginTop: 12 }}>
                  <Button size="small" kind="tertiary" onClick={() => void reprocess()} disabled={busy}>{t("ai.nt.reprocess")}</Button>
                  <Button size="small" kind="tertiary" color="negative" onClick={() => void del()} data-testid="nt-delete">{t("ai.nt.delete")}</Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
