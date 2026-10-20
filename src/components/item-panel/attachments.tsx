"use client";

import { Icon } from "@vibe/core";
import { Close } from "@vibe/icons";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/client";
import { formatSize, type AssetDto } from "./assets";
import styles from "./item-panel.module.css";

/** Full-screen image preview (Esc or click closes). */
export function Lightbox({ asset, onClose }: { asset: AssetDto; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={styles.lightbox} onClick={onClose} data-testid="lightbox" role="dialog" aria-label={asset.name}>
      <button type="button" className={styles.lightboxClose} onClick={onClose} aria-label={t("panel.close")}><Icon icon={Close} size={24} ignoreFocusStyle /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset.url} alt={asset.name} className={styles.lightboxImg} onClick={(e) => e.stopPropagation()} />
      <div className={styles.lightboxCaption}>{asset.name} ({formatSize(asset.size)}) <a href={`${asset.url}?download=1`} onClick={(e) => e.stopPropagation()}>{t("panel.download")}</a></div>
    </div>,
    document.body,
  );
}

/** Attachments of an update: image thumbnails (lightbox) and file chips. */
export function AttachmentList({ assets, canDelete, onDelete }: { assets: AssetDto[]; canDelete?: (a: AssetDto) => boolean; onDelete?: (a: AssetDto) => void }) {
  const t = useT();
  const [preview, setPreview] = useState<AssetDto | null>(null);
  if (!assets.length) return null;
  return (
    <div className={styles.attachments} data-testid="update-attachments">
      {assets.map((a) => (
        <div key={a.id} className={styles.attachment} data-testid="attachment" data-asset-name={a.name}>
          {a.isImage ? (
            <button type="button" className={styles.thumb} onClick={() => setPreview(a)} title={a.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.url} alt={a.name} />
            </button>
          ) : (
            <a className={styles.chip} href={a.url} target="_blank" rel="noreferrer" title={a.name}>
              <span className={styles.chipName}>{a.name}</span>
              <span className={styles.chipSize}>{formatSize(a.size)}</span>
            </a>
          )}
          {canDelete?.(a) && onDelete ? (
            <button type="button" className={styles.attachDelete} onClick={() => onDelete(a)} aria-label={t("panel.deleteFile")} data-testid="attachment-delete">
              <Icon icon={Close} size={12} ignoreFocusStyle />
            </button>
          ) : null}
        </div>
      ))}
      {preview ? <Lightbox asset={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}
