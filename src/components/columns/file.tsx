"use client";

import { Icon } from "@vibe/core";
import { Attach, Delete, Download, File as FileIcon, Upload } from "@vibe/icons";
import { useRef, useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { ApiError } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { fileUrl, type FileEntry } from "@/server/columns/file";
import type { CellContext, ColumnUi, EditorProps } from "./types";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

type V = { files: FileEntry[] };

/** Upload one file to the assets API, attached to the file column of the item. Resolves the asset json. */
export async function uploadAsset(file: File, ctx: { itemId: string; columnId: string }): Promise<void> {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("itemId", ctx.itemId);
  fd.set("columnId", ctx.columnId);
  const res = await fetch("/api/v1/assets", { method: "POST", body: fd, credentials: "same-origin" });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new ApiError(j?.error?.message ?? res.statusText, res.status, j?.error?.code ?? "error");
  }
}

function FileEditor({ value, item, column, readOnly, onCancel, anchorEl }: EditorProps<V> & CellContext) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const files = value?.files ?? [];

  const upload = async (list: FileList | File[]) => {
    setBusy(true);
    setErr(null);
    try {
      for (const f of Array.from(list)) await uploadAsset(f, { itemId: item.id, columnId: column.id });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (f: FileEntry) => {
    setErr(null);
    try {
      if (f.assetId) await fetch(`/api/v1/assets/${f.assetId}`, { method: "DELETE", credentials: "same-origin" }).then((r) => { if (!r.ok) throw new Error(r.statusText); });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <div className={pack.listPanel} data-testid="file-editor">
        {files.map((f, i) => (
          <div key={f.assetId ?? i} className={pack.listRow} data-testid="file-row">
            {f.isImage && f.assetId ? <img className={pack.thumb} src={fileUrl(f)} alt="" /> : <Icon icon={FileIcon} size={18} ignoreFocusStyle />}
            <a className={`${pack.listName} ${styles.link}`} href={fileUrl(f)} target="_blank" rel="noopener noreferrer" data-testid="file-link">{f.name}</a>
            <a className={pack.iconBtn} href={f.assetId ? `${fileUrl(f)}?download=1` : fileUrl(f)} aria-label={t("col.file.download")} download><Icon icon={Download} size={16} ignoreFocusStyle /></a>
            {!readOnly ? <button type="button" className={pack.iconBtn} aria-label={t("common.delete")} data-testid="file-remove" onClick={() => void remove(f)}><Icon icon={Delete} size={16} ignoreFocusStyle /></button> : null}
          </div>
        ))}
        {!files.length ? <div className={pack.listRow} style={{ color: "var(--app-text-secondary)" }}>{t("col.file.none")}</div> : null}
      </div>
      {!readOnly ? (
        <>
          <div
            className={`${pack.drop} ${drag ? pack.dropActive : ""}`}
            data-testid="file-drop"
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files); }}
          >
            <Icon icon={Upload} size={18} ignoreFocusStyle /> {busy ? t("common.loading") : t("col.file.drop")}
            <input ref={input} type="file" multiple hidden data-testid="file-input" onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ""; }} />
          </div>
          {err ? <div className={pack.err}>{err}</div> : null}
        </>
      ) : null}
    </Popover>
  );
}

export const fileUi: ColumnUi<V> = {
  align: "left",
  defaultWidth: 150,
  Cell: ({ value }) => {
    const files = value?.files ?? [];
    return (
      <div className={styles.cell}>
        <div className={pack.chips} data-testid="file-chips">
          {files.slice(0, 2).map((f, i) => (
            <span key={f.assetId ?? i} className={`${pack.chip} ${pack.chipFile}`} title={f.name}>
              {f.isImage && f.assetId ? <img className={pack.thumb} src={fileUrl(f)} alt="" /> : <Icon icon={FileIcon} size={14} ignoreFocusStyle />}
              {f.name}
            </span>
          ))}
          {files.length > 2 ? <span className={pack.more}>+{files.length - 2}</span> : null}
          {!files.length ? <span className={styles.emptyPerson}><Icon icon={Attach} size={18} ignoreFocusStyle /></span> : null}
        </div>
      </div>
    );
  },
  Editor: FileEditor,
};
