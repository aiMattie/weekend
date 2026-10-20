"use client";

import { Button } from "@vibe/core";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { AgentDto, CatalogEntry } from "./types";
import s from "../ai.module.css";

/** Create an agent from a ready-made template; asks for the board when the template works on one. */
export function InstallDialog({ entry, onClose, onDone }: { entry: CatalogEntry; onClose: () => void; onDone: (agentId: string) => void }) {
  const t = useT();
  const [boards, setBoards] = useState<{ id: string; name: string; kind?: string }[]>([]);
  const [boardId, setBoardId] = useState("");
  const [activate, setActivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!entry.needsBoard) return;
    void api.get<{ id: string; name: string; kind?: string }[]>("/api/v1/boards").then((b) => {
      const wantSprints = entry.key === "sprint_reporter";
      const list = b.filter((x) => (wantSprints ? x.kind === "dev_sprints" : !x.kind || x.kind === "board"));
      setBoards(list);
      const hint = entry.boardHint?.toLowerCase() ?? "";
      setBoardId((list.find((x) => x.name.toLowerCase().includes(hint)) ?? list[0])?.id ?? "");
    });
  }, [entry]);
  const go = async () => {
    setBusy(true); setError("");
    try { const a = await api.post<AgentDto>("/api/v1/ai/agents/catalog", { templateKey: entry.key, boardId: entry.needsBoard ? boardId : undefined, activate }); onDone(a.id); }
    catch (e) { setError(e instanceof Error ? e.message : t("ai.error")); setBusy(false); }
  };
  return (
    <div className={`${s.dlg} ${s.ai}`} role="dialog" aria-modal="true" aria-label={entry.name} data-testid="install-dialog">
      <div className={s.dlgBox}>
        <h2 className={s.dlgTitle}>{entry.name}</h2>
        {entry.needsBoard ? (
          <label className={s.field} style={{ marginTop: 12 }}><span className={s.label}>{t("ai.ag.pickBoard")}</span>
            <select className={s.text} value={boardId} onChange={(e) => setBoardId(e.target.value)} data-testid="install-board">{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            <span className={s.hint}>{entry.boardAccess === "write" ? t("ai.ag.know.write") : t("ai.ag.know.read")}</span></label>
        ) : null}
        <label className={s.row} style={{ marginBottom: 12 }}><input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} data-testid="install-activate" /> {t("ai.ag.activate")}</label>
        {error ? <div className={s.err} role="alert">{error}</div> : null}
        <div className={s.rowEnd}>
          <Button size="small" kind="tertiary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button size="small" kind="primary" onClick={() => void go()} disabled={busy || (entry.needsBoard && !boardId)} data-testid="install-submit">{t("ai.ag.install")}</Button>
        </div>
      </div>
    </div>
  );
}
