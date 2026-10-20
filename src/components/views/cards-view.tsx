"use client";
/* eslint-disable @next/next/no-img-element -- user uploads served from /api/v1/assets, not optimizable */

import { useMemo } from "react";
import { useT } from "@/lib/i18n/client";
import type { ColumnDto, ItemDto } from "@/lib/board-types";
import { fileUrl, type FileValue } from "@/server/columns/file";
import { resolveCardFields, resolveColumn } from "@/modules/views/lib/settings";
import { EmptyConfig } from "@/modules/views/ui/empty-config";
import { ItemCard } from "@/modules/views/ui/item-card";
import { useViewSettings } from "@/modules/views/ui/use-view-settings";
import { useVisibleItems } from "@/modules/views/ui/use-visible-items";
import { ViewFrame } from "@/modules/views/ui/view-frame";
import styles from "@/modules/views/ui/cards.module.css";
import type { ViewProps } from "./types";

/** First image of an item's file column, as a url. */
export function coverUrl(item: ItemDto, column: ColumnDto | undefined): string | null {
  if (!column) return null;
  const img = ((item.values[column.id] as FileValue | undefined)?.files ?? []).find((f) => f.isImage || /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(f.name));
  return img ? fileUrl(img) : null;
}

export function CardsView(props: ViewProps) {
  const { board, view, viewState, actions, onOpenItem, canEdit, canEditStructure } = props;
  const t = useT();
  const { settings, patch } = useViewSettings(view, actions, canEditStructure);
  const items = useVisibleItems(board, viewState);
  const coverCol = resolveColumn(board.columns, settings.coverColumnId, ["file"]);
  const fields = useMemo(() => resolveCardFields(board.columns, settings.cardFieldIds, coverCol ? [coverCol.id] : [], 4), [board.columns, settings.cardFieldIds, coverCol]);
  const addCard = async () => {
    const group = board.groups[0];
    if (group) { const it = await actions.createItem({ groupId: group.id, name: t("toolbar.newItem") }); if (it) onOpenItem(it.id); }
  };
  return (
    <ViewFrame props={props} settings={settings} patch={patch} testId="cards-view">
      <div className={styles.grid} data-testid="cards-grid">
        {items.map((it) => {
          const url = coverUrl(it, coverCol);
          return (
            <ItemCard key={it.id} board={board} item={it} fields={fields} onOpen={onOpenItem} testId="cards-card"
              cover={<div className={styles.cover} data-testid="card-cover" data-has-image={url ? "true" : "false"}>{url ? <img src={url} alt={it.name} loading="lazy" /> : <span className={styles.noCover}>{it.name.slice(0, 1).toUpperCase()}</span>}</div>} />
          );
        })}
        {canEdit ? <button type="button" className={styles.add} onClick={() => void addCard()} data-testid="cards-add">+ {t("vw.kanban.addCard")}</button> : null}
      </div>
      {!coverCol && canEditStructure ? <EmptyConfig messageKey="vw.cards.needCover" createType="file" createTitle="Files" canCreate onCreate={() => void actions.createColumn({ title: "Files", type: "file" })} testId="cards-no-cover" /> : null}
    </ViewFrame>
  );
}
