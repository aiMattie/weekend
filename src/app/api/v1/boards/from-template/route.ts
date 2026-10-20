import { api } from "@/server/http";
import * as boardTemplates from "@/server/services/board-templates";

/** body: { templateId, workspaceId, folderId?, name, visibility?: "public"|"private"|"share" } */
export const POST = api(async ({ actor, body }) => boardTemplates.createBoard(actor, await body()), { status: 201 });
