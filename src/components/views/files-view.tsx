"use client";
/* eslint-disable @next/next/no-img-element -- user uploads served from /api/v1/assets, not optimizable */

import { Icon } from "@vibe/core";
import { File as FileIcon } from "@vibe/icons";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { AssetDto } from "@/server/services/assets";
import { useViewSettings } from "@/modules/views/ui/use-view-settings";
import { ViewFrame } from "@/modules/views/ui/view-frame";
import styles from "@/modules/views/ui/files.module.css";
import frame from "@/modules/views/ui/views.module.css";
import type { ViewProps } from "./types";

type Kind = "all" | "images" | "documents";
const sizeText = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Every file uploaded on this board (file columns, updates, item panel) as a gallery. */
export function FilesView(props: ViewProps) {
  const { board, view, actions, onOpenItem, canEditStructure } = props;
  const t = useT();
  const { settings, patch } = useViewSettings(view, actions, canEditStructure);
  const [files, setFiles] = useState<AssetDto[] | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [q, setQ] = useState("");
  // reload when items change (a file column write bumps updatedAt) so uploads show up live
  const stamp = useMemo(() => board.items.reduce((m, i) => (i.updatedAt > m ? i.updatedAt : m), ""), [board.items]);
  useEffect(() => {
    let live = true;
    api.get<AssetDto[]>(`/api/v1/assets?boardId=${board.board.id}`).then((r) => { if (live) setFiles(r); }).catch(() => { if (live) setFiles([]); });
    return () => { live = false; };
  }, [board.board.id, stamp]);

  const colId = typeof settings.fileColumnId === "string" && settings.fileColumnId ? settings.fileColumnId : null;
  const shown = (files ?? []).filter((f) => (!colId || f.columnId === colId) && (kind === "all" || (kind === "images" ? f.isImage : !f.isImage)) && (!q.trim() || f.name.toLowerCase().includes(q.trim().toLowerCase())));
  const itemName = (id: string | null) => board.items.find((i) => i.id === id)?.name ?? "";

  const controls = (
    <>
      <input className={styles.search} placeholder={t("vw.files.search")} value={q} onChange={(e) => setQ(e.target.value)} data-testid="files-search" />
      <div className={frame.segmented} role="group">
        {(["all", "images", "documents"] as Kind[]).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} data-testid={`files-kind-${k}`}>{t(`vw.files.${k}`)}</button>)}
      </div>
    </>
  );
  return (
    <ViewFrame props={props} settings={settings} patch={patch} controls={controls} testId="files-view">
      {files && !shown.length ? <div className={frame.emptyConfig} data-testid="files-empty"><div className={frame.emptyTitle}>{t("vw.files.empty")}</div></div> : null}
      <div className={styles.grid} data-testid="files-grid">
        {shown.map((f) => (
          <div key={f.id} className={styles.tile} data-testid="file-tile" data-file-name={f.name}>
            <a className={styles.thumb} href={f.url} target="_blank" rel="noreferrer">
              {f.isImage ? <img src={f.url} alt={f.name} loading="lazy" /> : <Icon icon={FileIcon} size={40} ignoreFocusStyle />}
            </a>
            <div className={styles.name} title={f.name}>{f.name}</div>
            <div className={styles.meta}>
              {f.itemId ? <button type="button" className={styles.itemLink} onClick={() => onOpenItem(f.itemId)} data-testid="file-item-link">{itemName(f.itemId)}</button> : null}
              <span>{sizeText(f.size)}</span>
            </div>
          </div>
        ))}
      </div>
    </ViewFrame>
  );
}
