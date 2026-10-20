"use client";

import { Icon } from "@vibe/core";
import { Calendar, Chart, Files, Form, Gallery, Gantt, Graph, Location, Table, Team, Timeline } from "@vibe/icons";
import type { ComponentType } from "react";

/** Kanban has no Vibe icon: three lanes drawn inline. */
const KanbanIcon = ({ size = 16 }: { size?: number | string; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <rect x="2" y="3" width="4.5" height="14" rx="1.2" opacity=".9" />
    <rect x="7.75" y="3" width="4.5" height="9" rx="1.2" />
    <rect x="13.5" y="3" width="4.5" height="11.5" rx="1.2" opacity=".75" />
  </svg>
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICONS: Record<string, any> = { table: Table, kanban: KanbanIcon, calendar: Calendar, timeline: Timeline, gantt: Gantt, workload: Team, cards: Gallery, chart: Graph, map: Location, files: Files, form: Form };
const COLORS: Record<string, string> = { table: "#0073ea", kanban: "#00c875", calendar: "#fdab3d", timeline: "#a25ddc", gantt: "#ff158a", workload: "#579bfc", cards: "#ff642e", chart: "#df2f4a", map: "#037f4c", files: "#7f5347", form: "#784bd1" };

export const viewTypeColor = (type: string): string => COLORS[type] ?? "#676879";

export function ViewTypeIcon({ type, size = 16, colored }: { type: string; size?: number; colored?: boolean }) {
  const icon = (ICONS[type] ?? Chart) as ComponentType;
  return <span style={{ display: "inline-flex", color: colored ? viewTypeColor(type) : undefined }}><Icon icon={icon as never} size={size} ignoreFocusStyle /></span>;
}
