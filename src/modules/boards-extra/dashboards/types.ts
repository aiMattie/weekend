/** Client DTOs for dashboards (mirror of the REST payloads). */
import type { WidgetField, WidgetCategory } from "../widgets/types";

export interface DashboardDto {
  id: string; workspaceId: string; name: string; description: string | null; boardIds: string[];
  filters: { columnId: string; op: string; operand?: unknown }[]; locked: boolean; visibility: "main" | "private"; memberIds: string[]; ownerId: string | null;
}
export interface WidgetDto { id: string; dashboardId: string; type: string; title: string; settings: Record<string, unknown>; layout: { x: number; y: number; w: number; h: number } }
export interface DashboardPayload { dashboard: DashboardDto; widgets: WidgetDto[]; boards: { id: string; name: string; workspaceId: string }[]; canEdit: boolean; workspaceName: string }
export type WidgetResultDto = { ok: true; data: unknown } | { ok: false; error: string };
export interface ColumnsPayload {
  boards: { id: string; name: string }[];
  columns: { id: string; title: string; type: string; boardIds: string[]; labels?: { id: number; text: string; color?: string }[] }[];
  users: { id: string; name: string }[];
}
export interface WidgetTypeInfo { type: string; label: string; description: string; category: WidgetCategory; defaultLayout: { w: number; h: number }; fields: WidgetField[] }
