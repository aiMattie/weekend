/** Registers the migration module's hooks for the automations module (called once from src/server/startup.ts). */
import { registerAutomationHook } from "../../automations/hooks";
import { instantiateClientWorkspace } from "../templates";

export function registerMigrationHooks(): void {
  // automation action "new client in Klanten -> create client workspace from the template"
  registerAutomationHook("create_client_workspace", ({ actor, name }) => {
    const r = instantiateClientWorkspace(actor.accountId, { klantnaam: name });
    return { workspaceId: r.workspaceId, name };
  });
}
