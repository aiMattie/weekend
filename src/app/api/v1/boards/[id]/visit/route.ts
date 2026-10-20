import { api } from "@/server/http";
import * as recent from "@/server/services/recent";

export const POST = api<{ id: string }>(({ actor, params }) => { recent.visit(actor, params.id); });
