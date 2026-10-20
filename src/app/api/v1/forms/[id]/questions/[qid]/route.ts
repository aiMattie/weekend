import { api } from "@/server/http";
import { forms } from "@/server/services";

type P = { id: string; qid: string };
export const PATCH = api<P>(async ({ actor, params, body }) => forms.updateQuestion(actor, params.id, params.qid, await body()));
export const DELETE = api<P>(({ actor, params }) => forms.removeQuestion(actor, params.id, params.qid));
