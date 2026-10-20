import { api } from "@/server/http";
import { importConnections } from "@/server/services";

/** PUT: { enabled, frequency, hour, weekday, workspaces | projects, doneDays, sprintCadence } */
export const PUT = api<{ kind: string }>(async ({ actor, params, body }) => importConnections.updateSchedule(actor, params.kind, await body()));
