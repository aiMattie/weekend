"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { WEEKEND_COLORS } from "@/lib/colors";
import { useT } from "@/lib/i18n/client";
import { ChromeModal } from "./modal";
import { notifyNavChanged } from "./ops";
import styles from "./chrome.module.css";

interface WorkspaceFull { id: string; name: string; description: string | null; kind: "open" | "closed"; color: string | null }

/** Create (no `workspaceId`) or edit a workspace. */
export function WorkspaceDialog({ workspaceId, onClose, onSaved }: { workspaceId?: string; onClose: () => void; onSaved: (id: string, created: boolean) => void }) {
  const t = useT();
  const [form, setForm] = useState<{ name: string; description: string; kind: "open" | "closed"; color: string }>({ name: workspaceId ? "" : t("shell.newWorkspaceName"), description: "", kind: "open", color: "#0073ea" });
  const [loaded, setLoaded] = useState(!workspaceId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    api.get<WorkspaceFull>(`/api/v1/workspaces/${workspaceId}`).then((w) => {
      if (!alive) return;
      setForm({ name: w.name, description: w.description ?? "", kind: w.kind, color: w.color ?? "#0073ea" });
      setLoaded(true);
    }).catch((e) => setError(e instanceof Error ? e.message : t("common.error")));
    return () => { alive = false; };
  }, [workspaceId, t]);

  const submit = async () => {
    if (!form.name.trim()) return;
    try {
      const body = { name: form.name.trim(), description: form.description.trim() || null, kind: form.kind, color: form.color };
      const w = workspaceId ? await api.patch<WorkspaceFull>(`/api/v1/workspaces/${workspaceId}`, body) : await api.post<WorkspaceFull>("/api/v1/workspaces", body);
      notifyNavChanged();
      onSaved(w.id, !workspaceId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  };
  return (
    <ChromeModal id="workspace-dialog" title={workspaceId ? t("chrome.editWorkspace") : t("shell.addWorkspace")} onClose={onClose} error={error} primary={{ text: t("common.save"), onClick: () => void submit(), disabled: !loaded || !form.name.trim(), testId: "workspace-submit" }}>
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>{t("chrome.name")}</span>
          <input className={styles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus data-testid="workspace-name" />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t("chrome.description")}</span>
          <textarea className={styles.textarea} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="workspace-description" />
        </label>
        <div className={styles.radioList}>
          {(["open", "closed"] as const).map((k) => (
            <label key={k} className={`${styles.radio} ${form.kind === k ? styles.radioOn : ""}`}>
              <input type="radio" name="ws-kind" checked={form.kind === k} onChange={() => setForm({ ...form, kind: k })} data-testid={`workspace-kind-${k}`} />
              <span><span className={styles.radioTitle}>{t(`chrome.ws.${k}`)}</span><br /><span className={styles.hint}>{t(`chrome.ws.${k}Hint`)}</span></span>
            </label>
          ))}
        </div>
        <div className={styles.field}>
          <span className={styles.label}>{t("chrome.color")}</span>
          <ColorChoice value={form.color} onChange={(c) => setForm({ ...form, color: c })} />
        </div>
      </div>
    </ChromeModal>
  );
}

export function ColorChoice({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className={styles.colors}>
      {WEEKEND_COLORS.map((c) => (
        <button key={c.hex} type="button" aria-label={c.name} className={`${styles.colorDot} ${value === c.hex ? styles.colorOn : ""}`} style={{ background: c.hex }} onClick={() => onChange(c.hex)} />
      ))}
    </div>
  );
}

/** Create (`folderId` empty) or edit a folder. */
export function FolderDialog({ workspaceId, parentFolderId, folder, onClose, onSaved }: { workspaceId: string; parentFolderId?: string | null; folder?: { id: string; name: string; color?: string | null }; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [name, setName] = useState(folder?.name ?? t("shell.newFolderName"));
  const [color, setColor] = useState(folder?.color ?? "#579bfc");
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!name.trim()) return;
    try {
      if (folder) await api.patch(`/api/v1/folders/${folder.id}`, { name: name.trim(), color });
      else await api.post("/api/v1/folders", { workspaceId, name: name.trim(), color, parentFolderId: parentFolderId ?? null });
      notifyNavChanged();
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.error"));
    }
  };
  return (
    <ChromeModal id="folder-dialog" title={folder ? t("chrome.editFolder") : t("shell.addFolder")} onClose={onClose} error={error} primary={{ text: t("common.save"), onClick: () => void submit(), disabled: !name.trim(), testId: "folder-submit" }}>
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>{t("chrome.name")}</span>
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} data-testid="folder-name" />
        </label>
        <div className={styles.field}>
          <span className={styles.label}>{t("chrome.color")}</span>
          <ColorChoice value={color} onChange={setColor} />
        </div>
      </div>
    </ChromeModal>
  );
}
