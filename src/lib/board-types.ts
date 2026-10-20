/**
 * Plain DTO types shared between server and client (JSON over REST/SSE). No imports from the db.
 * GET /api/v1/boards/:id/full returns a `BoardFull`.
 */
export interface BoardDto {
  id: string;
  workspaceId: string;
  folderId: string | null;
  name: string;
  description: string | null;
  kind: "board" | "dev_sprints" | "doc" | "dashboard";
  visibility: "public" | "private" | "share";
  ownerId: string | null;
  settings: Record<string, unknown>;
  isFavorite: boolean;
}
export interface GroupDto { id: string; boardId: string; title: string; color: string; position: number }
export interface ColumnDto {
  id: string;
  boardId: string;
  key: string;
  title: string;
  type: string;
  scope: "item" | "subitem";
  description: string | null;
  settings: Record<string, unknown>;
  position: number;
  width: number | null;
  /** false when column permissions forbid the current user to edit values (default true) */
  canEdit?: boolean;
}
export interface ItemDto {
  id: string;
  boardId: string;
  groupId: string | null;
  parentItemId: string | null;
  name: string;
  /** keyed by column id */
  values: Record<string, unknown>;
  position: number;
  creatorId: string | null;
  createdAt: string;
  updatedAt: string;
  subitemCount: number;
  updateCount: number;
}
export interface ViewDto {
  id: string;
  boardId: string;
  name: string;
  type: string;
  settings: Record<string, unknown>;
  filters: unknown[];
  sort: unknown[];
  position: number;
  ownerId: string | null;
}
export interface UserLite { id: string; name: string; email: string; photoUrl: string | null; title: string | null; isAiAgent: boolean }
export interface TeamLite { id: string; name: string }
export interface BoardFull {
  board: BoardDto;
  groups: GroupDto[];
  columns: ColumnDto[];
  /** top-level items AND subitems (parentItemId set), ordered by position */
  items: ItemDto[];
  views: ViewDto[];
  users: UserLite[];
  teams: TeamLite[];
  permissions: { editItems: boolean; editStructure: boolean; comment: boolean };
}

/** Item as seen by the sidebar (nav tree). */
export interface NavBoard { id: string; name: string; workspaceId: string; folderId: string | null; kind: BoardDto["kind"] }
export interface NavFolder { id: string; workspaceId: string; parentFolderId: string | null; name: string }
export interface NavWorkspace { id: string; name: string; kind: "open" | "closed"; color: string | null; icon: string | null }
export interface NavData { workspaces: NavWorkspace[]; folders: NavFolder[]; boards: NavBoard[]; favorites: string[] }
