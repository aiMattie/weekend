/**
 * Server startup tasks, imported once by src/instrumentation.ts (Node runtime only).
 * Other modules: add ONE import line below for background work that must start with the server.
 */
import { bootAutomations } from "./automations/boot";

bootAutomations();
import { registerMigrationHooks } from "./services/migration/register-hooks";

registerMigrationHooks();
import { startAgentEngine } from "./ai/agent-engine";

startAgentEngine(); // ai: agent triggers on bus events + schedule tick
import { startImportScheduler } from "./services/migration/import-scheduler";

startImportScheduler(); // migration: scheduled monday.com/Jira imports (Admin > Import)
// <- add startup tasks above this line
