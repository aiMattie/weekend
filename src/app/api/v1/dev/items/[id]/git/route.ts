import { api } from "@/server/http";
import { devGit } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => devGit.linksForItem(actor, params.id));
