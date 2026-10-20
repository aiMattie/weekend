"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { LocationPicker, useNav } from "./board-dialogs";
import { ChromeModal } from "./modal";
import { notifyNavChanged } from "./ops";
import styles from "./chrome.module.css";

interface TemplateInfo { id: string; name: string; description: string; category: string; icon?: string; columns: string[]; groups: string[] }
type Visibility = "public" | "share" | "private";
const CATEGORIES = ["all", "general", "projects", "tasks", "sales", "it", "marketing", "hr", "delivery"];

/** "Add board": name, type (main / shareable / private), template, location. */
export function AddBoardDialog({ workspaceId, folderId, onClose, onCreated }: { workspaceId?: string; folderId?: string | null; onClose: () => void; onCreated: (boardId: string) => void }) {
  const t = useT();
  const nav = useNav();
  const [name, setName] = useState(t("shell.newBoardName"));
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [templateId, setTemplateId] = useState("blank");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [loc, setLoc] = useState<{ ws: string; folder: string | null }>({ ws: workspaceId ?? "", folder: folderId ?? null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<TemplateInfo[]>("/api/v1/board-templates").then((l) => alive && setTemplates(l)).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const ws = loc.ws || nav?.workspaces[0]?.id || "";

  const shown = useMemo(() => templates.filter((x) => (cat === "all" || x.category === cat) && (!q.trim() || `${x.name} ${x.description}`.toLowerCase().includes(q.trim().toLowerCase()))), [templates, cat, q]);
  const selected = templates.find((x) => x.id === templateId);
  const cats = CATEGORIES.filter((c) => c === "all" || templates.some((x) => x.category === c));

  const submit = async () => {
    if (!name.trim() || !ws) return;
    setBusy(true);
    try {
      const b = await api.post<{ id: string }>("/api/v1/boards/from-template", { templateId, workspaceId: ws, folderId: loc.folder, name: name.trim(), visibility });
      notifyNavChanged();
      onCreated(b.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
      setBusy(false);
    }
  };

  const card = (v: Visibility, title: string, text: string) => (
    <button key={v} type="button" className={`${styles.card} ${visibility === v ? styles.cardOn : ""}`} onClick={() => setVisibility(v)} data-testid={`visibility-${v}`} aria-pressed={visibility === v}>
      <div className={styles.cardTitle}>{title}</div>
      <div className={styles.cardText}>{text}</div>
    </button>
  );

  return (
    <ChromeModal id="add-board-dialog" title={t("shell.addBoard")} size="large" onClose={onClose} error={error} primary={{ text: t("chrome.createBoard"), onClick: () => void submit(), disabled: busy || !name.trim() || !ws, testId: "add-board-submit" }}>
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>{t("chrome.boardName")}</span>
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} data-testid="add-board-name" />
        </label>
        <div className={styles.field}>
          <span className={styles.label}>{t("chrome.boardType")}</span>
          <div className={styles.cards}>
            {card("public", t("chrome.typeMain"), t("chrome.typeMainText"))}
            {card("share", t("chrome.typeShare"), t("chrome.typeShareText"))}
            {card("private", t("chrome.typePrivate"), t("chrome.typePrivateText"))}
          </div>
        </div>
        <div className={styles.field}>
          <span className={styles.label}>{t("chrome.template")}</span>
          <div className={styles.row}>
            <input className={styles.input} placeholder={t("chrome.searchTemplates")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="template-search" style={{ flex: "0 0 220px" }} />
            <div className={styles.chips} style={{ flex: 1 }}>
              {cats.map((c) => (
                <button key={c} type="button" className={`${styles.chip} ${cat === c ? styles.chipOn : ""}`} onClick={() => setCat(c)} data-testid={`template-cat-${c}`}>{t(`chrome.cat.${c}`)}</button>
              ))}
            </div>
          </div>
          <div className={styles.tplLayout}>
            <div className={styles.tplGrid} data-testid="template-grid">
              {shown.map((x) => (
                <button key={x.id} type="button" className={`${styles.card} ${templateId === x.id ? styles.cardOn : ""}`} onClick={() => setTemplateId(x.id)} data-testid={`template-${x.id}`} aria-pressed={templateId === x.id}>
                  <div className={styles.cardTitle}>{x.name}</div>
                  <div className={styles.cardText}>{x.description}</div>
                </button>
              ))}
              {shown.length === 0 ? <div className={styles.hint}>{t("chrome.noTemplates")}</div> : null}
            </div>
            <div className={styles.preview} data-testid="template-preview">
              {selected ? (
                <>
                  <div className={styles.previewTitle}>{selected.name}</div>
                  <div><div className={styles.label}>{t("chrome.previewGroups")}</div>{selected.groups.map((g) => <span key={g} className={styles.pill}>{g}</span>)}</div>
                  <div><div className={styles.label}>{t("chrome.previewColumns")}</div>{selected.columns.map((c) => <span key={c} className={styles.pill}>{c}</span>)}</div>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <LocationPicker nav={nav} workspaceId={ws} folderId={loc.folder} onChange={(w, f) => setLoc({ ws: w, folder: f })} idPrefix="add-board" />
      </div>
    </ChromeModal>
  );
}
