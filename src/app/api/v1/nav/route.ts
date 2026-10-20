import { api } from "@/server/http";
import { getNavData } from "@/server/services";

/** Sidebar tree: workspaces, folders, boards, favorites (permission filtered). */
export const GET = api(({ actor }) => getNavData(actor));
