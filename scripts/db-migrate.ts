import "./_env";
import { getDb } from "../src/db/client";
import { listMigrationModules } from "../src/db/migrate";

getDb(); // opens the DB and applies all pending migrations
console.log(`Migrations applied for modules: ${listMigrationModules().join(", ")} (${process.env.DATABASE_URL || "file:data/app.db"})`);
