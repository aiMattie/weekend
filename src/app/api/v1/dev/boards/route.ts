import { api } from "@/server/http";
import { sprints } from "@/server/services";

export const GET = api(({ actor }) => sprints.listSprintBoards(actor));
