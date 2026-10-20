"use client";

import { DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Icon } from "@vibe/core";
import { Add, DropdownChevronDown, DropdownChevronRight } from "@vibe/icons";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ViewProps } from "@/components/views/types";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { Task } from "@/server/services/dev-config";
import type { Planning } from "@/server/services/sprint-read";
import { CompleteSprintDialog } from "./complete-sprint-dialog";
import { useDevData } from "./use-dev";
import { Chip, emptyFilter, fmtDate, isClosedEpic, matchesFilter, Select, ShowAllEpics, TaskRow, TaskRowStatic, type TaskFilter } from "./ui";
import styles from "./dev.module.css";

const STATE_COLOR = { planned: "#579bfc", active: "#00c875", completed: "#c4c4c4" } as const;

function Drop({ id, children, className }: { id: string; children: React.ReactNode; className: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`${className} ${isOver ? styles.sectionOver : ""}`} data-testid={`drop-${id}`}>{children}</div>;
}

/** Backlog + sprints: drag tasks into a sprint, create/start/complete sprints. Works on the sprint board and the task board. */
export function PlanningView({ board, onOpenItem, canEdit }: ViewProps) {
  const t = useT();
  const router = useRouter();
  const { data, setData, error, reload } = useDevData<Planning>(`/api/v1/dev/boards/${board.board.id}/planning`, board.board.id, (d) => d.sourceBoardIds);
  const [filter, setFilter] = useState<TaskFilter>(emptyFilter);
  const [allEpics, setAllEpics] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragging, setDragging] = useState<Task | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const unit = data?.estimateUnit === "points" ? " sp" : "u";

  const openTask = (task: Task) => {
    if (task.boardId === board.board.id) onOpenItem(task.id);
    else router.push(`/boards/${task.boardId}?item=${task.id}`);
  };

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try { await fn(); } catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
    await reload();
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (!e.over || !data || !canEdit) return;
    const task = e.active.data.current?.task as Task | undefined;
    if (!task) return;
    const target = String(e.over.id) === "backlog" ? null : String(e.over.id).replace(/^sprint:/, "");
    if (task.sprintId === target) return;
    // optimistic move
    setData((cur) => {
      if (!cur) return cur;
      const moved = { ...task, sprintId: target };
      const strip = (xs: Task[]) => xs.filter((x) => x.id !== task.id);
      return { ...cur, backlog: target ? strip(cur.backlog) : [...strip(cur.backlog), moved], sprints: cur.sprints.map((s) => ({ ...s, tasks: s.id === target ? [...strip(s.tasks), moved] : strip(s.tasks) })) };
    });
    void run(() => api.put(`/api/v1/dev/items/${task.id}/sprint`, { sprintId: target }));
  };

  const visible = useMemo(() => {
    if (!data) return null;
    return { backlog: data.backlog.filter((x) => matchesFilter(x, filter)), sprints: data.sprints.map((s) => ({ ...s, shown: s.tasks.filter((x) => matchesFilter(x, filter)) })) };
  }, [data, filter]);

  if (!data || !visible) return <div className={styles.page}>{error ? <div className={styles.error}>{error}</div> : t("common.loading")}</div>;
  const completingSprint = data.sprints.find((s) => s.id === completing);
  const ofKlant = data.epics.filter((e) => !filter.klant || e.klant === filter.klant);
  const epicOptions = ofKlant.filter((e) => allEpics || !isClosedEpic(e.status) || e.id === filter.epic);
  const hiddenEpics = allEpics ? 0 : ofKlant.length - epicOptions.length;

  return (
    <div className={styles.page} data-testid="planning-view">
      <div className={styles.toolbar}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!canEdit} onClick={() => void run(() => api.post(`/api/v1/dev/boards/${data.sprintsBoardId}/sprints`, {}))} data-testid="create-sprint"><Icon icon={Add} size={16} ignoreFocusStyle />{t("dev.createSprint")}</button>
        <input className={styles.input} placeholder={t("dev.search")} value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} data-testid="planning-search" aria-label={t("dev.search")} />
        <Select value={filter.klant} onChange={(klant) => setFilter({ ...filter, klant })} options={data.klanten.map((k) => ({ value: k, label: k }))} placeholder={t("dev.allKlanten")} testId="filter-klant" />
        <Select value={filter.epic} onChange={(epic) => setFilter({ ...filter, epic })} options={epicOptions.map((e) => ({ value: e.id, label: e.klant && !filter.klant ? `${e.klant} · ${e.name}` : e.name }))} placeholder={t("dev.allEpics")} testId="filter-epic" />
        <ShowAllEpics checked={allEpics} onChange={setAllEpics} hidden={hiddenEpics} label={t("dev.showClosedEpics")} />
        <Select value={filter.owner} onChange={(owner) => setFilter({ ...filter, owner })} options={board.users.map((u) => ({ value: u.id, label: u.name }))} placeholder={t("dev.allOwners")} testId="filter-owner" />
      </div>
      {actionError ? <div className={styles.error} role="alert" data-testid="planning-error">{actionError}</div> : null}
      <DndContext id="planning-dnd" sensors={sensors} onDragStart={(e: DragStartEvent) => setDragging((e.active.data.current?.task as Task) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        {[...visible.sprints].sort((a, b) => Number(b.state === "active") - Number(a.state === "active")).map((s) => {
          const isCollapsed = collapsed[s.id];
          return (
            <Drop key={s.id} id={`sprint:${s.id}`} className={styles.section}>
              <div className={styles.sectionHead} data-testid="sprint-section" data-sprint-id={s.id} data-sprint-name={s.name} data-sprint-state={s.state}>
                <button type="button" className={styles.chev} onClick={() => setCollapsed({ ...collapsed, [s.id]: !isCollapsed })} aria-label="toggle"><Icon icon={isCollapsed ? DropdownChevronRight : DropdownChevronDown} size={18} ignoreFocusStyle /></button>
                <span className={styles.sectionTitle} data-testid="sprint-name">{s.name}</span>
                <Chip text={t(`dev.state.${s.state}`)} color={STATE_COLOR[s.state]} testId="sprint-state" />
                <span className={styles.counts}>{fmtDate(s.startsOn)} - {fmtDate(s.endsOn)}</span>
                <span className={styles.counts} data-testid="sprint-counts">{t("dev.counts", { count: s.tasks.length, points: Math.round(s.tasks.reduce((a, x) => a + x.points, 0) * 10) / 10, unit })}</span>
                <span className={styles.spacer} />
                {s.state === "planned" ? <button type="button" className={styles.btn} disabled={!canEdit} onClick={() => void run(() => api.post(`/api/v1/dev/sprints/${s.id}/start`))} data-testid="start-sprint">{t("dev.startSprint")}</button> : null}
                {s.state === "active" ? <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!canEdit} onClick={() => setCompleting(s.id)} data-testid="complete-sprint">{t("dev.completeSprint")}</button> : null}
                {s.state === "planned" ? <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={!canEdit} onClick={() => void run(() => api.del(`/api/v1/dev/sprints/${s.id}`))} data-testid="delete-sprint">{t("common.delete")}</button> : null}
                {s.goal ? <div className={styles.goal}>{s.goal}</div> : null}
              </div>
              {!isCollapsed ? (s.shown.length ? s.shown.map((x) => <TaskRow key={x.id} task={x} board={board} unit={unit} onOpen={openTask} canEdit={canEdit} past={data.pastSprints[x.id]} />) : <div className={styles.empty}>{t("dev.sprintEmpty")}</div>) : null}
            </Drop>
          );
        })}
        <Drop id="backlog" className={styles.section}>
          <div className={styles.sectionHead} data-testid="backlog-section">
            <span className={styles.sectionTitle}>{t("dev.backlog")}</span>
            <span className={styles.counts} data-testid="backlog-counts">{t("dev.counts", { count: data.backlog.length, points: Math.round(data.backlog.reduce((a, x) => a + x.points, 0) * 10) / 10, unit })}</span>
          </div>
          {visible.backlog.map((x) => <TaskRow key={x.id} task={x} board={board} unit={unit} onOpen={openTask} canEdit={canEdit} past={data.pastSprints[x.id]} />)}
          {!visible.backlog.length ? <div className={styles.empty}>{t("dev.backlogEmpty")}</div> : null}
          {data.taskBoard && canEdit ? (
            <form className={styles.addRow} onSubmit={(e) => {
              e.preventDefault();
              const name = newTask.trim();
              if (!name) return;
              setNewTask("");
              void run(() => api.post("/api/v1/items", { boardId: data.taskBoard!.id, groupId: data.taskBoard!.groupId, name, values: { status: "Backlog" } }));
            }}>
              <input className={styles.input} value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder={t("dev.addTask")} data-testid="backlog-add-input" aria-label={t("dev.addTask")} />
              <button type="submit" className={styles.btn} data-testid="backlog-add">{t("common.add")}</button>
            </form>
          ) : null}
        </Drop>
        <DragOverlay>{dragging ? <div className={styles.overlay}><TaskRowStatic task={dragging} board={board} unit={unit} onOpen={() => undefined} /></div> : null}</DragOverlay>
      </DndContext>
      {completingSprint ? <CompleteSprintDialog sprint={completingSprint} planned={data.sprints.filter((s) => s.state === "planned")} onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); void reload(); }} /> : null}
    </div>
  );
}
