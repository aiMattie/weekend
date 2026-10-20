import { api } from "@/server/http";
import { dashboards } from "@/server/services";

/** JSON-schema registry of all widget types (same data as MCP all_widgets_schema). */
export const GET = api(() => dashboards.allWidgetsSchema());
