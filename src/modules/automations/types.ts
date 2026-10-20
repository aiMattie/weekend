/** Client DTOs for the automations UI (JSON from /api/v1/automations/*). */
export interface Txt { nl: string; en: string }
export type FieldKind = "column" | "label" | "group" | "board" | "user" | "users" | "text" | "longtext" | "number" | "select" | "boolean" | "time" | "url" | "list" | "value" | "item" | "integration" | "mapping";
export interface FieldSpec {
  key: string; kind: FieldKind; label: Txt; required?: boolean; columnTypes?: string[]; of?: string; boardField?: string;
  options?: { value: string; label: Txt }[]; default?: unknown; placeholder?: Txt;
}
export interface BlockMeta { id: string; kind: "trigger" | "condition" | "action"; label: string; title: Txt; category: string; fields: FieldSpec[]; schedule: boolean; needsItem: boolean }
export interface RecipeMeta { id: string; category: string; sentence: Txt; tokens: (FieldSpec & { default?: unknown })[] }
export interface Catalog {
  blocks: BlockMeta[];
  recipes: RecipeMeta[];
  categories: { id: string; label: Txt }[];
  usage: { boardLastHour: number; accountThisMonth: number; limits: { boardPerHour: number; accountPerMonth: number } } | null;
}
export interface BlockRef { type: string; config: Record<string, unknown> }
export interface ConditionGroup { op: "and" | "or"; conditions: (BlockRef | ConditionGroup)[] }
export type Step =
  | { id: string; type: "action"; block: string; config: Record<string, unknown> }
  | { id: string; type: "branch"; condition: ConditionGroup; then: Step[]; else: Step[] }
  | { id: string; type: "approval"; approverIds: string[]; approverColumnId?: string; message?: string };
export interface Definition { trigger: BlockRef; conditions?: ConditionGroup; steps: Step[] }
export interface AutomationDto {
  id: string; boardId: string | null; name: string; description: string | null; kind: "automation" | "workflow"; active: boolean; status: "published" | "draft";
  definition: Definition; graph: Record<string, unknown>; recipeId: string | null; runCount: number; lastRunAt: string | null; createdAt: string; lastRunStatus?: string | null;
}
export interface RunStepDto { pc: number; id?: string; block: string; status: "ok" | "failed" | "skipped"; error?: string; at: string; output?: string }
export interface RunDto {
  id: string; automationId: string; boardId: string | null; itemId: string | null; status: string; error: string | null; attempt: number; maxAttempts: number;
  depth: number; steps: RunStepDto[]; startedAt: string; finishedAt: string | null; createdAt: string; nextRetryAt: string | null; approval: Record<string, unknown> | null;
}
export interface IntegrationDto {
  id: string; kind: string; name: string; boardId: string | null; config: Record<string, unknown>; token: string | null; active: boolean; connected: boolean; inboundPath: string | null; lastEventAt: string | null;
}
export interface IntegrationCatalogEntry { kind: string; name: string; description: Txt; mode: "inbound" | "chat" | "outbound"; fields: { key: string; label: Txt; secret?: boolean; placeholder?: string }[] }
export interface WebhookEndpointDto { id: string; boardId: string | null; url: string; events: string[]; secret: string; description: string | null; active: boolean; createdAt: string }
export interface WebhookDeliveryDto { id: string; event: string; status: string; attempts: number; responseStatus: number | null; error: string | null; createdAt: string; nextAttemptAt: string | null; deliveredAt: string | null }
