/** MCP resources: every board the token may see is a resource (weekend://boards/<id>). */
import type { Actor } from "@/lib/actor";
import { ValidationError } from "@/lib/errors";
import * as services from "@/server/services";
import { filterByWorkspace } from "@/server/platform/scope";
import { assertBoardInScope } from "@/server/platform/scope";
import { boardSnapshot } from "./tools/platform-boards";

const PREFIX = "weekend://boards/";

export function listBoardResources(actor: Actor) {
  return filterByWorkspace(actor, services.boards.list(actor)).slice(0, 500).map((b) => ({
    uri: `${PREFIX}${b.id}`, name: b.name, description: b.description ?? `Board ${b.name}`, mimeType: "application/json",
  }));
}

export function readBoardResource(actor: Actor, uri: string) {
  if (!uri.startsWith(PREFIX)) throw new ValidationError(`Unknown resource ${uri}`);
  const boardId = uri.slice(PREFIX.length);
  assertBoardInScope(actor, boardId);
  return { uri, mimeType: "application/json", text: JSON.stringify(boardSnapshot(actor, boardId, 50), null, 2) };
}
