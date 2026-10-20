import { api } from "@/server/http";
import { forms } from "@/server/services";

/** Regenerate the public link (the old /f/<token> stops working). */
export const POST = api<{ id: string }>(({ actor, params }) => forms.regenerateToken(actor, params.id));
