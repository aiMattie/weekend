/** Starts the automation engine, webhook dispatcher and the in-process scheduler (idempotent). */
import { startWebhookDispatcher } from "../services/webhooks";
import { startEngine } from "./engine";
import { startScheduler } from "./scheduler";

export function bootAutomations(): void {
  startEngine();
  startWebhookDispatcher();
  if (process.env.AUTOMATIONS_SCHEDULER !== "off") startScheduler();
}
