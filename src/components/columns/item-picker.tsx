"use client";

import { useEffect, useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { rememberItem } from "./lookups";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

export type ItemHit = { id: string; name: string; boardId: string; boardName: string; groupTitle: string | null; groupColor: string | null };

/** Popover with search + checkbox list of items on the given boards (connect boards / dependency). */
export function ItemPicker({ anchorEl, boardIds, selectedIds, allowMultiple, excludeItemId, onChange, onClose }: {
  anchorEl: HTMLElement | null;
  boardIds: string[];
  selectedIds: string[];
  allowMultiple: boolean;
  excludeItemId?: string;
  onChange: (ids: string[], keepOpen: boolean) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ItemHit[]>([]);
  const [loading, setLoading] = useState(true);
  const key = boardIds.join(",");

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ boardIds: key, q, limit: "50" });
      if (excludeItemId) params.set("excludeItemId", excludeItemId);
      api.get<ItemHit[]>(`/api/v1/items/search?${params}`)
        .then((r) => { if (alive) { r.forEach((h) => rememberItem(h.id, h.name, h.boardId)); setHits(r); } })
        .catch(() => { if (alive) setHits([]); })
        .finally(() => { if (alive) setLoading(false); });
    }, q ? 200 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [key, q, excludeItemId]);

  const selected = new Set(selectedIds);
  const toggle = (id: string) => {
    if (!allowMultiple) return onChange(selected.has(id) ? [] : [id], false);
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next], true);
  };
  const multiBoard = boardIds.length > 1;
  const headIds = new Map<string, string>();
  for (const h of hits) if (!headIds.has(h.boardId)) headIds.set(h.boardId, h.id);
  return (
    <Popover anchorEl={anchorEl} onClose={onClose}>
      <input className={styles.searchInput} autoFocus placeholder={t("col.relation.search")} value={q} data-testid="item-picker-search" onChange={(e) => setQ(e.target.value)} />
      <div className={styles.optionList} style={{ minWidth: 280 }} data-testid="item-picker">
        {hits.map((h) => {
          const head = multiBoard && headIds.get(h.boardId) === h.id ? <div key={`b-${h.boardId}`} className={pack.group}>{h.boardName}</div> : null;
          return (
            <div key={h.id} style={{ display: "contents" }}>
              {head}
              <button type="button" className={`${styles.option} ${selected.has(h.id) ? styles.optionSelected : ""}`} data-testid="item-picker-option" data-item-name={h.name} onClick={() => toggle(h.id)}>
                {allowMultiple ? <input type="checkbox" readOnly checked={selected.has(h.id)} className={styles.checkbox} /> : null}
                {h.groupColor ? <span style={{ width: 4, alignSelf: "stretch", background: h.groupColor, borderRadius: 2 }} /> : null}
                <span className={pack.listName}>{h.name}</span>
              </button>
            </div>
          );
        })}
        {!hits.length && !loading ? <span className={styles.muted} style={{ padding: 8 }}>{t("col.relation.noItems")}</span> : null}
      </div>
    </Popover>
  );
}
