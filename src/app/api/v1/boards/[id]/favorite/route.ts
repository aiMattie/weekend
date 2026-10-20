import { api } from "@/server/http";
import { boards } from "@/server/services";

/** Toggles the favorite flag for the current user. Returns { favorite: boolean }. */
export const POST = api<{ id: string }>(({ actor, params }) => ({ favorite: boards.toggleFavorite(actor, params.id) }));
