import { NextResponse } from "next/server";
import { api } from "@/server/http";
import { wispr } from "@/server/services";

/** GET /api/v1/wispr/connect: redirects the browser to the Wispr Flow sign-in (OAuth, PKCE). */
export const GET = api(async ({ actor }) => NextResponse.redirect(await wispr.startConnect(actor)));
