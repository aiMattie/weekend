import { api } from "@/server/http";
import * as boardTemplates from "@/server/services/board-templates";

export const GET = api(() => boardTemplates.list());
