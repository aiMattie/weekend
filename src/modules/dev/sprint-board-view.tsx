"use client";

import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Icon } from "@vibe/core";
import { DropdownChevronDown, DropdownChevronRight } from "@vibe/icons";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ViewProps } from "@/components/views/types";
import { api } from "@/lib/api-client";
import { useViewSettings } from "@/modules/views/ui/use-view-settings";
import { useT } from "@/lib/i18n/client";
import type { Task } from "@/server/services/dev-config";
import type { Planning } from "@/server/services/sprint-read";
import { CompleteSprintDialog } from "./complete-sprint-dialog";
import { buildSwimlanes, type SprintGroupBy, type Swimlane } from "./swimlanes";
import { useDevData } from "./use-dev";
import { Avatars, Chip, PastSprints, emptyFilter, fmtDate, matchesFilter, PRIO_COLORS, Select, type TaskFilter } from "./ui";
import styles from "./dev.module.css";

interface CardProps { task: Task; board: ViewProps["board"]; onOpen: (t: Task) => void; past?: number }

function CardBody({ task, board, onOpen, past, ...rest }: CardProps & React.HTMLAttributes<HTMLDivElement> & { rowRef?: (el: HTMLElement | null) => void }) {
  const { rowRef, ...div } = rest;
  return (
    <div ref={rowRef as never} className={styles.card} {...div} data-testid="sprint-card" data-task-id={task.id} data-task-name={task.name}>
      <button type="button" className={styles.cardName} onClick={() => onOpen(task)}>{task.name}</button>
      <div className={styles.cardMeta}>
        {task.prioriteit ? <Chip text={task.prioriteit} color={PRIO_COLORS[task.prioriteit] ?? "#c4c4c4"} /> : null}
        {task.klant ? <span>{task.klant}</span> : null}
        {task.points ? <span>{task.points}u</span> : null}
        {past ? <PastSprints count={past} /> : null}
        <Avatars board={board} ids={task.assigneeIds} />
      </div>
    </div>
  );
}

function Card({ task, board, onOpen, canEdit, past }: CardProps & { canEdit: boolean }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id, data: { task }, disabled: !canEdit });
  return <CardBody task={task} board={board} onOpen={onOpen} past={past} rowRef={setNodeRef} style={{ opacity: isDragging ? 0.4 : 1 }} {...attributes} {...listeners} />;
}

function Lane({ status, color, count, laneKey, compact, children }: { status: string; color: string; count: number; laneKey: string; compact?: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${laneKey}|status:${status}` });
  return (
    <div ref={setNodeRef} className={`${styles.lane} ${compact ? styles.laneCompact : ""} ${isOver ? styles.laneOver : ""}`} data-testid="sprint-lane" data-status={status}>
      <div className={styles.laneBar} style={{ background: color }} />
      <div className={styles.laneHead}>{status}<span className={styles.muted}>{count}</span></div>
      {children}
    </div>
  );
}

/** Tasks of the active sprint as lanes per status, optionally in swimlanes per client / epic; drag a card to change its status. */
export function SprintBoardView({ board, view, actions, onOpenItem, canEdit, canEditStructure }: ViewProps) {
  const t = useT();
  const { settings, patch } = useViewSettings(view, actions, canEditStructure);
  const groupBy = (settings.groupBy as SprintGroupBy | undefined) ?? "klant_epic";
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const router = useRouter();
  const { data, setData, reload } = useDevData<Planning>(`/api/v1/dev/boards/${board.board.id}/planning`, board.board.id, (d) => d.sourceBoardIds);
  const [filter, setFilter] = useState<TaskFilter>(emptyFilter);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [completing, setCompleting] = useState(false);
  const [now] = useState(() => Date.now());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const sprint = data?.sprints.find((s) => s.state === "active");
  const tasks = useMemo(() => (sprint?.tasks ?? []).filter((x) => matchesFilter(x, filter)), [sprint, filter]);
  const swimlanes = useMemo(() => buildSwimlanes(tasks, groupBy, { noKlant: t("dev.noKlant"), noEpic: t("dev.noEpic") }), [tasks, groupBy, t]);

  if (!data) return <div className={styles.page}>{t("common.loading")}</div>;
  if (!sprint) return <div className={styles.page} data-testid="no-active-sprint"><div className={styles.empty}>{t("dev.noActiveSprint")}</div></div>;

  const open = (task: Task) => (task.boardId === board.board.id ? onOpenItem(task.id) : router.push(`/boards/${task.boardId}?item=${task.id}`));
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const task = e.active.data.current?.task as Task | undefined;
    if (!task || !e.over || !canEdit) return;
    const status = String(e.over.id).replace(/^.*\|status:/, "");
    if (status === task.status) return;
    const st = data.statuses.find((s) => s.text === status);
    setData((cur) => cur && { ...cur, sprints: cur.sprints.map((s) => ({ ...s, tasks: s.tasks.map((x) => (x.id === task.id ? { ...x, status, statusColor: st?.color ?? x.statusColor, isDone: !!st?.isDone } : x)) })) });
    void api.put(`/api/v1/dev/items/${task.id}/status`, { status }).finally(() => void reload());
  };
  const statuses = data.statuses.filter((s) => s.text !== "Backlog");
  const lanesRow = (laneKey: string, laneTasks: Task[], compact: boolean) => (
    <div className={styles.lanes}>
      {statuses.map((s) => {
        const mine = laneTasks.filter((x) => x.status === s.text);
        return (
          <Lane key={s.text} laneKey={laneKey} status={s.text} color={s.color} count={mine.length} compact={compact}>
            {mine.map((x) => <Card key={x.id} task={x} board={board} onOpen={open} canEdit={canEdit} past={data.pastSprints[x.id]} />)}
          </Lane>
        );
      })}
    </div>
  );
  const renderSwimlane = (lane: Swimlane, depth: number): React.ReactNode => {
    if (groupBy === "none") return <div key={lane.key}>{lanesRow(lane.key, lane.tasks, false)}</div>;
    const isCollapsed = !!collapsed[lane.key];
    const laneDone = lane.tasks.filter((x) => x.isDone).length;
    return (
      <div key={lane.key} className={depth ? styles.swimlaneSub : styles.swimlane} data-testid={depth ? "sprint-swimlane-epic" : "sprint-swimlane"} data-title={lane.title}>
        <div className={styles.swimlaneHead}>
          <button type="button" className={styles.chev} onClick={() => setCollapsed({ ...collapsed, [lane.key]: !isCollapsed })} aria-label="toggle" aria-expanded={!isCollapsed}><Icon icon={isCollapsed ? DropdownChevronRight : DropdownChevronDown} size={18} ignoreFocusStyle /></button>
          <span className={depth ? styles.swimlaneSubTitle : styles.swimlaneTitle}>{lane.title}</span>
          <span className={styles.counts}>{t("dev.doneOf", { done: laneDone, total: lane.tasks.length })}</span>
        </div>
        {isCollapsed ? null : lane.children.length ? lane.children.map((c) => renderSwimlane(c, depth + 1)) : lanesRow(lane.key, lane.tasks, true)}
      </div>
    );
  };
  const all = sprint.tasks;
  const done = all.filter((x) => x.isDone).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const daysLeft = sprint.endsOn ? Math.max(0, Math.ceil((Date.parse(`${sprint.endsOn}T23:59:59`) - now) / 86_400_000)) : null;

  return (
    <div className={styles.page} data-testid="sprint-board-view">
      <div className={styles.sprintHeader}>
        <span className={styles.sectionTitle}>{sprint.name}</span>
        <span className={styles.counts}>{fmtDate(sprint.startsOn)} - {fmtDate(sprint.endsOn)}{daysLeft !== null ? ` · ${t("dev.daysLeft", { days: daysLeft })}` : ""}</span>
        <div className={styles.progress} title={`${pct}%`}><div className={styles.progressFill} style={{ width: `${pct}%` }} /></div>
        <span className={styles.counts} data-testid="sprint-progress">{t("dev.doneOf", { done, total: all.length })}</span>
        <span className={styles.spacer} />
        <select className={styles.select} value={groupBy} onChange={(e) => patch({ groupBy: e.target.value })} data-testid="sprint-group-by" aria-label={t("dev.groupBy")}>
          <option value="klant_epic">{t("dev.groupBy.klantEpic")}</option>
          <option value="klant">{t("dev.groupBy.klant")}</option>
          <option value="none">{t("dev.groupBy.none")}</option>
        </select>
        <Select value={filter.klant} onChange={(klant) => setFilter({ ...filter, klant })} options={data.klanten.map((k) => ({ value: k, label: k }))} placeholder={t("dev.allKlanten")} />
        <Select value={filter.owner} onChange={(owner) => setFilter({ ...filter, owner })} options={board.users.map((u) => ({ value: u.id, label: u.name }))} placeholder={t("dev.allOwners")} />
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!canEdit} onClick={() => setCompleting(true)} data-testid="complete-sprint">{t("dev.completeSprint")}</button>
      </div>
      {sprint.goal ? <div className={styles.goal} style={{ marginBottom: 12 }}>{t("dev.goal")}: {sprint.goal}</div> : null}
      <DndContext id="sprint-dnd" sensors={sensors} onDragStart={(e) => setDragging((e.active.data.current?.task as Task) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        {swimlanes.map((lane) => renderSwimlane(lane, 0))}
        <DragOverlay>{dragging ? <CardBody task={dragging} board={board} onOpen={() => undefined} /> : null}</DragOverlay>
      </DndContext>
      {completing ? <CompleteSprintDialog sprint={sprint} planned={data.sprints.filter((s) => s.state === "planned")} onClose={() => setCompleting(false)} onDone={() => { setCompleting(false); void reload(); }} /> : null}
    </div>
  );
}
