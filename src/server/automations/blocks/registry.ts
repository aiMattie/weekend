/**
 * Automation block registry (triggers, conditions, actions).
 * ADD A BLOCK: create a file in `src/server/automations/blocks/` exporting `AutomationBlock`s,
 * then add ONE import and ONE spread (or entry) below.
 */
import { advancedActions } from "./actions-advanced";
import { aiBlocks } from "./ai";
import { itemActions } from "./actions-item";
import { notifyActions } from "./actions-notify";
import { conditionBlocks } from "./conditions";
import { eventTriggers } from "./triggers";
import { timeTriggers } from "./triggers-time";
import type { AutomationBlock } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const blocks: AutomationBlock<any>[] = [
  ...eventTriggers,
  ...timeTriggers,
  ...conditionBlocks,
  ...itemActions,
  ...notifyActions,
  ...advancedActions,
  ...aiBlocks,
  // <- add new blocks above this line
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getBlock = (id: string): AutomationBlock<any> | undefined => blocks.find((b) => b.id === id);
export const listBlocks = (kind?: AutomationBlock["kind"]) => (kind ? blocks.filter((b) => b.kind === kind) : [...blocks]);
export type { AutomationBlock } from "./types";
