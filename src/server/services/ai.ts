/**
 * AI services barrel (module ai): `import { ai } from "@/server/services"`.
 * Core (settings, credits, metered call), Sidekick chat, Weekend magic.
 */
export * from "./ai-core";
export * from "./ai-sidekick";
export * as magic from "./ai-magic";
export * as nl from "./ai-automations";
export * as blocks from "./ai-blocks";
export * from "./ai-agent-draft";
