import { api } from "@/server/http";
import { integrations } from "@/server/services";

export const GET = api(() => integrations.catalog());
