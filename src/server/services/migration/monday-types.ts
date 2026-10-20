/** Shapes of the monday GraphQL data we read (only the fields we query). */
export interface MUser { id: string; name: string; email: string; title: string | null; phone?: string | null; is_guest: boolean; is_admin: boolean; is_view_only: boolean; is_pending: boolean; enabled: boolean; time_zone_identifier?: string | null; teams?: { id: string; name: string }[] }
export interface MTeam { id: string; name: string; owners?: { id: string }[]; users?: { id: string }[] }
export interface MWorkspace { id: string; name: string; kind: string; state: string; description: string | null }
export interface MFolder { id: string; name: string; color: string | null; parent: { id: string } | null; workspace: { id: string } | null }
export interface MColumn { id: string; title: string; type: string; settings_str: string; archived?: boolean; width?: number | null; description?: string | null }
export interface MGroup { id: string; title: string; color: string; position: string; archived?: boolean }
export interface MColumnValue { id: string; type: string; text: string | null; value: string | null }
export interface MAsset { id: string; name: string; url?: string | null; public_url?: string | null; file_extension?: string | null; file_size?: number | null; created_at?: string | null; uploaded_by?: { id: string } | null }
export interface MItem {
  id: string; name: string; state?: string; created_at?: string; updated_at?: string; creator?: { id: string } | null;
  group?: { id: string } | null; column_values: MColumnValue[]; subitems?: MItem[]; assets?: MAsset[];
}
export interface MUpdate {
  id: string; item_id: string | null; body: string; text_body?: string | null; created_at?: string; creator?: { id: string } | null;
  replies?: { id: string; body: string; created_at?: string; creator?: { id: string } | null }[]; assets?: MAsset[];
}
export interface MBoard {
  id: string; name: string; type: string; board_kind: string; state: string; description?: string | null;
  board_folder_id: string | null; workspace: { id: string } | null; owners?: { id: string }[];
  groups: MGroup[]; columns: MColumn[]; views?: { id: string; name: string; type: string; settings_str: string }[]; items_count?: number;
}
export interface MDocBlock { id: string; type: string; content: string; position: number | null; parent_block_id: string | null }
export interface MDoc { id: string; object_id: string; name: string; doc_kind?: string; workspace_id: string | null; created_by?: { id: string } | null; blocks: MDocBlock[] }

/** Everything read from monday in one go (the apply/dry-run phase is then fully synchronous). */
export interface MondaySnapshot {
  account: { id: string; name: string } | null;
  users: MUser[]; teams: MTeam[]; workspaces: MWorkspace[]; folders: MFolder[];
  boards: (MBoard & { items: MItem[]; updates: MUpdate[] })[];
  docs: MDoc[];
  /** boards skipped on purpose (custom objects etc.) */
  skippedBoards: { id: string; name: string; type: string }[];
}
