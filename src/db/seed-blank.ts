/**
 * Blank start: one account, one admin user and one empty workspace. Used by `npm run setup -- --blank`
 * for people who want to start with their own data instead of the demo seed.
 */
import { sql } from "drizzle-orm";
import { hashPassword } from "../lib/auth/password";
import { db } from "./client";
import { accounts, users, workspaceMembers, workspaces } from "./schema/core";

export interface BlankSeedInput { accountName: string; name: string; email: string; password: string }

export async function seedBlank(input: BlankSeedInput): Promise<{ accountId: string; userId: string; workspaceId: string }> {
  const email = input.email.trim().toLowerCase();
  if (db.select().from(users).where(sql`lower(${users.email}) = ${email}`).get()) throw new Error(`User ${email} already exists`);
  const slug = input.accountName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "weekend";
  const account = db.insert(accounts).values({ name: input.accountName, slug }).returning().get();
  const user = db.insert(users).values({
    accountId: account.id, name: input.name, email, title: "Admin", role: "admin", passwordHash: await hashPassword(input.password),
  }).returning().get();
  const ws = db.insert(workspaces).values({ accountId: account.id, name: "Main workspace", color: "#0073ea", kind: "open", position: 1000, createdBy: user.id }).returning().get();
  db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: user.id, role: "owner" }).run();
  return { accountId: account.id, userId: user.id, workspaceId: ws.id };
}
