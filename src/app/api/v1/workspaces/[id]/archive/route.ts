import { api } from "@/server/http";
import * as workspaces from "@/server/services/workspaces";

export const POST = api<{ id: string }>(({ actor, params }) => workspaces.archive(actor, params.id));
