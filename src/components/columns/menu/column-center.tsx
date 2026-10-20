"use client";

import { Icon, Modal, ModalContent, ModalFooter, ModalHeader } from "@vibe/core";
import { useState } from "react";
import type { BoardFull } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import { getColumnLogic } from "@/server/columns/registry";
import { CATALOG, NO_CONVERT, type CatalogEntry, type CenterCategory } from "./catalog";
import { DialogRoot } from "./dialog-root";
import { ColumnSettingsForm } from "./settings-forms";
import css from "./menu.module.css";

type Cat = "all" | CenterCategory;

/**
 * Column center: browse column types by category (Essentials / Super useful), search, pick one.
 * Types that need configuration (connect boards, mirror, formula) continue with a setup step.
 * `mode "change"` is used by the column menu to change the type of an existing column.
 */
export function ColumnCenter({ board, mode = "add", currentType, onPick, onClose }: {
  board: BoardFull;
  mode?: "add" | "change";
  currentType?: string;
  onPick: (r: { type: string; title: string; settings: Record<string, unknown> }) => void;
  onClose: () => void;
}) {
  return <DialogRoot><Inner board={board} mode={mode} currentType={currentType} onPick={onPick} onClose={onClose} /></DialogRoot>;
}

function Inner({ board, mode, currentType, onPick, onClose }: { board: BoardFull; mode: "add" | "change"; currentType?: string; onPick: (r: { type: string; title: string; settings: Record<string, unknown> }) => void; onClose: () => void }) {
  const t = useT();
  const [cat, setCat] = useState<Cat>("all");
  const [q, setQ] = useState("");
  const [setup, setSetup] = useState<CatalogEntry | null>(null);
  const [title, setTitle] = useState("");
  const [settings, setSettings] = useState<Record<string, unknown>>({});

  const label = (type: string) => t(`col.type.${type}`);
  const query = q.trim().toLowerCase();
  const entries = CATALOG
    .filter((e) => (mode === "change" ? !NO_CONVERT.has(e.type) && e.type !== currentType && !getColumnLogic(e.type).readOnly : true))
    .filter((e) => cat === "all" || e.category === cat)
    .filter((e) => !query || label(e.type).toLowerCase().includes(query) || t(`col.desc.${e.type}`).toLowerCase().includes(query) || e.type.includes(query));

  const choose = (e: CatalogEntry) => {
    if (mode === "add" && e.needsSetup) {
      setSetup(e);
      setTitle(label(e.type));
      setSettings({ ...getColumnLogic(e.type).defaultSettings() });
      return;
    }
    onPick({ type: e.type, title: label(e.type), settings: {} });
    onClose();
  };
  const create = () => {
    if (!setup) return;
    onPick({ type: setup.type, title: title.trim() || label(setup.type), settings });
    onClose();
  };

  const groups: { key: CenterCategory; entries: CatalogEntry[] }[] = (["essentials", "super_useful"] as CenterCategory[]).map((k) => ({ key: k, entries: entries.filter((e) => e.category === k) })).filter((g) => g.entries.length);

  return (
    <Modal id="column-center" show size="large" onClose={onClose}>
      <ModalHeader title={setup ? label(setup.type) : mode === "change" ? t("col.center.changeTitle") : t("col.center.title")} />
      <ModalContent>
        {setup ? (
          <div className={css.setup} data-testid="column-center-setup">
            <label className={css.field}>{t("col.settings.name")}<input type="text" value={title} data-testid="column-title-input" onChange={(e) => setTitle(e.target.value)} /></label>
            <ColumnSettingsForm type={setup.type} settings={settings} board={board} mode="create" onChange={(p) => setSettings((s) => ({ ...s, ...p }))} />
          </div>
        ) : (
          <div className={css.center} data-testid="column-center">
            <div className={css.centerSide}>
              {(["all", "essentials", "super_useful"] as Cat[]).map((c) => (
                <button key={c} type="button" className={`${css.centerCat} ${cat === c ? css.centerCatOn : ""}`} data-testid={`column-center-cat-${c}`} onClick={() => setCat(c)}>{t(`col.center.cat.${c}`)}</button>
              ))}
            </div>
            <div className={css.centerMain}>
              <input className={css.centerSearch} autoFocus placeholder={t("col.center.search")} value={q} data-testid="column-center-search" onChange={(e) => setQ(e.target.value)} />
              <div className={css.centerGrid}>
                {groups.map((g) => (
                  <div key={g.key} style={{ display: "contents" }}>
                    {cat === "all" ? <div className={css.centerGroup}>{t(`col.center.cat.${g.key}`)}</div> : null}
                    {g.entries.map((e) => (
                      <button key={e.type} type="button" className={css.tile} data-testid={`add-column-${e.type}`} onClick={() => choose(e)}>
                        <span className={css.tileIcon} style={{ background: e.color }}><Icon icon={e.icon} size={18} ignoreFocusStyle /></span>
                        <span><div className={css.tileName}>{label(e.type)}</div><div className={css.tileDesc}>{t(`col.desc.${e.type}`)}</div></span>
                      </button>
                    ))}
                  </div>
                ))}
                {!groups.length ? <span className={css.hint}>{t("col.center.none")}</span> : null}
              </div>
            </div>
          </div>
        )}
      </ModalContent>
      {setup ? (
        <ModalFooter primaryButton={{ text: t("col.center.create"), onClick: create }} secondaryButton={{ text: t("col.center.back"), onClick: () => setSetup(null) }} />
      ) : (
        <ModalFooter primaryButton={{ text: t("common.close"), onClick: onClose }} />
      )}
    </Modal>
  );
}
