import { api } from "@/server/http";
import * as boardInfo from "@/server/services/board-info";

export const GET = api<{ id: string }>(({ actor, params }) => boardInfo.info(actor, params.id));
