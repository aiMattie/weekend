/** MCP tools: GraphQL access (all_weekend_api, get_graphql_schema, get_type_details) and UI components. */
import { execute, parse, validate, getNamedType, isObjectType, isInterfaceType, isEnumType, isInputObjectType, isUnionType, printType, isScalarType, type GraphQLNamedType } from "graphql";
import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import * as services from "@/server/services";
import { analyze } from "@/server/graphql/complexity";
import { newContext } from "@/server/graphql/context";
import { toGraphQLError } from "@/server/graphql/errors";
import { getSchema } from "@/server/graphql/schema";
import { assertWrite } from "@/server/platform/scope";
import { chargeCall, limits } from "@/server/platform/rate-limit";
import { id, jsonObject } from "../util";
import type { McpToolDefinition } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tool<T = any> = McpToolDefinition<T>;

const allWeekendApi: Tool = {
  name: "all_weekend_api", readOnly: true, cost: 10,
  description: "Run any GraphQL query or mutation against the Weekend GraphQL API. Use get_graphql_schema and get_type_details to discover fields.",
  inputSchema: z.object({ query: z.string().min(1), variables: jsonObject.optional(), operation_name: z.string().optional() }),
  async handler(actor, i) {
    const schema = getSchema();
    let doc;
    try { doc = parse(i.query); } catch (e) { throw new ValidationError(`GraphQL syntax error: ${(e as Error).message}`); }
    const errs = validate(schema, doc);
    if (errs.length) return { errors: errs.map((e) => ({ message: e.message, extensions: { code: "GraphQLValidationFailed" } })) };
    const op = doc.definitions.find((d) => d.kind === "OperationDefinition" && (!i.operation_name || d.name?.value === i.operation_name));
    if (op && op.kind === "OperationDefinition" && op.operation === "mutation") assertWrite(actor, "GraphQL mutations");
    const a = analyze(schema, doc, i.operation_name, i.variables ?? {});
    if (a.depth > limits().maxDepth) throw new ValidationError(`Query depth ${a.depth} exceeds the maximum of ${limits().maxDepth}`);
    const report = chargeCall(actor, a.cost);
    const ctx = newContext(actor);
    ctx.report = report;
    const result = await execute({ schema, document: doc, variableValues: i.variables ?? {}, operationName: i.operation_name, contextValue: ctx });
    return {
      data: result.data ?? null,
      ...(result.errors?.length ? { errors: result.errors.map((e) => { const g = toGraphQLError(e.originalError ?? e); return { message: g.message, path: e.path, extensions: g.extensions }; }) } : {}),
      complexity: { query: report.query, daily_remaining: report.dailyRemaining },
    };
  },
};

function describeType(t: GraphQLNamedType): string {
  return printType(t);
}

const getGraphqlSchema: Tool = {
  name: "get_graphql_schema", description: "List the root fields of the GraphQL API (queries and mutations) with their arguments, or the full SDL when full=true.",
  inputSchema: z.object({ operation_type: z.enum(["query", "mutation", "all"]).default("all"), full: z.boolean().default(false) }),
  handler(_actor, i) {
    const schema = getSchema();
    if (i.full) return printSchemaText();
    const fieldsOf = (t: GraphQLNamedType | null | undefined) => (t && isObjectType(t) ? Object.values(t.getFields()).map((f) => `${f.name}(${f.args.map((a) => `${a.name}: ${a.type}`).join(", ")}): ${f.type}`) : []);
    return {
      ...(i.operation_type !== "mutation" ? { queries: fieldsOf(schema.getQueryType()) } : {}),
      ...(i.operation_type !== "query" ? { mutations: fieldsOf(schema.getMutationType()) } : {}),
      hint: "Use get_type_details for the fields of a type, e.g. Board, Item, ColumnValue.",
    };
  },
};
function printSchemaText(): string {
  const schema = getSchema();
  return Object.values(schema.getTypeMap()).filter((t) => !t.name.startsWith("__") && !isScalarType(t) || ["JSON", "Date", "ISO8601DateTime", "CompareValue", "File"].includes(t.name)).map(describeType).join("\n\n");
}

const getTypeDetails: Tool = {
  name: "get_type_details", description: "SDL of one GraphQL type (object, input, enum, interface) including the types it references by name.",
  inputSchema: z.object({ type_name: z.string().min(1) }),
  handler(_actor, i) {
    const t = getSchema().getType(i.type_name);
    if (!t) throw new ValidationError(`Unknown type "${i.type_name}"`);
    const refs = new Set<string>();
    if (isObjectType(t) || isInterfaceType(t)) for (const f of Object.values(t.getFields())) { refs.add(getNamedType(f.type).name); for (const a of f.args) refs.add(getNamedType(a.type).name); }
    if (isInputObjectType(t)) for (const f of Object.values(t.getFields())) refs.add(getNamedType(f.type).name);
    return { type: i.type_name, kind: isEnumType(t) ? "enum" : isUnionType(t) ? "union" : isInputObjectType(t) ? "input" : isInterfaceType(t) ? "interface" : isScalarType(t) ? "scalar" : "object", sdl: describeType(t), references: [...refs].filter((n) => !["String", "Int", "Float", "Boolean", "ID"].includes(n)) };
  },
};

/* ---------------------------------------------------------------- UI components: structured JSON the client renders */
const ui = (component: string, props: Record<string, unknown>) => ({ ui: { component, version: 1 }, props });

const showTable: Tool = {
  name: "show_table", readOnly: true, cost: 5,
  description: "Show rows as a table in the client. Give columns [{key,label}] and rows [{key: value}] — or item_ids to render items with their column values.",
  inputSchema: z.object({ title: z.string().optional(), columns: z.array(z.object({ key: z.string(), label: z.string().optional() })).optional(), rows: z.array(z.record(z.string(), z.unknown())).optional(), items: z.array(z.record(z.string(), z.unknown())).optional(), item_ids: z.array(id).optional() }),
  handler(actor, i) {
    let rows = (i.rows ?? i.items ?? []) as Record<string, unknown>[];
    let columns = i.columns as { key: string; label?: string }[] | undefined;
    if (i.item_ids?.length) {
      const items = (i.item_ids as string[]).map((x) => services.items.get(actor, x));
      const cols = items[0] ? services.columns.list(actor, items[0].boardId, "item").filter((c) => !c.archived && c.type !== "name") : [];
      columns = [{ key: "name", label: "Name" }, ...cols.map((c) => ({ key: c.key, label: c.title }))];
      rows = items.map((it) => ({ id: it.id, name: it.name, ...Object.fromEntries(cols.map((c) => [c.key, it.values[c.id] ?? null])) }));
    }
    if (!columns) columns = rows[0] ? Object.keys(rows[0]).map((k) => ({ key: k, label: k })) : [];
    return ui("table", { title: i.title ?? null, columns, rows });
  },
};
const showChart: Tool = {
  name: "show_chart", readOnly: true, cost: 5,
  description: "Show a chart. chart_type: bar | pie | line | donut. data: [{label, value}] (or series [{name, data:[{label,value}]}]).",
  inputSchema: z.object({ title: z.string().optional(), chart_type: z.enum(["bar", "pie", "line", "donut", "column"]).default("bar"), data: z.array(z.object({ label: z.string(), value: z.number() })).optional(), series: z.array(z.object({ name: z.string(), data: z.array(z.object({ label: z.string(), value: z.number() })) })).optional() }),
  handler: (_a, i) => ui("chart", { title: i.title ?? null, chart_type: i.chart_type, data: i.data ?? [], series: i.series ?? null }),
};
const showBattery: Tool = {
  name: "show_battery", readOnly: true, cost: 5,
  description: "Show a progress battery (value of max, optional segments [{label,value,color}]).",
  inputSchema: z.object({ title: z.string().optional(), value: z.number().min(0), max: z.number().positive().default(100), segments: z.array(z.object({ label: z.string(), value: z.number(), color: z.string().optional() })).optional() }),
  handler: (_a, i) => ui("battery", { title: i.title ?? null, value: i.value, max: i.max, percent: Math.round((i.value / i.max) * 1000) / 10, segments: i.segments ?? null }),
};
const showAssign: Tool = {
  name: "show_assign", readOnly: true, cost: 5,
  description: "Show an assignee picker for an item: current people and candidates. Apply the choice with change_item_column_values.",
  inputSchema: z.object({ item_id: id, column_id: z.string().optional(), query: z.string().optional() }),
  handler(actor, i) {
    const it = services.items.get(actor, i.item_id);
    const col = services.columns.list(actor, it.boardId, "item").find((c) => (i.column_id ? c.key === i.column_id || c.id === i.column_id : c.type === "people"));
    const current = ((col ? it.values[col.id] : null) as { personsAndTeams?: { id: string; kind: string }[] } | null)?.personsAndTeams ?? [];
    const q = i.query?.toLowerCase();
    const candidates = services.users.list(actor).filter((u) => !q || u.name.toLowerCase().includes(q)).slice(0, 25).map((u) => ({ id: u.id, name: u.name, email: u.email, photo_url: u.photoUrl }));
    return ui("assign", { item: { id: it.id, name: it.name }, column_id: col?.key ?? null, current, candidates });
  },
};

export const apiTools: Tool[] = [allWeekendApi, getGraphqlSchema, getTypeDetails, showTable, showChart, showBattery, showAssign];
