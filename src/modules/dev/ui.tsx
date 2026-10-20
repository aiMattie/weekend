"use client";

import { useDraggable } from "@dnd-kit/core";
import { Icon } from "@vibe/core";
import { Drag } from "@vibe/icons";
import type { ReactNode } from "react";
import { UserAvatar, userById } from "@/components/columns/shared";
import type { BoardFull } from "@/lib/board-types";
import { contrastText } from "@/lib/colors";
import { useT } from "@/lib/i18n/client";
import type { Task } from "@/server/services/dev-config";
import styles from "./dev.module.css";

export const PRIO_COLORS: Record<string, string> = { P1: "#df2f4a", P2: "#fdab3d", P3: "#579bfc", P4: "#c4c4c4" };

export function Chip({ text, color, testId }: { text: string; color: string; testId?: string }) {
  return <span className={styles.chip} style={{ background: color, color: contrastText(color) }} data-testid={testId}>{text}</span>;
}

/** "↻ n": the task was already in n completed sprints (carried over). */
export function PastSprints({ count }: { count: number }) {
  const t = useT();
  return <span className={styles.past} title={t("dev.pastSprints", { count })} data-testid="past-sprints">↻{count}</span>;
}

/** Afgerond and Geparkeerd epics are hidden in pickers and the roadmap unless "show all" is on. */
export const isClosedEpic = (status: string | null | undefined): boolean => status === "Afgerond" || status === "Geparkeerd";

export function ShowAllEpics({ checked, onChange, hidden, label }: { checked: boolean; onChange: (v: boolean) => void; hidden: number; label: string }) {
  return (
    <label className={styles.counts} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid="show-all-epics" />
      {label}{hidden ? ` (${hidden})` : ""}
    </label>
  );
}

export function Avatars({ board, ids }: { board: BoardFull; ids: string[] }) {
  const users = ids.map((id) => userById(board, id)).filter((u): u is NonNullable<typeof u> => !!u);
  return <span className={styles.avatars}>{users.slice(0, 3).map((u) => <UserAvatar key={u.id} user={u} size="xs" />)}</span>;
}

export function Select({ value, onChange, options, placeholder, testId }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string; testId?: string }) {
  return (
    <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} aria-label={placeholder}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export interface TaskFilter { klant: string; epic: string; search: string; owner: string }
export const emptyFilter: TaskFilter = { klant: "", epic: "", search: "", owner: "" };

export const matchesFilter = (t: Task, f: TaskFilter): boolean =>
  (!f.klant || t.klant === f.klant) && (!f.epic || t.epicIds.includes(f.epic)) && (!f.owner || t.assigneeIds.includes(f.owner))
  && (!f.search || `${t.name} ${t.jiraKey ?? ""}`.toLowerCase().includes(f.search.toLowerCase()));

interface RowProps { task: Task; board: BoardFull; unit: string; onOpen: (t: Task) => void; canEdit: boolean; /** completed sprints the task was in before */ past?: number }

function RowBody({ task, board, unit, onOpen, past, drag, dragging, rowRef }: Omit<RowProps, "canEdit"> & { drag?: Record<string, unknown>; dragging?: boolean; rowRef?: (el: HTMLElement | null) => void }) {
  return (
    <div ref={rowRef} className={`${styles.task} ${dragging ? styles.taskDragging : ""} ${task.isDone ? styles.done : ""}`} data-testid="dev-task" data-task-id={task.id} data-task-name={task.name}>
      <button type="button" className={styles.handle} {...drag} aria-label="drag" data-testid="dev-task-handle"><Icon icon={Drag} size={16} ignoreFocusStyle /></button>
      <button type="button" className={styles.taskName} onClick={() => onOpen(task)} title={task.name} data-testid="dev-task-name">{task.jiraKey ? <span className={styles.muted}>{task.jiraKey} </span> : null}{task.name}</button>
      {past ? <PastSprints count={past} /> : null}
      <span className={styles.taskCell}>{task.klant ?? ""}</span>
      <span className={styles.taskCell} title={task.epicNames.join(", ")}>{task.epicNames.join(", ")}</span>
      <span>{task.prioriteit ? <Chip text={task.prioriteit} color={PRIO_COLORS[task.prioriteit] ?? "#c4c4c4"} /> : null}</span>
      <span>{task.status ? <Chip text={task.status} color={task.statusColor} /> : null}</span>
      <span className={`${styles.taskCell} ${styles.est}`}>{task.points ? `${task.points}${unit}` : ""}</span>
      <Avatars board={board} ids={task.assigneeIds} />
    </div>
  );
}

/** Draggable row of the planning view. */
export function TaskRow(props: RowProps) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: props.task.id, data: { task: props.task }, disabled: !props.canEdit });
  return <RowBody {...props} rowRef={setNodeRef} drag={{ ...attributes, ...listeners }} dragging={isDragging} />;
}

/** Non-draggable copy (drag overlay). */
export function TaskRowStatic(props: Omit<RowProps, "canEdit">) {
  return <RowBody {...props} />;
}

export function Section({ children }: { children: ReactNode }) {
  return <div className={styles.section}>{children}</div>;
}

export const fmtDate = (d: string | null): string => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) : "");
