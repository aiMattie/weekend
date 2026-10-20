import { api } from "@/server/http";
import { timeEntries } from "@/server/services";

type P = { id: string };
export const DELETE = api<P>(({ actor, params }) => timeEntries.remove(actor, params.id));
