import type { NextRequest } from "next/server";
import { startSso } from "@/server/sso/flow-routes";

/** GET /api/auth/google/start?next=/pad&mode=login|link|test (see server/sso/flow-routes.ts). */
export const GET = (req: NextRequest) => startSso(req, "google");
