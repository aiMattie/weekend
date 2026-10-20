/**
 * Where the importers get their source credentials: the account's linked connection (Admin > Import,
 * sealed in accounts.settings.importConnections) first, the server environment second. No permission
 * checks here (callers do that); never log or return the secrets.
 */
import { unseal } from "../../../modules/admin/lib/seal";
import { getSettings } from "../account-settings";

export type CredentialSource = "app" | "env";
export interface MondayCredentials { apiKey: string; source: CredentialSource }

const open = (sealed: string | null): string | null => {
  if (!sealed) return null;
  try { return unseal(sealed); } catch { return null; } // SESSION_SECRET rotated: treat as not linked
};

export function mondayCredentials(accountId: string | null | undefined): MondayCredentials | null {
  const stored = accountId ? open(getSettings(accountId).importConnections.monday.apiKey) : null;
  if (stored) return { apiKey: stored, source: "app" };
  return process.env.MONDAY_API_KEY ? { apiKey: process.env.MONDAY_API_KEY, source: "env" } : null;
}
