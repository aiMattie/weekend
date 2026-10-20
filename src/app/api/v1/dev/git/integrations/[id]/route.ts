import { api } from "@/server/http";
import { devGit } from "@/server/services";

type P = { id: string };
export const DELETE = api<P>(({ actor, params }) => devGit.removeIntegration(actor, params.id));
