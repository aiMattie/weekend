"use client";

import { IconButton } from "@vibe/core";
import { Close } from "@vibe/icons";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { BoardFull } from "@/lib/board-types";
import { BuilderTab } from "./builder-tab";
import { ManageTab } from "./manage-tab";
import { RecipesTab } from "./recipes-tab";
import { RunList } from "./run-list";
import type { AutomationDto, Catalog } from "./types";
import { useAutoContext } from "./use-auto-context";
import styles from "./automations.module.css";

type Tab = "recipes" | "builder" | "manage" | "log";

export function AutomationCenter({ board, onClose, initialTab = "recipes" }: { board: BoardFull; onClose: () => void; initialTab?: Tab }) {
  const t = useT();
  const ctx = useAutoContext(board);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [list, setList] = useState<AutomationDto[]>([]);
  const [editing, setEditing] = useState<AutomationDto | null>(null);
  const [toast, setToast] = useState("");
  const boardId = board.board.id;

  const reload = useCallback(() => {
    void api.get<AutomationDto[]>(`/api/v1/automations?boardId=${boardId}`).then(setList).catch(() => undefined);
  }, [boardId]);
  useEffect(() => {
    void api.get<Catalog>(`/api/v1/automations/catalog?boardId=${boardId}`).then(setCatalog).catch(() => undefined);
    reload();
  }, [boardId, reload]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target instanceof HTMLSelectElement)) onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const added = (a: AutomationDto, saved = false) => {
    reload();
    setToast(`${t(saved ? "auto.saved" : "auto.added")}: ${a.name}`);
  };
  const names = Object.fromEntries(list.map((a) => [a.id, a.name]));
  const createMode = tab === "recipes" || tab === "builder";
  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="automation-center-overlay">
      <div className={styles.dialog} role="dialog" aria-label={t("auto.center")} data-testid="automation-center">
        <div className={styles.head}>
          <h2 className={styles.headTitle}><strong>{t("auto.centerTitle")}</strong> <span className={styles.headBoard}>{board.board.name}</span></h2>
          <div className={styles.segment} role="tablist">
            <button type="button" role="tab" aria-selected={createMode} className={`${styles.segBtn} ${createMode ? styles.segActive : ""}`} onClick={() => { setTab("recipes"); setEditing(null); }} data-testid="auto-tab-recipes">{t("auto.tab.create")}</button>
            <button type="button" role="tab" aria-selected={!createMode} className={`${styles.segBtn} ${!createMode ? styles.segActive : ""}`} onClick={() => { setTab("manage"); setEditing(null); }} data-testid="auto-tab-manage">{t("auto.tab.manage")}{list.length ? ` (${list.length})` : ""}</button>
          </div>
          <div className={styles.headRight}><IconButton icon={Close} kind="tertiary" size="small" aria-label={t("common.close")} onClick={onClose} data-testid="automation-center-close" /></div>
        </div>
        {!createMode ? (
          <div className={styles.subTabs}>
            <button type="button" className={`${styles.tab} ${tab === "manage" ? styles.tabActive : ""}`} onClick={() => setTab("manage")} data-testid="auto-subtab-manage">{t("auto.tab.manageList")}</button>
            <button type="button" className={`${styles.tab} ${tab === "log" ? styles.tabActive : ""}`} onClick={() => setTab("log")} data-testid="auto-tab-log">{t("auto.tab.log")}</button>
          </div>
        ) : null}
        {!catalog ? <div className={styles.empty}>{t("common.loading")}</div> : (
          <>
            {tab === "recipes" ? <RecipesTab catalog={catalog} ctx={ctx} onAdded={(a) => { added(a); }} onScratch={() => setTab("builder")} /> : null}
            {tab === "builder" ? (
              <div className={styles.builderWrap}>
                <button type="button" className={styles.backLink} onClick={() => { setTab(editing ? "manage" : "recipes"); setEditing(null); }} data-testid="auto-tab-builder-back">← {t("auto.back")}</button>
                <BuilderTab key={editing?.id ?? "new"} catalog={catalog} ctx={ctx} editing={editing} onSaved={(a) => { added(a, true); setEditing(null); setTab("manage"); }} />
              </div>
            ) : null}
            {tab === "manage" ? <ManageTab catalog={catalog} ctx={ctx} automations={list} reload={reload} onEdit={(a) => { setEditing(a); setTab("builder"); }} /> : null}
            {tab === "log" ? <div className={styles.main}><RunList ctx={ctx} names={names} /></div> : null}
          </>
        )}
        {toast ? <div className={styles.toast} role="status" data-testid="auto-toast">{toast}</div> : null}
      </div>
    </div>
  );
}
