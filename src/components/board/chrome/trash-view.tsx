"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { notifyNavChanged } from "./ops";
import { useDialogs } from "./use-dialogs";
import styles from "./chrome.module.css";

type Kind = "board" | "group" | "item" | "workspace";
interface TrashList {
  boards: { id: string; name: string; workspaceName: string; kind: string; updatedAt: string }[];
  groups: { id: string; title: string; color: string; boardId: string; boardName: string }[];
  items: { id: string; name: string; boardId: string; boardName: string; groupTitle: string | null; parentItemId: string | null; updatedAt: string }[];
  workspaces: { id: string; name: string }[];
}
type Row = { kind: Kind; id: string; name: string; meta: string; color?: string };
type Tab = "boards" | "groups" | "items" | "workspaces";

/** /archive (state=archived) and /trash (state=deleted): list, restore, delete permanently. */
export function TrashView({ state }: { state: "archived" | "deleted" }) {
  const t = useT();
  const router = useRouter();
  const dialogs = useDialogs();
  const [data, setData] = useState<TrashList | null>(null);
  const [tab, setTab] = useState<Tab>("boards");
  const [error, setError] = useState<string | null>(null);
  const trash = state === "deleted";

  const load = useCallback(async () => {
    try { setData(await api.get<TrashList>(`/api/v1/trash?state=${state}`)); } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
  }, [state, t]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const rows: Record<Tab, Row[]> = {
    boards: (data?.boards ?? []).map((b) => ({ kind: "board", id: b.id, name: b.name, meta: b.workspaceName })),
    groups: (data?.groups ?? []).map((g) => ({ kind: "group", id: g.id, name: g.title, meta: g.boardName, color: g.color })),
    items: (data?.items ?? []).map((i) => ({ kind: "item", id: i.id, name: i.name, meta: `${i.boardName}${i.groupTitle ? ` / ${i.groupTitle}` : ""}${i.parentItemId ? ` (${t("chrome.subitem")})` : ""}` })),
    workspaces: (data?.workspaces ?? []).map((w) => ({ kind: "workspace", id: w.id, name: w.name, meta: "Workspace" })),
  };

  const after = async () => { notifyNavChanged(); router.refresh(); await load(); };
  const restore = async (r: Row) => {
    setError(null);
    try { await api.post("/api/v1/trash/restore", { kind: r.kind, id: r.id }); await after(); } catch (e) { setError(e instanceof Error ? e.message : t("common.error")); }
  };
  const purge = (r: Row) => dialogs.open({ kind: "confirm", spec: { title: t("chrome.purgeTitle"), message: t("chrome.purgeMessage", { name: r.name }), confirmLabel: t("chrome.purge"), danger: true, onConfirm: async () => { await api.post("/api/v1/trash/purge", { kind: r.kind, id: r.id }); await after(); } } });
  const empty = () => dialogs.open({ kind: "confirm", spec: { title: t("chrome.emptyTrash"), message: t("chrome.emptyTrashMessage"), confirmLabel: t("chrome.emptyTrash"), danger: true, onConfirm: async () => { await api.post("/api/v1/trash/empty", { state }); await after(); } } });

  const total = data ? data.boards.length + data.groups.length + data.items.length + data.workspaces.length : 0;
  const tabs: { id: Tab; label: string }[] = [
    { id: "boards", label: "Boards" }, { id: "groups", label: "Groups" }, { id: "items", label: "Items" }, { id: "workspaces", label: "Workspaces" },
  ];
  const list = rows[tab];

  return (
    <div className={styles.listPage} data-testid={trash ? "trash-page" : "archive-page"}>
      <h1 className={styles.listTitle}>
        {trash ? t("chrome.trash") : t("chrome.archive")}
        {trash && total > 0 ? <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={empty} data-testid="empty-trash" style={{ marginLeft: "auto", fontSize: 13 }}>{t("chrome.emptyTrash")}</button> : null}
      </h1>
      <p className={styles.hint} style={{ margin: "0 0 16px" }}>{trash ? t("chrome.trashIntro") : t("chrome.archiveIntro")}</p>
      <div className={styles.tabs} role="tablist">
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={`${styles.tab} ${tab === x.id ? styles.tabOn : ""}`} onClick={() => setTab(x.id)} data-testid={`trash-tab-${x.id}`}>
            {x.label} ({rows[x.id].length})
          </button>
        ))}
      </div>
      {error ? <div className={styles.error} role="alert">{error}</div> : null}
      {data && list.length === 0 ? <div className={styles.empty} data-testid="trash-empty">{trash ? t("chrome.trashEmpty") : t("chrome.archiveEmpty")}</div> : null}
      <div data-testid="trash-list">
        {list.map((r) => (
          <div key={`${r.kind}-${r.id}`} className={styles.listRow} data-testid="trash-row" data-kind={r.kind} data-id={r.id}>
            {r.color ? <span className={styles.dot} style={{ background: r.color }} /> : null}
            <div className={styles.listMain}>
              <div className={styles.listName}>{r.name}</div>
              <div className={styles.listMeta}>{r.meta}</div>
            </div>
            <button type="button" className={styles.btn} onClick={() => void restore(r)} data-testid="restore">{t("chrome.restore")}</button>
            {trash ? <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={() => purge(r)} data-testid="purge">{t("chrome.purge")}</button> : null}
          </div>
        ))}
      </div>
      {dialogs.element}
    </div>
  );
}
