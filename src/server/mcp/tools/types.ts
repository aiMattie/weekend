import type { z } from "zod";
import type { Actor } from "../../../lib/actor";

/** One MCP tool (get_board_items_page, create_item, ...). */
export interface McpToolDefinition<TInput = Record<string, unknown>> {
  name: string;
  description: string;
  /** human title (platform MCP server shows it); defaults to the name */
  title?: string;
  /** true = read only (allowed for read-scope tokens). Default: guessed from the name (get_*, list_*, read_*, search ...) */
  readOnly?: boolean;
  /** MCP annotation destructiveHint. Default: guessed from the name (delete_*, remove_*, archive_*) */
  destructive?: boolean;
  /** MCP annotation idempotentHint (repeating the call has no extra effect). Default: true for read-only tools */
  idempotent?: boolean;
  /** budget cost of one call against the token's daily API budget (default 50) */
  cost?: number;
  inputSchema: z.ZodType<TInput>;
  /** MUST call services only; the actor comes from the Bearer token */
  handler(actor: Actor, input: TInput): Promise<unknown> | unknown;
}
