"use client";

import { Button, IconButton } from "@vibe/core";
import { Add, Delete, Duplicate, Filter, Fullscreen, FullscreenClose, Locked, MoreActions, Settings, Share, Unlocked } from "@vibe/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ActionMenu } from "@/components/board/ui/menu";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { useCurrentUser } from "@/components/shell/user-context";
import styles from "./dashboards.module.css";
import { BoardsDialog, ShareDialog } from "./dialogs";
import { FilterEditor } from "./filter-editor";
import type { DashboardDto, WidgetDto } from "./types";
import { useDashboard } from "./use-dashboard";
import { WidgetGallery } from "./widget-gallery";
import { WidgetGrid } from "./widget-grid";
import { widgetComponents } from "./widget-components";
import { WidgetSettings } from "./widget-settings";

function DashboardTitle({ name, editable, onRename }: { name: string; editable: boolean; onRename: (n: string) => void }) {
  const t = useT();
  const [value, setValue] = useState(name);
  return <input className={styles.title} value={value} disabled={!editable} onChange={(e) => setValue(e.target.value)} onBlur={() => value.trim() && value !== name && onRename(value.trim())} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} data-testid="dashboard-title" aria-label={t("dashboards.name")} />;
}

export function DashboardPage({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const search = useSearchParams();
  const me = useCurrentUser();
  const [moreEl, setMoreEl] = useState<HTMLElement | null>(null);
  const { payload, setPayload, data, columns, error, reload, reloadData, refreshedAt } = useDashboard(id);
  const [gallery, setGallery] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [tv, setTv] = useState(search.get("tv") === "1");
  const root = useRef<HTMLDivElement>(null);
  const patchSeq = useRef(0);
  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setTv(false); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  if (error && !payload) return <div className={styles.empty} data-testid="dashboard-error">{error}</div>;
  if (!payload || !columns) return <div className={styles.empty}>{t("common.loading")}</div>;
  const { dashboard, widgets, canEdit } = payload;
  const isOwner = dashboard.ownerId === me.id || me.role === "admin";
  const editable = canEdit && !tv;

  // optimistic: apply the patch locally first, then persist; only the latest response may land (rapid filter edits)
  const patchDashboard = async (patch: Record<string, unknown>) => {
    const n = ++patchSeq.current;
    setPayload({ ...payload, dashboard: { ...dashboard, ...patch } as DashboardDto });
    const next = await api.patch<DashboardDto>(`/api/v1/dashboards/${id}`, patch);
    if (n !== patchSeq.current) return;
    setPayload({ ...payload, dashboard: next });
    if ("boardIds" in patch) await reload();
    else await reloadData();
  };
  const addWidget = async (type: string) => {
    setGallery(false);
    const w = await api.post<WidgetDto>(`/api/v1/dashboards/${id}/widgets`, { type });
    setPayload({ ...payload, widgets: [...widgets, w] });
    await reloadData();
    setEditing(w.id);
  };
  const saveWidget = async (w: WidgetDto, patch: { title: string; settings: Record<string, unknown> }) => {
    const next = await api.patch<WidgetDto>(`/api/v1/widgets/${w.id}`, patch);
    setPayload({ ...payload, widgets: widgets.map((x) => (x.id === w.id ? next : x)) });
    setEditing(null);
    await reloadData();
  };
  const removeWidget = async (w: WidgetDto) => {
    await api.del(`/api/v1/widgets/${w.id}`);
    setPayload({ ...payload, widgets: widgets.filter((x) => x.id !== w.id) });
  };
  const dupWidget = async (w: WidgetDto) => {
    const c = await api.post<WidgetDto>(`/api/v1/widgets/${w.id}/duplicate`);
    setPayload({ ...payload, widgets: [...widgets, c] });
    await reloadData();
  };
  const saveLayout = async (layout: { id: string; x: number; y: number; w: number; h: number }[]) => {
    setPayload({ ...payload, widgets: widgets.map((w) => { const l = layout.find((x) => x.id === w.id); return l ? { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : w; }) });
    await api.put(`/api/v1/dashboards/${id}/layout`, { layout }).catch(() => reload());
  };
  const enterTv = async () => { setTv(true); try { await root.current?.requestFullscreen?.(); } catch { /* the TV layout still applies */ } };
  const exitTv = async () => { setTv(false); if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined); };
  const editingWidget = widgets.find((w) => w.id === editing);

  return (
    <div ref={root} className={`${styles.page} ${tv ? styles.tv : ""} ${dashboard.locked ? styles.locked : ""}`} data-testid="dashboard-page" data-tv={tv ? "1" : "0"}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div>
            <DashboardTitle key={dashboard.name} name={dashboard.name} editable={editable} onRename={(n) => void patchDashboard({ name: n })} />
            <div className={styles.sub}>
              <span>{payload.workspaceName}</span>
              {payload.boards.map((b) => <span key={b.id} className={styles.chip} data-testid="dashboard-board-chip">{b.name}</span>)}
              {dashboard.locked && <span className={styles.chip}><Locked size={12} /> {t("dashboards.locked")}</span>}
              {!tv && <span title={new Date(refreshedAt).toLocaleTimeString("nl-NL")} data-testid="dashboard-refreshed">{t("dashboards.live")}</span>}
            </div>
          </div>
        </div>
        <div className={styles.toolbar} style={{ position: "relative" }}>
          {tv ? <Button kind="secondary" leftIcon={FullscreenClose} onClick={exitTv} data-testid="exit-tv">{t("dashboards.exitTv")}</Button> : (
            <>
              {editable && <Button leftIcon={Add} onClick={() => setGallery(true)} data-testid="add-widget">{t("dashboards.addWidget")}</Button>}
              {editable && <Button kind="secondary" size="small" onClick={() => setBoardsOpen(true)} data-testid="edit-boards">{t("dashboards.boards")} ({dashboard.boardIds.length})</Button>}
              <Button kind="tertiary" leftIcon={Filter} onClick={() => setFilterOpen(!filterOpen)} data-testid="dashboard-filter">{t("dashboards.filter")}{dashboard.filters.length ? ` (${dashboard.filters.length})` : ""}</Button>
              {filterOpen && (
                <div className={styles.filterPop} data-testid="dashboard-filter-pop">
                  <div className={styles.fieldLabel}>{t("dashboards.filterAll")}</div>
                  <FilterEditor columns={columns} rules={dashboard.filters} onChange={(filters) => void patchDashboard({ filters })} />
                </div>
              )}
              <Button kind="tertiary" leftIcon={Share} onClick={() => setShareOpen(true)} data-testid="dashboard-share">{t("dashboards.share")}</Button>
              {isOwner && <IconButton icon={dashboard.locked ? Locked : Unlocked} kind="tertiary" aria-label={dashboard.locked ? t("dashboards.unlock") : t("dashboards.lock")} onClick={() => void patchDashboard({ locked: !dashboard.locked })} data-testid="dashboard-lock" />}
              <IconButton icon={Fullscreen} kind="tertiary" aria-label={t("dashboards.tv")} onClick={enterTv} data-testid="dashboard-tv" />
              <IconButton icon={MoreActions} kind="tertiary" aria-label={t("dashboards.more")} onClick={(e) => setMoreEl(moreEl ? null : (e.currentTarget as HTMLElement))} data-testid="dashboard-menu" />
              {moreEl ? (
                <ActionMenu
                  anchorEl={moreEl}
                  align="end"
                  onClose={() => setMoreEl(null)}
                  items={[
                    { key: "dup", label: t("common.duplicate"), icon: <Duplicate size={16} />, testId: "dashboard-duplicate", onClick: async () => { const c = await api.post<{ id: string }>(`/api/v1/dashboards/${id}/duplicate`); router.push(`/dashboards/${c.id}`); } },
                    ...(editable ? [{ key: "del", label: t("common.delete"), icon: <Delete size={16} />, danger: true, testId: "dashboard-delete", onClick: async () => { if (window.confirm(t("dashboards.confirmDelete"))) { await api.del(`/api/v1/dashboards/${id}`); router.push("/dashboards"); } } }] : []),
                  ]}
                />
              ) : null}
            </>
          )}
        </div>
      </div>
      <div className={styles.scroll}>
        {widgets.length === 0 ? (
          <div className={styles.empty} data-testid="dashboard-empty">
            <div>{t("dashboards.emptyDashboard")}</div>
            {editable && <Button kind="secondary" onClick={() => setGallery(true)} data-testid="add-widget-manually">{t("dashboards.addManually")}</Button>}
          </div>
        ) : (
          <WidgetGrid
            widgets={widgets}
            editable={editable}
            onLayout={(l) => void saveLayout(l)}
            renderWidget={(w) => {
              const res = data[w.id];
              const Renderer = widgetComponents[w.type];
              return (
                <div className={styles.widget}>
                  <div className={`${styles.widgetHead} widgetHead`}>
                    <span className={styles.widgetTitle} data-testid="widget-title">{w.title || t(`dashboards.w.${w.type}`)}</span>
                    {editable && (
                      <span className={`${styles.widgetActions} widgetActions`}>
                        <IconButton icon={Settings} kind="tertiary" size="xs" aria-label={t("dashboards.widgetSettings")} onClick={() => setEditing(w.id)} data-testid="widget-settings-btn" />
                        <IconButton icon={Duplicate} kind="tertiary" size="xs" aria-label={t("common.duplicate")} onClick={() => void dupWidget(w)} />
                        <IconButton icon={Delete} kind="tertiary" size="xs" aria-label={t("common.delete")} onClick={() => void removeWidget(w)} data-testid="widget-delete" />
                      </span>
                    )}
                  </div>
                  <div className={styles.widgetBody}>
                    {!res ? null : !res.ok ? <div className={styles.widgetError}>{res.error}</div> : Renderer ? <Renderer data={res.data} settings={w.settings} openItem={(b, i) => router.push(`/boards/${b}?item=${i}`)} /> : null}
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>
      <WidgetGallery open={gallery} onPick={(type) => void addWidget(type)} onClose={() => setGallery(false)} />
      {editingWidget && <WidgetSettings key={editingWidget.id} widget={editingWidget} columns={columns} dashboardBoardIds={dashboard.boardIds} dashboardId={id} onSave={(p) => saveWidget(editingWidget, p)} onClose={() => setEditing(null)} />}
      {boardsOpen && <BoardsDialog value={dashboard.boardIds} onSave={async (ids) => { setBoardsOpen(false); await patchDashboard({ boardIds: ids }); }} onClose={() => setBoardsOpen(false)} />}
      {shareOpen && <ShareDialog dashboard={dashboard} users={columns.users} onSave={async (p) => { setShareOpen(false); await patchDashboard(p); }} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
