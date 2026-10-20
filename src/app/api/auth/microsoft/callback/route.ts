import type { NextRequest } from "next/server";
import { callbackSso } from "@/server/sso/flow-routes";

/** GET /api/auth/microsoft/callback (see server/sso/flow-routes.ts). */
export const GET = (req: NextRequest) => callbackSso(req, "microsoft");
