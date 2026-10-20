/** Client side shapes of the agents API (mirror of services/agents.ts DTOs). */
export type AgentStatus = "active" | "paused" | "draft";
export interface TriggerDto { id: string; type: "item_created" | "column_changed" | "mention" | "schedule" | "manual"; config: Record<string, unknown>; active: boolean }
export interface SkillDto { id: string; name: string; instruction: string; tools: string[] }
export interface KnowledgeDto { id: string; kind: "board" | "doc"; refId: string; access: "read" | "write"; name: string | null }
export interface LastRun { id: string; status: RunStatus; startedAt: string; triggerType: string }
export type RunStatus = "running" | "success" | "failed" | "capped" | "skipped";
export interface AgentDto {
  id: string; name: string; description: string; avatar: string; instructions: string; status: AgentStatus; ownerId: string | null; userId: string | null; identityName: string | null;
  templateKey: string | null; maxSteps: number; maxTokens: number; maxRunsPerHour: number;
  triggers: TriggerDto[]; skills: SkillDto[]; knowledge: KnowledgeDto[]; lastRun: LastRun | null;
}
export interface CatalogEntry { key: string; name: string; description: { nl: string; en: string }; avatar: string; needsBoard: boolean; boardHint: string | null; boardAccess: "read" | "write" | null; triggers: string[]; installed: number; native: boolean }
export interface ToolInfo { name: string; write: boolean; description: string }
export interface RunDto {
  id: string; agentId: string; status: RunStatus; triggerType: string; error: string | null; result: string | null; steps: number; credits: number; inputTokens: number; outputTokens: number; startedAt: string; finishedAt: string | null;
  transcript: { role: string; text: string; at: string }[]; toolCalls: { name: string; input: unknown; output: string; error?: boolean; at: string }[];
}
export const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
