"use client";

import { useMemo, useState } from "react";
import { Popover } from "@/components/board/ui/popover";
import { useLocale, useT } from "@/lib/i18n/client";
import { COUNTRY_CODES, countryName, flagEmoji } from "@/server/columns/country";
import type { ColumnUi, EditorProps } from "./types";
import pack from "./pack.module.css";
import styles from "./cells.module.css";

type V = { countryCode: string; countryName: string };

function CountryEditor({ onCommit, onCancel, anchorEl }: EditorProps<V>) {
  const t = useT();
  const locale = useLocale();
  const [q, setQ] = useState("");
  const all = useMemo(() => COUNTRY_CODES.map((c) => ({ code: c, name: countryName(c, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale)), [locale]);
  const list = all.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.code.toLowerCase() === q.toLowerCase());
  return (
    <Popover anchorEl={anchorEl} onClose={onCancel}>
      <input className={styles.searchInput} autoFocus placeholder={t("col.country.search")} value={q} data-testid="country-search" onChange={(e) => setQ(e.target.value)} />
      <div className={styles.optionList} data-testid="country-editor">
        {list.slice(0, 80).map((c) => (
          <button key={c.code} type="button" className={styles.option} data-testid={`country-option-${c.code}`} onClick={() => onCommit({ countryCode: c.code })}>
            <span className={pack.flag}>{flagEmoji(c.code)}</span>{c.name}
          </button>
        ))}
      </div>
      <div className={styles.statusFooter}><button type="button" className={styles.btn} onClick={() => onCommit(null)}>{t("column.clear")}</button></div>
    </Popover>
  );
}

export const countryUi: ColumnUi<V> = {
  align: "left",
  defaultWidth: 170,
  Cell: function CountryCell({ value }) {
    const locale = useLocale();
    return (
      <div className={styles.cell}>
        {value ? <><span className={pack.flag}>{flagEmoji(value.countryCode)}</span>{countryName(value.countryCode, locale)}</> : null}
      </div>
    );
  },
  Editor: CountryEditor,
};
