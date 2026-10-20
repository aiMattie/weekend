import { api } from "@/server/http";
import { forms } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => forms.listSubmissions(actor, params.id));
/** Programmatic submission (answers keyed by question id, column key/id or "name"). */
export const POST = api<P>(async ({ actor, params, body }) => forms.createSubmission(actor, params.id, (await body()).answers ?? {}), { status: 201 });
