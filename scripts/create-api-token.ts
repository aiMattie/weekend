/**
 * Create a personal API token from the command line (for scripts, CI and the MCP smoke test).
 *   npx tsx scripts/create-api-token.ts admin@example.com "mijn token" [read|write|read,write]
 * Prints the token once. DATABASE_URL selects the database (default file:data/app.db).
 */
import "./_env";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { users } from "../src/db/schema/core";
import { create } from "../src/server/services/api-tokens";

const [email, name = "cli token", scopeArg = "read,write"] = process.argv.slice(2);
if (!email) {
  console.error("usage: tsx scripts/create-api-token.ts <email> [name] [read,write]");
  process.exit(1);
}
const user = db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).get();
if (!user) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}
void eq;
const actor = { id: user.id, accountId: user.accountId, role: user.role, name: user.name, email: user.email, source: "api" as const };
const { token } = create(actor, { name, scopes: scopeArg.split(",") });
console.log(token);
