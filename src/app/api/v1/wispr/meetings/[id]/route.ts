import { api } from "@/server/http";
import { wispr } from "@/server/services";

type P = { id: string };
export const GET = api<P>(({ actor, params }) => wispr.detail(actor, params.id));
