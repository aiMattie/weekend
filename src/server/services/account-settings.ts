/**
 * Low level access to accounts.settings (JSON). Everything account wide lives in one document:
 * general, security, guests, sso, scim, retention and plan overrides. Used by account.ts, security.ts,
 * audit.ts and the auth layer. No permission checks here (callers do that).
 */
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { accounts } from "../../db/schema/core";
import { NotFoundError } from "../../lib/errors";

export interface PasswordPolicy { minLength: number; requireUpper: boolean; requireNumber: boolean; requireSymbol: boolean; maxAgeDays: number | null }

export type ImportFrequency = "hourly" | "daily" | "weekly";
export interface ImportSchedule {
  enabled: boolean; frequency: ImportFrequency;
  /** local hour (account time zone) for daily/weekly runs */
  hour: number;
  /** ISO weekday for weekly runs: 1 = Monday ... 7 = Sunday */
  weekday: number;
  /** when the schedule was (re)enabled; the first run is the first slot after it */
  enabledAt: string | null;
  lastRunAt: string | null; lastJobId: string | null;
}
/** Linked source accounts for the importers (Admin > Import). Secrets are sealed (seal.ts), never returned. */
export interface ImportConnections {
  monday: { apiKey: string | null; accountName: string | null; connectedAt: string | null; connectedBy: string | null; schedule: ImportSchedule & { workspaces: string[] } };
  jira: { baseUrl: string | null; email: string | null; apiToken: string | null; displayName: string | null; connectedAt: string | null; connectedBy: string | null; schedule: ImportSchedule & { projects: string[]; doneDays: number; sprintCadence: { anchor: string; weeks: number } | null } };
}

export interface AccountSettings {
  general: { logoUrl: string | null; defaultLocale: "nl" | "en"; timeZone: string; weekStart: "monday" | "sunday" | "saturday" };
  security: {
    twoFactorRequired: boolean;
    ipAllowlist: string[];
    passwordPolicy: PasswordPolicy;
    sessionTimeoutDays: number;
    /** max failed logins before a 15 minute lock */
    maxFailedLogins: number;
    panic: { lockedAt: string; lockedBy: string; recoveryHash: string } | null;
  };
  guests: { enabled: boolean; restrictedViews: boolean };
  sso: { provider: "saml"; enabled: boolean; entityId: string; ssoUrl: string; certificate: string; domains: string[]; connected: false };
  /** SSO policy + Google sign-in (OAuth / OIDC). `enforceSso` only has effect while Google or Microsoft is configured and enabled. */
  googleSso: { enabled: boolean; allowedDomains: string[]; autoProvision: boolean; enforceSso: boolean; breakGlassUserIds: string[] };
  /** Microsoft sign-in on/off. Domains, auto-provisioning, enforcement and break-glass are shared with googleSso. */
  microsoftSso: { enabled: boolean };
  scim: { tokenHash: string; prefix: string; createdAt: string } | null;
  retentionDays: number;
  importConnections: ImportConnections;
}

const SCHEDULE_OFF: ImportSchedule = { enabled: false, frequency: "daily", hour: 6, weekday: 1, enabledAt: null, lastRunAt: null, lastJobId: null };

export const DEFAULT_SETTINGS: AccountSettings = {
  general: { logoUrl: null, defaultLocale: "nl", timeZone: "Europe/Amsterdam", weekStart: "monday" },
  security: {
    twoFactorRequired: false, ipAllowlist: [], sessionTimeoutDays: 14, maxFailedLogins: 10, panic: null,
    passwordPolicy: { minLength: 8, requireUpper: false, requireNumber: false, requireSymbol: false, maxAgeDays: null },
  },
  guests: { enabled: true, restrictedViews: false },
  sso: { provider: "saml", enabled: false, entityId: "", ssoUrl: "", certificate: "", domains: [], connected: false },
  googleSso: { enabled: true, allowedDomains: [], autoProvision: false, enforceSso: false, breakGlassUserIds: [] },
  microsoftSso: { enabled: true },
  scim: null,
  retentionDays: 365,
  importConnections: {
    monday: { apiKey: null, accountName: null, connectedAt: null, connectedBy: null, schedule: { ...SCHEDULE_OFF, workspaces: [] } },
    jira: { baseUrl: null, email: null, apiToken: null, displayName: null, connectedAt: null, connectedBy: null, schedule: { ...SCHEDULE_OFF, projects: [], doneDays: 3650, sprintCadence: null } },
  },
};

type Json = Record<string, unknown>;

function merge<T>(base: T, over: unknown): T {
  if (over === null || over === undefined) return base;
  if (typeof base !== "object" || base === null || Array.isArray(base)) return over as T;
  if (typeof over !== "object" || Array.isArray(over)) return over as T;
  const out: Json = { ...(base as Json) };
  for (const [k, v] of Object.entries(over as Json)) {
    const b = (base as Json)[k];
    out[k] = b && typeof b === "object" && !Array.isArray(b) && v && typeof v === "object" && !Array.isArray(v) ? merge(b, v) : v;
  }
  return out as T;
}

export function accountRow(accountId: string) {
  const row = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!row) throw new NotFoundError("Account");
  return row;
}

/** Account settings with defaults filled in. Cheap (one indexed read). */
export function getSettings(accountId: string): AccountSettings {
  const row = db.select({ settings: accounts.settings }).from(accounts).where(eq(accounts.id, accountId)).get();
  const s = merge(structuredClone(DEFAULT_SETTINGS), row?.settings ?? {});
  // panic must be an explicit object or null (merge keeps null from defaults)
  s.security.panic = (row?.settings as { security?: { panic?: AccountSettings["security"]["panic"] } } | undefined)?.security?.panic ?? null;
  s.scim = (row?.settings as { scim?: AccountSettings["scim"] } | undefined)?.scim ?? null;
  return s;
}

/** Read-modify-write of the settings document (synchronous = atomic with better-sqlite3). */
export function patchSettings(accountId: string, patch: (s: AccountSettings) => void): AccountSettings {
  const cur = getSettings(accountId);
  patch(cur);
  db.update(accounts).set({ settings: cur as unknown as Json }).where(eq(accounts.id, accountId)).run();
  return cur;
}

export function isLocked(accountId: string): boolean {
  return getSettings(accountId).security.panic !== null;
}
