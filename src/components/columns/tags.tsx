"use client";

import { useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { contrastText } from "@/lib/colors";
import { useT } from "@/lib/i18n/client";
import { rememberTags, tagById, useAllTags, type TagDto } from "./lookups";
import type { ColumnUi, EditorProps } from "./types";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

type V = { tag_ids: string[]; tags?: TagDto[] };

const resolve = (v: V | null): TagDto[] => {
  if (v?.tags) rememberTags(v.tags);
  return (v?.tag_ids ?? []).map((id) => v?.tags?.find((t) => t.id === id) ?? tagById(id)).filter((t): t is TagDto => !!t);
};

function TagsEditor({ value, onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const { tags, create } = useAllTags();
  const [q, setQ] = useState("");
  const selected = new Set(value?.tag_ids ?? []);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onCommit({ tag_ids: [...next] }, { keepOpen: true });
  };
  const list = tags.filter((x) => x.name.toLowerCase().includes(q.trim().toLowerCase()));
  const exact = tags.some((x) => x.name.toLowerCase() === q.trim().toLowerCase());
  const addNew = async () => {
    const tag = await create(q.trim());
    setQ("");
    onCommit({ tag_ids: [...selected, tag.id] }, { keepOpen: true });
  };
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <input className={styles.searchInput} autoFocus placeholder={t("col.tags.search")} value={q} data-testid="tags-search" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && q.trim() && !exact) void addNew(); }} />
      <div className={styles.optionList} data-testid="tags-editor">
        {list.map((tag) => (
          <button key={tag.id} type="button" className={`${styles.option} ${selected.has(tag.id) ? styles.optionSelected : ""}`} data-testid={`tag-option-${tag.name}`} onClick={() => toggle(tag.id)}>
            <input type="checkbox" readOnly checked={selected.has(tag.id)} className={styles.checkbox} />
            <span className={pack.chip} style={{ background: tag.color, color: contrastText(tag.color) }}>{tag.name}</span>
          </button>
        ))}
        {q.trim() && !exact ? <button type="button" className={styles.option} data-testid="tags-create" onClick={() => void addNew()}>{t("col.tags.create", { name: q.trim() })}</button> : null}
      </div>
    </Popover>
  );
}

export const tagsUi: ColumnUi<V> = {
  align: "left",
  defaultWidth: 170,
  Cell: ({ value }) => {
    const list = resolve(value);
    return (
      <div className={styles.cell}>
        <div className={pack.chips}>
          {list.slice(0, 3).map((x) => <span key={x.id} className={`${pack.chip} ${pack.chipTag}`} style={{ background: x.color, color: contrastText(x.color) }} data-testid="tag-chip">{x.name}</span>)}
          {list.length > 3 ? <span className={pack.more}>+{list.length - 3}</span> : null}
        </div>
      </div>
    );
  },
  Editor: TagsEditor,
};
