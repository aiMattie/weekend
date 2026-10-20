import { api } from "@/server/http";
import { wispr } from "@/server/services";

export const POST = api(({ actor }) => wispr.sync(actor));
