/** Client registrations of the dev views (one import + entries in src/components/views/registry.tsx). */
import type { ComponentType } from "react";
import type { ViewProps } from "@/components/views/types";
import { BugsView } from "./bugs-view";
import { DashboardView } from "./dashboard-view";
import { PlanningView } from "./planning-view";
import { RetroView } from "./retro-view";
import { RoadmapView } from "./roadmap-view";
import { SprintBoardView } from "./sprint-board-view";

export const devViewComponents: Record<string, ComponentType<ViewProps>> = {
  dev_planning: PlanningView,
  dev_sprint_board: SprintBoardView,
  dev_dashboard: DashboardView,
  dev_roadmap: RoadmapView,
  dev_bugs: BugsView,
  dev_retro: RetroView,
};
