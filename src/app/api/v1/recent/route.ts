import { api, intParam } from "@/server/http";
import * as recent from "@/server/services/recent";

export const GET = api(({ actor, query }) => recent.list(actor, intParam(query, "limit") ?? 10).map((r) => ({ id: r.board.id, name: r.board.name, workspaceId: r.board.workspaceId, kind: r.board.kind, visitedAt: r.visitedAt })));
