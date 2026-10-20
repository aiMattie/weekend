/** MCP prompts: weekly_status, sprint_report, board_overview. They embed a data digest and tell the model which tools to use. */
import type { Actor } from "@/lib/actor";
import { ValidationError } from "@/lib/errors";
import * as services from "@/server/services";
import { assertBoardInScope } from "@/server/platform/scope";
import { boardInsights } from "./board-digest";

interface PromptDef { name: string; description: string; arguments: { name: string; description: string; required?: boolean }[] }

const PROMPTS: PromptDef[] = [
  { name: "weekly_status", description: "Write a weekly status update for a board (progress, blockers, overdue items, next steps).", arguments: [{ name: "board_id", description: "Board id", required: true }, { name: "audience", description: "Who reads it (default: the team)" }] },
  { name: "sprint_report", description: "Report on the active sprint of a Weekend dev sprint board: scope, burndown, carry-over.", arguments: [{ name: "board_id", description: "Sprint board id", required: true }, { name: "sprint_id", description: "Sprint id (default: active sprint)" }] },
  { name: "board_overview", description: "Explain the structure of a board and suggest improvements (columns, groups, automations).", arguments: [{ name: "board_id", description: "Board id", required: true }] },
];

export const listPrompts = () => PROMPTS;

const msg = (text: string) => ({ role: "user" as const, content: { type: "text" as const, text } });

export function getPrompt(actor: Actor, name: string, args: Record<string, string>) {
  const def = PROMPTS.find((p) => p.name === name);
  if (!def) throw new ValidationError(`Unknown prompt ${name}`);
  const boardId = args.board_id;
  if (!boardId) throw new ValidationError("board_id is required");
  assertBoardInScope(actor, boardId);
  const insights = boardInsights(actor, boardId);
  const digest = JSON.stringify(insights, null, 2);
  if (name === "weekly_status") {
    return {
      description: def.description,
      messages: [msg(`Write a concise weekly status update (Dutch unless asked otherwise) for ${args.audience ?? "the team"} about board "${insights.board.name}".\nStructure: Voortgang, Aandachtspunten/blokkades, Te laat, Volgende stappen.\nUse get_board_items_page and get_board_activity for details when needed.\n\nData digest:\n${digest}`)],
    };
  }
  if (name === "sprint_report") {
    let sprintData = "(no sprint data available: call get_sprints_metadata and get_sprint_summary)";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sprints = (services as Record<string, any>).sprints;
      if (sprints?.sprintsMetadata) sprintData = JSON.stringify(sprints.sprintsMetadata(actor, boardId), null, 2);
    } catch { /* keep default */ }
    return {
      description: def.description,
      messages: [msg(`Write a sprint report for board "${insights.board.name}"${args.sprint_id ? ` (sprint ${args.sprint_id})` : " (active sprint)"}: goal, what was done, what is carried over, risks. Use get_sprint_summary for the numbers.\n\nSprint metadata:\n${sprintData}\n\nBoard digest:\n${digest}`)],
    };
  }
  return {
    description: def.description,
    messages: [msg(`Explain the structure of board "${insights.board.name}" (columns, groups, how items flow) and suggest 3 concrete improvements. Use get_board_info and list_automations to check details.\n\nDigest:\n${digest}`)],
  };
}
