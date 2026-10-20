/** MCP tools: docs, dashboards, views, forms, automations/workflows, agents, meetings, sprints. */
import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import * as services from "@/server/services";
import { assertBoardInScope, assertWorkspaceInScope } from "@/server/platform/scope";
import { id, idList, jsonArray, jsonObject } from "../util";
import type { McpToolDefinition } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tool<T = any> = McpToolDefinition<T>;
const doc = (d: { id: string; title: string; workspaceId: string; itemId: string | null; updatedAt: string }) => ({ id: d.id, title: d.title, workspace_id: d.workspaceId, item_id: d.itemId, url: `/docs/${d.id}`, updated_at: d.updatedAt });

/* ---------------------------------------------------------------- docs */
const createDoc: Tool = {
  name: "create_doc", description: "Create a WorkDoc in a workspace (or attached to an item). Provide markdown or ProseMirror blocks.",
  inputSchema: z.object({ workspace_id: id.optional(), item_id: id.optional(), column_id: z.string().optional(), title: z.string().optional(), name: z.string().optional(), markdown: z.string().optional(), blocks: jsonObject.optional(), visibility: z.enum(["main", "private"]).optional() }),
  handler(actor, i) {
    if (!i.workspace_id && !i.item_id) throw new ValidationError("workspace_id or item_id is required");
    return doc(services.docs.create(actor, { workspaceId: i.workspace_id, itemId: i.item_id, columnId: i.column_id, title: i.title ?? i.name, markdown: i.markdown, blocks: i.blocks, visibility: i.visibility }));
  },
};
const updateDoc: Tool = {
  name: "update_doc", description: "Update a doc: title, replace content (markdown or blocks) or append markdown.",
  inputSchema: z.object({ doc_id: id, title: z.string().optional(), markdown: z.string().optional(), append_markdown: z.string().optional(), blocks: jsonObject.optional() }),
  handler: (actor, i) => doc(services.docs.update(actor, i.doc_id, { title: i.title, markdown: i.markdown, appendMarkdown: i.append_markdown, blocks: i.blocks })),
};
const readDocs: Tool = {
  name: "read_docs", description: "Read docs as markdown (or blocks): by id, or all docs of a workspace or item.",
  inputSchema: z.object({ doc_id: id.optional(), ids: idList.optional(), workspace_id: id.optional(), item_id: id.optional(), format: z.enum(["markdown", "blocks", "both"]).default("markdown") }),
  handler: (actor, i) => ({ docs: services.docs.read(actor, { ids: [...(i.ids ?? []), ...(i.doc_id ? [i.doc_id] : [])], workspaceId: i.workspace_id, itemId: i.item_id, format: i.format }) }),
};

/* ---------------------------------------------------------------- dashboards */
const createDashboard: Tool = {
  name: "create_dashboard", description: "Create a dashboard that reads from one or more boards.",
  inputSchema: z.object({ workspace_id: id.optional(), name: z.string().optional(), title: z.string().optional(), board_ids: idList.default([]), description: z.string().optional() }),
  handler(actor, i) {
    const name = i.name ?? i.title;
    if (!name) throw new ValidationError("name is required");
    const d = services.dashboards.create(actor, { workspaceId: i.workspace_id, name, boardIds: i.board_ids, description: i.description });
    return { id: d.id, name: d.name, workspace_id: d.workspaceId, board_ids: d.boardIds, url: `/dashboards/${d.id}` };
  },
};
const createWidget: Tool = {
  name: "create_widget", description: "Add a widget to a dashboard. Use all_widgets_schema for the types and their settings.",
  inputSchema: z.object({ dashboard_id: id, type: z.string().optional(), widget_type: z.string().optional(), title: z.string().optional(), settings: jsonObject.optional(), config: jsonObject.optional(), layout: jsonObject.optional() }),
  handler(actor, i) {
    const type = i.type ?? i.widget_type;
    if (!type) throw new ValidationError("type is required");
    const w = services.dashboards.createWidget(actor, i.dashboard_id, { type, title: i.title, settings: i.settings ?? i.config, layout: i.layout });
    return { id: w.id, dashboard_id: w.dashboardId, type: w.type, title: w.title, settings: w.settings, layout: w.layout };
  },
};
const allWidgetsSchema: Tool = {
  name: "all_widgets_schema", description: "All widget types with description and JSON schema of their settings.",
  inputSchema: z.object({}),
  handler: () => ({ widgets: services.dashboards.allWidgetsSchema() }),
};

/* ---------------------------------------------------------------- views */
const viewOut = (v: { id: string; boardId: string; name: string; type: string; settings: unknown; filters: unknown; sort: unknown }) => ({ id: v.id, board_id: v.boardId, name: v.name, type: v.type, settings: v.settings, filters: v.filters, sort: v.sort });
const createView: Tool = {
  name: "create_view", description: "Create a view on a board (table, kanban, calendar, timeline, gantt, workload, cards, chart, map, files).",
  inputSchema: z.object({ board_id: id, name: z.string().min(1), type: z.string().default("table"), settings: jsonObject.optional(), filters: jsonArray.optional(), sort: jsonArray.optional() }),
  handler: (actor, i) => viewOut(services.views.create(actor, i.board_id, { name: i.name, type: i.type, settings: i.settings, filters: i.filters, sort: i.sort })),
};
const updateView: Tool = {
  name: "update_view", description: "Update a view's name, settings, saved filters or sort.",
  inputSchema: z.object({ view_id: id, name: z.string().optional(), settings: jsonObject.optional(), filters: jsonArray.optional(), sort: jsonArray.optional() }),
  handler: (actor, i) => viewOut(services.views.update(actor, i.view_id, { name: i.name, settings: i.settings, filters: i.filters, sort: i.sort })),
};
const createViewTable: Tool = {
  name: "create_view_table", description: "Create a table view with hidden columns, grouping and filters in one call.",
  inputSchema: z.object({ board_id: id, name: z.string().min(1), hidden_column_ids: z.array(z.string()).optional(), group_by_column_id: z.string().nullish(), filters: jsonArray.optional(), sort: jsonArray.optional() }),
  handler(actor, i) {
    const cols = services.columns.list(actor, i.board_id);
    const toId = (r: string) => cols.find((c) => c.key === r || c.id === r)?.id ?? r;
    return viewOut(services.views.create(actor, i.board_id, { name: i.name, type: "table", settings: { hiddenColumnIds: (i.hidden_column_ids ?? []).map(toId), groupByColumnId: i.group_by_column_id ? toId(i.group_by_column_id) : null }, filters: i.filters, sort: i.sort }));
  },
};
const updateViewTable: Tool = {
  name: "update_view_table", description: "Update a table view: column visibility, grouping, filters, sort. Pass board_id for speed.",
  inputSchema: z.object({ view_id: id, board_id: id.optional(), name: z.string().optional(), hidden_column_ids: z.array(z.string()).optional(), group_by_column_id: z.string().nullish(), filters: jsonArray.optional(), sort: jsonArray.optional() }),
  handler(actor, i) {
    const boardIds = i.board_id ? [i.board_id] : services.boards.list(actor).map((b) => b.id);
    let cur: ReturnType<typeof services.views.list>[number] | undefined;
    for (const b of boardIds) { cur = services.views.list(actor, b).find((v) => v.id === i.view_id); if (cur) break; }
    if (!cur) throw new ValidationError(`View ${i.view_id} not found`);
    const cols = services.columns.list(actor, cur.boardId);
    const toId = (r: string) => cols.find((c) => c.key === r || c.id === r)?.id ?? r;
    const settings = { ...cur.settings };
    if (i.hidden_column_ids) settings.hiddenColumnIds = i.hidden_column_ids.map(toId);
    if (i.group_by_column_id !== undefined) settings.groupByColumnId = i.group_by_column_id ? toId(i.group_by_column_id) : null;
    return viewOut(services.views.update(actor, i.view_id, { name: i.name, settings, filters: i.filters, sort: i.sort }));
  },
};

/* ---------------------------------------------------------------- forms */
const formOut = (r: { form: Record<string, unknown>; questions: unknown[] }) => ({ form: r.form, questions: r.questions });
const createForm: Tool = {
  name: "create_form", description: "Create a WorkForm for a board (or in a workspace with a new backing board). Questions are created from the board's columns.",
  inputSchema: z.object({ board_id: id.optional(), workspace_id: id.optional(), name: z.string().optional(), title: z.string().optional() }),
  handler(actor, i) {
    const name = i.name ?? i.title;
    if (!name) throw new ValidationError("name is required");
    return formOut(services.forms.create(actor, { boardId: i.board_id, workspaceId: i.workspace_id, name }) as never);
  },
};
const getForm: Tool = {
  name: "get_form", description: "Get a form with its questions, by form_id or public form_token.",
  inputSchema: z.object({ form_id: id.optional(), form_token: z.string().optional() }),
  async handler(actor, i) {
    if (i.form_id) return formOut(services.forms.get(actor, i.form_id) as never);
    if (i.form_token) return services.forms.getPublic(i.form_token, {});
    throw new ValidationError("form_id or form_token is required");
  },
};
const updateForm: Tool = {
  name: "update_form", description: "Update a form: name, settings (description, colors, thank-you message ...) and published state.",
  inputSchema: z.object({ form_id: id, name: z.string().optional(), settings: jsonObject.optional(), published: z.boolean().optional() }),
  handler(actor, i) {
    let f = services.forms.update(actor, i.form_id, { name: i.name, settings: i.settings });
    if (i.published !== undefined) f = services.forms.setPublished(actor, i.form_id, i.published);
    return { form: f };
  },
};
const formQuestionsEditor: Tool = {
  name: "form_questions_editor", description: "Edit form questions in one atomic batch. operations: [{op:'add',question:{columnId|kind,title,required...}}|{op:'update',questionId,patch}|{op:'delete',questionId}|{op:'reorder',questionIds}].",
  inputSchema: z.object({ form_id: id, operations: jsonArray.optional(), questions: jsonArray.optional() }),
  handler: (actor, i) => ({ questions: services.forms.questionsEditor(actor, i.form_id, i.operations ?? i.questions ?? []) }),
};
const createFormSubmission: Tool = {
  name: "create_form_submission", description: "Submit answers to a form (creates an item). answers is keyed by question id, column id or title.",
  inputSchema: z.object({ form_id: id, answers: jsonObject }),
  handler: (actor, i) => services.forms.createSubmission(actor, i.form_id, i.answers),
};

/* ---------------------------------------------------------------- automations + workflows */
const automationOut = (a: { id: string; name: string; boardId: string | null; active: boolean; kind?: string }) => ({ id: a.id, name: a.name, board_id: a.boardId, active: a.active, kind: a.kind });
const listAutomations: Tool = {
  name: "list_automations", description: "List the automations (and workflows) of a board.",
  inputSchema: z.object({ board_id: id.optional(), kind: z.enum(["automation", "workflow"]).optional() }),
  handler: (actor, i) => ({ automations: services.automations.list(actor, { boardId: i.board_id, kind: i.kind }).map((a) => ({ ...automationOut(a as never), last_run_status: (a as { lastRunStatus?: string | null }).lastRunStatus ?? null })) }),
};
const manageAutomations: Tool = {
  name: "manage_automations", description: "Activate, deactivate, duplicate, delete an automation or get its run history. action: activate | deactivate | duplicate | delete | runs.",
  inputSchema: z.object({ automation_id: id, action: z.enum(["activate", "deactivate", "toggle", "duplicate", "delete", "runs"]) }),
  handler(actor, i) {
    switch (i.action) {
      case "activate": return automationOut(services.automations.toggle(actor, i.automation_id, true) as never);
      case "deactivate": return automationOut(services.automations.toggle(actor, i.automation_id, false) as never);
      case "toggle": return automationOut(services.automations.toggle(actor, i.automation_id) as never);
      case "duplicate": return automationOut(services.automations.duplicate(actor, i.automation_id) as never);
      case "delete": services.automations.remove(actor, i.automation_id); return { deleted: true, automation_id: i.automation_id };
      default: return { runs: services.automations.listRuns(actor, { automationId: i.automation_id, limit: 25 }) };
    }
  },
};
const createAutomation: Tool = {
  name: "create_automation", description: "Create an automation from a sentence (\"when status changes to Done, move the item to group Afgerond\") or from an explicit definition {name, trigger, steps}.",
  inputSchema: z.object({ board_id: id, description: z.string().optional(), text: z.string().optional(), name: z.string().optional(), trigger: jsonObject.optional(), conditions: jsonArray.optional(), steps: jsonArray.optional() }),
  handler(actor, i) {
    const text = i.description ?? i.text;
    if (text && !i.trigger) return services.ai.nl.createFromText(actor, { boardId: i.board_id, text, name: i.name }).then((a) => automationOut(a as never));
    if (!i.trigger || !i.steps) throw new ValidationError("Provide description (a sentence) or trigger + steps");
    return automationOut(services.automations.create(actor, { boardId: i.board_id, name: i.name ?? "Automation", trigger: i.trigger, conditions: i.conditions, steps: i.steps }) as never);
  },
};
const planWorkflow: Tool = {
  name: "plan_workflow", description: "Plan a workflow from a process description. Returns the proposed definition and notes without creating anything.",
  inputSchema: z.object({ board_id: id, process_description: z.string().optional(), text: z.string().optional() }),
  handler: (actor, i) => services.ai.nl.planWorkflow(actor, { boardId: i.board_id, text: i.process_description ?? i.text ?? "" }),
};
const createWorkflow: Tool = {
  name: "create_workflow", description: "Create a workflow (draft) on a board from text or a graph.",
  inputSchema: z.object({ board_id: id, name: z.string().min(1), text: z.string().optional(), process_description: z.string().optional(), graph: jsonObject.optional() }),
  handler: (actor, i) => services.ai.nl.createWorkflow(actor, { boardId: i.board_id, name: i.name, text: i.text ?? i.process_description, graph: i.graph }).then((w) => automationOut(w as never)),
};
const updateWorkflow: Tool = {
  name: "update_workflow", description: "Update a workflow by prompt (text) or patch (name, graph).",
  inputSchema: z.object({ workflow_id: id, prompt: z.string().optional(), name: z.string().optional(), graph: jsonObject.optional() }),
  async handler(actor, i) {
    const patch: Record<string, unknown> = {};
    if (i.name) patch.name = i.name;
    if (i.graph) patch.graph = i.graph;
    if (i.prompt) {
      const wf = services.automations.get(actor, i.workflow_id);
      if (!wf.boardId) throw new ValidationError("Workflow has no board");
      const plan = await services.ai.nl.planWorkflow(actor, { boardId: wf.boardId, text: i.prompt });
      if (!plan.definition) throw new ValidationError(`Could not understand the prompt: ${plan.notes.join("; ")}`);
      Object.assign(patch, plan.definition);
    }
    return automationOut(services.automations.updateWorkflow(actor, i.workflow_id, patch) as never);
  },
};
const publishWorkflow: Tool = {
  name: "publish_workflow", description: "Publish (or unpublish with publish=false) a workflow.",
  inputSchema: z.object({ workflow_id: id, publish: z.boolean().default(true) }),
  handler: (actor, i) => automationOut(services.automations.publishWorkflow(actor, i.workflow_id, i.publish) as never),
};

/* ---------------------------------------------------------------- agents (ai module) */
const agentOut = (a: services.agents.AgentDto) => ({
  id: a.id, name: a.name, description: a.description, status: a.status, instructions: a.instructions, owner_id: a.ownerId, identity_user_id: a.userId, template: a.templateKey,
  limits: { max_steps: a.maxSteps, max_tokens: a.maxTokens, max_runs_per_hour: a.maxRunsPerHour },
  triggers: a.triggers.map((t) => ({ id: t.id, type: t.type, config: t.config, active: t.active })),
  skills: a.skills.map((s) => ({ id: s.id, name: s.name, instruction: s.instruction, tools: s.tools })),
  knowledge: a.knowledge.map((k) => ({ id: k.id, kind: k.kind, ref_id: k.refId, access: k.access, name: k.name })),
  last_run: a.lastRun,
});
const manageAgent: Tool = {
  name: "manage_agent", description: "Manage AI agents. action: list | get | create | update | delete | run. config for create/update: {name, description, instructions, status (active|paused|draft), model, max_steps, max_tokens, max_runs_per_hour, user_id (link an AI user like Scout)}; run takes config {input, board_id, item_id} and returns the finished run with transcript and tool calls.",
  inputSchema: z.object({ action: z.enum(["list", "get", "create", "update", "delete", "run"]), agent_id: id.optional(), config: jsonObject.optional() }),
  async handler(actor, i) {
    const c = (i.config ?? {}) as Record<string, unknown>;
    const cfg = { name: c.name, description: c.description, instructions: c.instructions, status: c.status, model: c.model, avatar: c.avatar, userId: c.user_id ?? c.userId, maxSteps: c.max_steps ?? c.maxSteps, maxTokens: c.max_tokens ?? c.maxTokens, maxRunsPerHour: c.max_runs_per_hour ?? c.maxRunsPerHour };
    const need = () => { if (!i.agent_id) throw new ValidationError("agent_id is required"); return i.agent_id; };
    switch (i.action) {
      case "list": return { agents: services.agents.list(actor).map(agentOut) };
      case "get": return agentOut(services.agents.get(actor, need()));
      case "create": return agentOut(services.agents.create(actor, cfg));
      case "update": return agentOut(services.agents.update(actor, need(), cfg));
      case "delete": return services.agents.remove(actor, need());
      default: { const r = await services.agents.run(actor, need(), { input: c.input, boardId: c.board_id ?? c.boardId, itemId: c.item_id ?? c.itemId }); return { run_id: r.id, status: r.status, result: r.result, error: r.error, steps: r.steps, credits: r.credits, tool_calls: r.toolCalls.map((t) => ({ name: t.name, error: !!t.error })) }; }
    }
  },
};
const manageAgentTriggers: Tool = {
  name: "manage_agent_triggers", description: "Manage the triggers of an AI agent (list | add | remove). trigger: {type: item_created|column_changed|mention|schedule|manual, config}. item_created/column_changed need config.board_id (column_changed also column_id, label_text); schedule needs {every: day|weekday|week, time: 'HH:MM', weekday}. Remove with trigger_id.",
  inputSchema: z.object({ agent_id: id, action: z.enum(["list", "add", "remove"]).default("list"), trigger: jsonObject.optional(), trigger_id: z.string().optional() }),
  handler(actor, i) {
    if (i.action === "add") {
      const t = (i.trigger ?? {}) as { type?: string; config?: Record<string, unknown> };
      const cfg = { ...(t.config ?? {}) } as Record<string, unknown>;
      if (cfg.board_id) { cfg.boardId = cfg.board_id; delete cfg.board_id; }
      if (cfg.column_id) { cfg.columnId = cfg.column_id; delete cfg.column_id; }
      if (cfg.label_text) { cfg.labelText = cfg.label_text; delete cfg.label_text; }
      return services.agents.addTrigger(actor, i.agent_id, { type: t.type, config: cfg });
    }
    if (i.action === "remove") { if (!i.trigger_id) throw new ValidationError("trigger_id is required"); return services.agents.removeTrigger(actor, i.agent_id, i.trigger_id); }
    return { triggers: services.agents.listTriggers(actor, { agent_id: i.agent_id }) };
  },
};
const manageAgentSkills: Tool = {
  name: "manage_agent_skills", description: "Manage the skills of an AI agent (list | add | remove). A skill is a named instruction plus a tool allow-list. add takes name, instruction, tools (names from agent_catalog); remove takes skill_id. Without skills an agent may use every tool its knowledge allows.",
  inputSchema: z.object({ agent_id: id, action: z.enum(["list", "add", "remove"]).default("list"), skill_id: z.string().optional(), name: z.string().optional(), instruction: z.string().optional(), tools: z.array(z.string()).optional() }),
  handler(actor, i) {
    if (i.action === "add") return services.agents.addSkill(actor, i.agent_id, { name: i.name, instruction: i.instruction ?? "", tools: i.tools ?? [] });
    if (i.action === "remove") { if (!i.skill_id) throw new ValidationError("skill_id is required"); return services.agents.removeSkill(actor, i.agent_id, i.skill_id); }
    return { skills: services.agents.listSkills(actor, i.agent_id) };
  },
};
const manageAgentKnowledge: Tool = {
  name: "manage_agent_knowledge", description: "Manage the knowledge of an AI agent: the boards and docs it may read (access read) or read and write (access write). action: list | add | remove. add takes board_id or doc_id plus access; remove takes knowledge_id. The agent can never do more than these grants, and you cannot grant more than you may do yourself.",
  inputSchema: z.object({ agent_id: id, action: z.enum(["list", "add", "remove"]).default("list"), board_id: id.optional(), doc_id: id.optional(), access: z.enum(["read", "write"]).default("read"), knowledge_id: z.string().optional() }),
  handler(actor, i) {
    if (i.action === "add") {
      if (!i.board_id && !i.doc_id) throw new ValidationError("board_id or doc_id is required");
      return services.agents.addKnowledge(actor, i.agent_id, i.board_id ? { kind: "board", refId: i.board_id, access: i.access } : { kind: "doc", refId: i.doc_id, access: i.access });
    }
    if (i.action === "remove") { if (!i.knowledge_id) throw new ValidationError("knowledge_id is required"); return services.agents.removeKnowledge(actor, i.agent_id, i.knowledge_id); }
    return { knowledge: services.agents.listKnowledge(actor, i.agent_id) };
  },
};
const agentCatalog: Tool = {
  name: "agent_catalog", description: "Catalog of ready-made AI agents (Lead Scorer, Ticket Assignment, Risk Analyzer, Meeting Summarizer, Daily Briefer, Sprint Reporter, Hours Checker) and the tools an agent can use. Pass install: {template, board_id} to create one from a template.",
  inputSchema: z.object({ install: jsonObject.optional() }),
  handler(actor, i) {
    if (i.install) { const x = i.install as { template?: string; board_id?: string; name?: string; activate?: boolean }; return agentOut(services.agents.installTemplate(actor, { templateKey: x.template, boardId: x.board_id, name: x.name, activate: x.activate })); }
    return services.agents.catalog(actor);
  },
};

/* ---------------------------------------------------------------- meetings + sprints */
const getNotetakerMeetings: Tool = {
  name: "get_notetaker_meetings", description: "List recorded meetings with summary and action items (notetaker).",
  inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20), cursor: z.string().optional() }),
  handler: (actor, i) => services.notetaker.listMeetings(actor, { limit: i.limit, cursor: i.cursor }),
};
const getSprintsBoards: Tool = {
  name: "get_weekend_dev_sprints_boards", description: "List the Weekend dev sprint boards (with their source task boards).",
  inputSchema: z.object({}),
  handler: (actor) => ({ boards: (services.sprints.listSprintBoards(actor) as { workspaceId: string }[]).filter((b) => !actor.token?.workspaceIds || actor.token.workspaceIds.includes(b.workspaceId)) }),
};
const getSprintsMetadata: Tool = {
  name: "get_sprints_metadata", description: "Sprints of a sprint board with state, dates, task counts and points.",
  inputSchema: z.object({ board_id: id }),
  handler: (actor, i) => { assertBoardInScope(actor, i.board_id); return services.sprints.sprintsMetadata(actor, i.board_id); },
};
const getSprintSummary: Tool = {
  name: "get_sprint_summary", description: "Summary of a sprint: totals, status and assignee breakdown, burndown, completed and unfinished items.",
  inputSchema: z.object({ sprint_id: id, board_id: id.optional() }),
  handler: (actor, i) => services.sprints.summary(actor, i.sprint_id),
};

void assertWorkspaceInScope;
export const extraTools: Tool[] = [
  createDoc, updateDoc, readDocs, createDashboard, createWidget, allWidgetsSchema,
  createView, updateView, createViewTable, updateViewTable,
  createForm, getForm, updateForm, formQuestionsEditor, createFormSubmission,
  listAutomations, manageAutomations, createAutomation, planWorkflow, createWorkflow, updateWorkflow, publishWorkflow,
  manageAgent, manageAgentTriggers, manageAgentSkills, manageAgentKnowledge, agentCatalog,
  getNotetakerMeetings, getSprintsBoards, getSprintsMetadata, getSprintSummary,
];
