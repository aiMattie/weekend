"use client";

/** Weekend magic: description -> preview of the board (nothing created) -> confirm -> board built through the services. */
import { Button } from "@vibe/core";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import s from "../ai.module.css";

interface Spec { name: string; description?: string; columns: { title: string; type: string; labels?: string[] }[]; groups: { title: string; items: { name: string }[] }[] }
interface Created { boardId: string; name: string; columns: number; groups: number; items: number }

export function MagicDialog({ onClose, configured }: { onClose: () => void; configured: boolean }) {
  const t = useT();
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [description, setDescription] = useState("");
  const [spec, setSpec] = useState<Spec | null>(null);
  const [busy, setBusy] = useState<"preview" | "create" | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Created | null>(null);
  useEffect(() => { void api.get<{ id: string; name: string }[]>("/api/v1/workspaces").then((w) => { setWorkspaces(w); setWorkspaceId((c) => c || w.find((x) => x.name === "Example")?.id || w[0]?.id || ""); }).catch(() => undefined); }, []);
  const preview = async () => {
    setBusy("preview"); setError("");
    try { setSpec((await api.post<{ spec: Spec }>("/api/v1/ai/magic/preview", { description, workspaceId })).spec); }
    catch (e) { setError(e instanceof Error ? e.message : t("ai.error")); }
    finally { setBusy(null); }
  };
  const create = async () => {
    if (!spec) return;
    setBusy("create"); setError("");
    try { setDone(await api.post<Created>("/api/v1/ai/magic", { workspaceId, spec })); }
    catch (e) { setError(e instanceof Error ? e.message : t("ai.error")); }
    finally { setBusy(null); }
  };
  return (
    <div className={`${s.dlg} ${s.ai}`} role="dialog" aria-modal="true" aria-label={t("ai.magic.title")} data-testid="magic-dialog">
      <div className={s.dlgBox}>
        <h2 className={s.dlgTitle}>{t("ai.magic.title")}</h2>
        <p className={s.sub}>{t("ai.magic.sub")}</p>
        {!configured ? <div className={s.banner} style={{ margin: "0 0 12px" }} data-testid="magic-not-configured"><strong>{t("ai.notConfigured")}</strong>{t("ai.notConfigured.sub")}</div> : null}
        {done ? (
          <div data-testid="magic-done">
            <p className={s.ok}>{t("ai.magic.created", { name: done.name, columns: done.columns, groups: done.groups, items: done.items })}</p>
            <div className={s.rowEnd}><Link href={`/boards/${done.boardId}`} data-testid="magic-open-board" onClick={onClose}><Button size="small" kind="primary">{t("ai.magic.open")}</Button></Link><Button size="small" kind="tertiary" onClick={onClose}>{t("common.close")}</Button></div>
          </div>
        ) : !spec ? (
          <>
            <label className={s.field}><span className={s.label}>{t("ai.magic.describe")}</span>
              <textarea className={s.text} rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("ai.magic.placeholder")} data-testid="magic-description" /></label>
            <label className={s.field}><span className={s.label}>{t("ai.magic.workspace")}</span>
              <select className={s.text} value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} data-testid="magic-workspace">{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
            {error ? <div className={s.err} role="alert" data-testid="magic-error">{error}</div> : null}
            <div className={s.rowEnd} style={{ marginTop: 12 }}>
              <Button size="small" kind="tertiary" onClick={onClose}>{t("common.cancel")}</Button>
              <Button size="small" kind="primary" onClick={() => void preview()} disabled={!configured || description.trim().length < 5 || !workspaceId || busy !== null} data-testid="magic-generate">{busy === "preview" ? t("ai.magic.generating") : t("ai.magic.generate")}</Button>
            </div>
          </>
        ) : (
          <div data-testid="magic-preview">
            <p className={s.hint}>{t("ai.magic.previewHint")}</p>
            <label className={s.field}><span className={s.label}>{t("ai.magic.name")}</span>
              <input className={s.text} value={spec.name} onChange={(e) => setSpec({ ...spec, name: e.target.value })} data-testid="magic-name" /></label>
            <div className={s.outline}>
              <h4>{t("ai.sk.cols")}</h4>
              <div className={s.tags}>{spec.columns.map((c) => <span key={c.title} className={s.tag} data-testid="magic-col">{c.title} ({c.type})</span>)}</div>
              <h4>{t("ai.sk.groups")}</h4>
              {spec.groups.map((g) => <div key={g.title} data-testid="magic-group"><strong>{g.title}</strong> <span className={s.muted}>{g.items.map((i) => i.name).join(", ")}</span></div>)}
            </div>
            {error ? <div className={s.err} role="alert" data-testid="magic-error">{error}</div> : null}
            <div className={s.rowEnd} style={{ marginTop: 12 }}>
              <Button size="small" kind="tertiary" onClick={() => setSpec(null)} data-testid="magic-back">{t("ai.magic.back")}</Button>
              <Button size="small" kind="primary" onClick={() => void create()} disabled={!spec.name.trim() || busy !== null} data-testid="magic-create">{busy === "create" ? t("ai.magic.creating") : t("ai.magic.create")}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
