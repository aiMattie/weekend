import { api } from "@/server/http";
import { devGit } from "@/server/services";

type P = { id: string };
export const POST = api<P>(({ actor, params }) => devGit.rotateSecret(actor, params.id));
