import type { SsoProvider } from "@/server/sso/oauth";

/** Full page navigation to an API route that redirects to the identity provider (the client router must not handle it). */
export const hardNavigate = (url: string): void => window.location.assign(url);
export const ssoStartUrl = (provider: SsoProvider, mode: "link" | "test"): string => `/api/auth/${provider}/start?mode=${mode}`;
export const googleStartUrl = (mode: "link" | "test"): string => ssoStartUrl("google", mode);
