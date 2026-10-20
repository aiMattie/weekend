"use client";

import { InlineInputEditor } from "./text";
import { flagEmoji } from "@/server/columns/country";
import type { ColumnUi, EditorProps } from "./types";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

type V = { phone: string; countryShortName: string };

function PhoneEditor({ value, onCommit, onCancel }: EditorProps<V>) {
  return <InlineInputEditor initial={value?.phone ?? ""} onCommit={(v) => onCommit(v.trim() === "" ? null : v.trim())} onCancel={onCancel} />;
}

export const phoneUi: ColumnUi<V> = {
  align: "left",
  editorMode: "inline",
  defaultWidth: 160,
  Cell: ({ value }) => (
    <div className={styles.cell}>
      {value ? (
        <>
          {value.countryShortName ? <span className={pack.flag}>{flagEmoji(value.countryShortName)}</span> : null}
          <a className={styles.link} href={`tel:${value.phone.replace(/[\s()-]/g, "")}`} onClick={(e) => e.stopPropagation()}>{value.phone}</a>
        </>
      ) : null}
    </div>
  ),
  Editor: PhoneEditor,
};
