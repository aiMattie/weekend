/** MCP tools: sprint lifecycle on a Weekend dev sprint board (create, update, start, complete) and the sprint length. */
import { z } from "zod";
import * as services from "@/server/services";
import { assertBoardInScope } from "@/server/platform/scope";
import { id } from "../util";
import type { McpToolDefinition } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tool<T = any> = McpToolDefinition<T>;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

/** Board of a sprint, checked against the token's workspace scope. */
const sprintInScope = (actor: Parameters<Tool["handler"]>[0], sprintId: string) => {
  const s = services.sprints.getSprintRow(sprintId);
  assertBoardInScope(actor, s.boardId);
  return s;
};

const createSprint: Tool = {
  name: "create_sprint", description: "Create a planned sprint on a sprint board. Without dates it starts the Monday after the last sprint and lasts the board's sprint length.",
  inputSchema: z.object({ board_id: id, name: z.string().optional(), goal: z.string().optional(), starts_on: date.optional(), ends_on: date.optional() }),
  handler(actor, i) {
    assertBoardInScope(actor, i.board_id);
    return services.sprints.createSprint(actor, { boardId: i.board_id, name: i.name, goal: i.goal, startsOn: i.starts_on, endsOn: i.ends_on });
  },
};
const updateSprint: Tool = {
  name: "update_sprint", description: "Change the name, goal or dates of a planned or active sprint.",
  inputSchema: z.object({ sprint_id: id, name: z.string().optional(), goal: z.string().nullish(), starts_on: date.optional(), ends_on: date.optional() }),
  handler(actor, i) {
    sprintInScope(actor, i.sprint_id);
    return services.sprints.updateSprint(actor, i.sprint_id, { name: i.name, goal: i.goal, startsOn: i.starts_on, endsOn: i.ends_on });
  },
};
const startSprint: Tool = {
  name: "start_sprint", description: "Start a planned sprint (the board may have no other active sprint). Its tasks become the committed scope.",
  inputSchema: z.object({ sprint_id: id }),
  handler(actor, i) {
    sprintInScope(actor, i.sprint_id);
    return services.sprints.startSprint(actor, i.sprint_id);
  },
};
const completeSprint: Tool = {
  name: "complete_sprint", description: "Complete the active sprint. Unfinished tasks move to the next planned sprint (created when there is none) or to the backlog.",
  inputSchema: z.object({ sprint_id: id, carry_over: z.enum(["next", "backlog"]).default("next"), next_sprint_id: id.optional() }),
  handler(actor, i) {
    sprintInScope(actor, i.sprint_id);
    return services.sprints.completeSprint(actor, i.sprint_id, { carryOver: i.carry_over, nextSprintId: i.next_sprint_id });
  },
};
const updateSprintSettings: Tool = {
  name: "update_sprint_settings", description: "Set the sprint length (1-4 weeks) of a sprint board. Applies to sprints created or started from now on.",
  inputSchema: z.object({ board_id: id, sprint_weeks: z.number().int().min(1).max(4) }),
  handler(actor, i) {
    assertBoardInScope(actor, i.board_id);
    return services.sprints.updateSprintSettings(actor, i.board_id, { sprintWeeks: i.sprint_weeks });
  },
};

export const devSprintTools: Tool[] = [createSprint, updateSprint, startSprint, completeSprint, updateSprintSettings];
