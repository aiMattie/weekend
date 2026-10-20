/** IP allow-list lookup used by src/proxy.ts. Kept tiny (db + account settings only). Cached for 5 s. */
import { db } from "@/db/client";
import { accounts } from "@/db/schema/core";
import { getSettings } from "@/server/services/account-settings";
import { clientIp, ipAllowed } from "./lib/ip";

const g = globalThis as unknown as { __adminIpPolicy?: { at: number; list: string[] } };

export function invalidateIpCache(): void { g.__adminIpPolicy = undefined; }

/** Union of the allow-lists of all accounts (one account in practice). Empty = everybody allowed. */
export function ipAllowlist(): string[] {
  const c = g.__adminIpPolicy;
  if (c && Date.now() - c.at < 5000) return c.list;
  const list = db.select({ id: accounts.id }).from(accounts).all().flatMap((r) => getSettings(r.id).security.ipAllowlist);
  g.__adminIpPolicy = { at: Date.now(), list };
  return list;
}

/** true = the request must be refused (403). Fails open when the database is unavailable. */
export function isIpBlocked(headers: { get(name: string): string | null }): boolean {
  try {
    const list = ipAllowlist();
    return list.length > 0 && !ipAllowed(clientIp(headers), list);
  } catch {
    return false;
  }
}
