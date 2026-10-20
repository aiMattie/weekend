import type { ViewTypeDefinition } from "./types";

const dev = (type: string, label: string, icon: string, description: string): ViewTypeDefinition => ({ type, label, icon, description, defaultSettings: () => ({}) });

/** Weekend dev views (module dev). They only make sense on boards that are part of a Development workspace. */
export const devViews: ViewTypeDefinition[] = [
  dev("dev_planning", "Sprint planning", "Calendar", "Backlog and sprints: drag tasks into a sprint, start and complete sprints"),
  dev("dev_sprint_board", "Active sprint", "Board", "Tasks of the active sprint by status"),
  dev("dev_dashboard", "Sprint dashboard", "Chart", "Burndown, velocity, scope change, cycle time and workload"),
  dev("dev_roadmap", "Epic roadmap", "Timeline", "Epics with phase and progress"),
  dev("dev_bugs", "Bug overview", "Bug", "Bugs with time to resolution"),
  dev("dev_retro", "Retrospective", "Thumbs", "Keep, Improve and Discussion cards with voting"),
];
