export interface TokenDto {
  id: string; name: string; tokenPrefix: string; scopes: ("read" | "write")[]; workspaceIds: string[] | null; dailyBudget: number | null;
  lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null; createdAt: string; userName?: string; usedToday: number; callsToday: number;
}
export interface CallDto { id: string; channel: string; name: string; ok: boolean; error: string | null; durationMs: number; createdAt: string }
export interface ToolInfo { name: string; description: string; readOnly: boolean }
export interface PlatformProps {
  baseUrl: string;
  isAdmin: boolean;
  tokens: TokenDto[];
  workspaces: { id: string; name: string }[];
  boards: { id: string; name: string }[];
  tools: ToolInfo[];
  defaultBudget: number;
  firstBoardId: string | null;
  /** oauth module: the user's connected apps (MCP tab) */
  connectedApps: import("@/modules/oauth/connected-apps").ConnectedAppDto[];
}
