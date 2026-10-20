"use client";

import { Icon } from "@vibe/core";
import { Delete, Download, Upload } from "@vibe/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/columns/shared";
import { useCurrentUser } from "@/components/shell/user-context";
import { api } from "@/lib/api-client";
import { useLocale, useT } from "@/lib/i18n/client";
import { Lightbox } from "./attachments";
import { filesFrom, formatSize, uploadAsset, type AssetDto } from "./assets";
import type { PanelTabProps } from "./tabs";
import styles from "./item-panel.module.css";

/** Files of an item: everything in the assets store for this item (also files attached to updates). */
export function FilesTab({ board, item, canEdit, refreshKey }: PanelTabProps) {
  const t = useT();
  const locale = useLocale();
  const me = useCurrentUser();
  const [assets, setAssets] = useState<AssetDto[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<AssetDto | null>(null);
  const [grid, setGrid] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<AssetDto[]>(`/api/v1/assets?itemId=${item.id}`);
      setAssets(Array.isArray(r) ? r : []);
    } catch {
      setAssets((cur) => cur ?? []);
    }
  }, [item.id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load, refreshKey]);

  const upload = async (files: File[]) => {
    if (!files.length || !canEdit) return;
    setBusy(true);
    setError(null);
    const failed: string[] = [];
    for (const f of files) {
      try { await uploadAsset(f, { boardId: board.board.id, itemId: item.id }); } catch (e) { failed.push(e instanceof Error ? e.message : f.name); }
    }
    if (failed.length) setError(failed.join("; "));
    setBusy(false);
    await load();
  };

  const remove = async (a: AssetDto) => {
    if (!window.confirm(t("panel.deleteFileConfirm", { name: a.name }))) return;
    await api.del(`/api/v1/assets/${a.id}`);
    await load();
  };

  const when = (iso: string) => new Date(iso).toLocaleString(locale === "nl" ? "nl-NL" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const uploader = (a: AssetDto) => (a.uploadedBy ? board.users.find((u) => u.id === a.uploadedBy) : undefined);
  const mayDelete = (a: AssetDto) => canEdit && (me.role === "admin" || !a.uploadedBy || a.uploadedBy === me.id);

  return (
    <div
      className={`${styles.tabBody} ${drag ? styles.dropActive : ""}`}
      data-testid="files-tab"
      onDragOver={(e) => { if (canEdit && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { setDrag(false); if (canEdit) { e.preventDefault(); void upload(filesFrom(e.dataTransfer.files)); } }}
    >
      <div className={styles.filesHead}>
        {canEdit ? (
          <button type="button" className={styles.uploadBtn} onClick={() => input.current?.click()} disabled={busy} data-testid="files-upload">
            <Icon icon={Upload} size={16} ignoreFocusStyle /> {busy ? t("common.loading") : t("panel.uploadFiles")}
          </button>
        ) : null}
        <input ref={input} type="file" multiple hidden data-testid="files-input" onChange={(e) => { void upload(filesFrom(e.target.files)); e.target.value = ""; }} />
        <span className={styles.spacer} />
        <button type="button" className={styles.linkBtn} onClick={() => setGrid((g) => !g)} data-testid="files-view-toggle">{grid ? t("panel.listView") : t("panel.gridView")}</button>
      </div>
      {error ? <div className={styles.errorLine} role="alert">{error}</div> : null}
      {assets && assets.length === 0 ? <div className={styles.empty} data-testid="files-empty">{canEdit ? t("panel.noFilesDrop") : t("panel.noFiles")}</div> : null}
      <div className={grid ? styles.fileGrid : styles.fileList}>
        {assets?.map((a) => {
          const up = uploader(a);
          return (
            <div key={a.id} className={grid ? styles.fileTile : styles.fileRow} data-testid="file-row" data-asset-name={a.name}>
              {a.isImage ? (
                <button type="button" className={styles.fileThumb} onClick={() => setPreview(a)} aria-label={t("panel.preview")} data-testid="file-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt={a.name} />
                </button>
              ) : <span className={styles.fileIcon}>{(a.name.split(".").pop() ?? "").slice(0, 4).toUpperCase() || "FILE"}</span>}
              <div className={styles.fileMeta}>
                <a className={styles.fileName} href={a.url} target="_blank" rel="noreferrer" data-testid="file-name">{a.name}</a>
                <span className={styles.fileSub}>{formatSize(a.size)} · {when(a.createdAt)}{up ? <> · <UserAvatar user={up} size="xs" /> {up.name}</> : null}{a.updateId ? ` · ${t("panel.inUpdate")}` : ""}</span>
              </div>
              <a className={styles.iconBtn} href={`${a.url}?download=1`} aria-label={t("panel.download")} title={t("panel.download")} data-testid="file-download"><Icon icon={Download} size={16} ignoreFocusStyle /></a>
              {mayDelete(a) ? <button type="button" className={styles.iconBtn} onClick={() => void remove(a)} aria-label={t("panel.deleteFile")} title={t("panel.deleteFile")} data-testid="file-delete"><Icon icon={Delete} size={16} ignoreFocusStyle /></button> : null}
            </div>
          );
        })}
      </div>
      {preview ? <Lightbox asset={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
