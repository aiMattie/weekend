import { api } from "@/server/http";
import { workspaces } from "@/server/services";

/** Toggles the favorite (star) flag of a workspace for the current user. Returns { favorite: boolean }. */
export const POST = api<{ id: string }>(({ actor, params }) => ({ favorite: workspaces.toggleFavorite(actor, params.id) }));
