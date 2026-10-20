"use client";

import { Icon } from "@vibe/core";
import { Pin, PinFull, Search } from "@vibe/icons";
import { useState } from "react";
import { UserAvatar } from "@/components/columns/shared";
import { useT } from "@/lib/i18n/client";
import { Popover } from "../ui/popover";
import { dataColumns, PopHeader, type PopProps } from "./filter-popover";
import { TOOLBAR_BUTTONS, type ToolbarButtonId } from "./prefs";
import styles from "../toolbar.module.css";

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className={styles.popSearch}>
      <Icon icon={Search} size={14} ignoreFocusStyle />
      <input className={styles.popSearchInput} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoFocus data-testid="pop-search" />
    </div>
  );
}

export function PersonPopover({ anchorEl, onClose, board, state, setState, dirty, onSaveAsNew }: PopProps) {
  const t = useT();
  const [q, setQ] = useState("");
  const toggle = (id: string) => setState({ personIds: state.personIds.includes(id) ? state.personIds.filter((p) => p !== id) : [...state.personIds, id] });
  const users = board.users.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()));
  const selectedNames = board.users.filter((u) => state.personIds.includes(u.id)).map((u) => u.name).join(", ");
  return (
    <Popover anchorEl={anchorEl} onClose={onClose}>
      <div className={styles.pop} style={{ minWidth: 280 }} data-testid="person-popover">
        <PopHeader title={t("toolbar.personFilter")} dirty={dirty} onSaveAsNew={onSaveAsNew} />
        <div className={styles.popHint}>{t("toolbar.personHint")}</div>
        {board.users.length > 6 ? <SearchBox value={q} onChange={setQ} placeholder={t("toolbar.personSearch")} /> : null}
        <div className={styles.avatarGrid} data-testid="person-avatars">
          {users.map((u) => {
            const on = state.personIds.includes(u.id);
            return (
              <button key={u.id} type="button" className={`${styles.avatarBtn} ${on ? styles.avatarOn : ""}`} onClick={() => toggle(u.id)} aria-pressed={on} aria-label={u.name} title={u.name} data-testid={`person-filter-${u.name}`}>
                <UserAvatar user={u} size="medium" />
              </button>
            );
          })}
          <button type="button" className={`${styles.avatarBtn} ${state.personIds.includes("none") ? styles.avatarOn : ""}`} onClick={() => toggle("none")} aria-pressed={state.personIds.includes("none")} aria-label={t("toolbar.unassigned")} title={t("toolbar.unassigned")} data-testid="person-filter-none">
            <span className={styles.noPerson} />
          </button>
        </div>
        {state.personIds.length ? <div className={styles.popRow}><span className={styles.popHint}>{selectedNames}{state.personIds.includes("none") ? ` ${t("toolbar.unassigned")}` : ""}</span><button type="button" className={styles.link} onClick={() => setState({ personIds: [] })} data-testid="person-clear">{t("toolbar.clear")}</button></div> : null}
      </div>
    </Popover>
  );
}

export function HidePopover({ anchorEl, onClose, board, state, setState, dirty, onSaveAsNew }: PopProps) {
  const t = useT();
  const [q, setQ] = useState("");
  const cols = dataColumns(board);
  const hidden = new Set(state.hiddenColumnIds);
  const shown = cols.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <Popover anchorEl={anchorEl} onClose={onClose}>
      <div className={styles.pop} style={{ minWidth: 280 }} data-testid="hide-popover">
        <PopHeader title={t("toolbar.hideTitle")} dirty={dirty} onSaveAsNew={onSaveAsNew} />
        <SearchBox value={q} onChange={setQ} placeholder={t("toolbar.hideSearch")} />
        <div className={styles.list}>
          {shown.map((c) => (
            <label key={c.id} className={styles.option}>
              <input type="checkbox" checked={!hidden.has(c.id)} onChange={() => setState({ hiddenColumnIds: hidden.has(c.id) ? state.hiddenColumnIds.filter((x) => x !== c.id) : [...state.hiddenColumnIds, c.id] })} data-testid={`hide-col-${c.key}`} />
              {c.title}
            </label>
          ))}
        </div>
        <div className={styles.popRow}>
          <button type="button" className={styles.link} onClick={() => setState({ hiddenColumnIds: cols.map((c) => c.id) })} data-testid="hide-all">{t("toolbar.hideAll")}</button>
          <button type="button" className={styles.link} onClick={() => setState({ hiddenColumnIds: [] })} data-testid="show-all">{t("toolbar.showAll")}</button>
        </div>
      </div>
    </Popover>
  );
}

export function GroupByPopover({ anchorEl, onClose, board, state, setState, dirty, onSaveAsNew }: PopProps) {
  const t = useT();
  const cols = dataColumns(board);
  const pick = (id: string | null) => {
    setState({ groupByColumnId: id });
    onClose();
  };
  return (
    <Popover anchorEl={anchorEl} onClose={onClose}>
      <div className={styles.pop} style={{ minWidth: 240 }} data-testid="groupby-popover">
        <PopHeader title={t("toolbar.groupTitle")} dirty={dirty} onSaveAsNew={onSaveAsNew} onClear={state.groupByColumnId ? () => pick(null) : undefined} />
        <div className={styles.list}>
          <button type="button" className={`${styles.option} ${!state.groupByColumnId ? styles.optionOn : ""}`} onClick={() => pick(null)} data-testid="groupby-none">{t("toolbar.noGrouping")}</button>
          {cols.map((c) => (
            <button key={c.id} type="button" className={`${styles.option} ${state.groupByColumnId === c.id ? styles.optionOn : ""}`} onClick={() => pick(c.id)} data-testid={`groupby-${c.key}`}>{c.title}</button>
          ))}
        </div>
      </div>
    </Popover>
  );
}

/** "Customize": which toolbar buttons are shown + which columns are pinned. */
export function CustomizePopover({ anchorEl, onClose, board, state, setState, shown, setShown }: PopProps & { shown: ToolbarButtonId[]; setShown: (ids: ToolbarButtonId[]) => void }) {
  const t = useT();
  const cols = dataColumns(board);
  const pinned = state.pinnedColumnIds;
  const togglePin = (id: string) => setState({ pinnedColumnIds: pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id] });
  return (
    <Popover anchorEl={anchorEl} onClose={onClose}>
      <div className={styles.pop} style={{ minWidth: 300 }} data-testid="customize-popover">
        <div className={styles.popTitle}>{t("toolbar.customize")}</div>
        <div className={styles.popHint}>{t("toolbar.customizeHint")}</div>
        <div className={styles.list}>
          {TOOLBAR_BUTTONS.map((b) => (
            <label key={b} className={styles.option}>
              <input type="checkbox" checked={shown.includes(b)} onChange={() => setShown(shown.includes(b) ? shown.filter((x) => x !== b) : [...shown, b])} data-testid={`customize-${b}`} />
              {t(`toolbar.${b === "groupby" ? "groupBy" : b}`)}
            </label>
          ))}
        </div>
        <div className={styles.popTitle}>{t("toolbar.pinColumns")}</div>
        <div className={styles.popHint}>{t("toolbar.pinHint")}</div>
        <div className={styles.list}>
          {cols.map((c) => (
            <button key={c.id} type="button" className={`${styles.option} ${pinned.includes(c.id) ? styles.optionOn : ""}`} onClick={() => togglePin(c.id)} aria-pressed={pinned.includes(c.id)} data-testid={`pin-col-${c.key}`}>
              <Icon icon={pinned.includes(c.id) ? PinFull : Pin} size={14} ignoreFocusStyle /> <span className={styles.grow}>{c.title}</span>
            </button>
          ))}
        </div>
      </div>
    </Popover>
  );
}
