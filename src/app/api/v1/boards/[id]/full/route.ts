import { api } from "@/server/http";
import { getBoardFull } from "@/server/services";

/** The whole board (groups, columns, items incl. subitems, views, users) for the UI. */
export const GET = api<{ id: string }>(({ actor, params }) => getBoardFull(actor, params.id));
