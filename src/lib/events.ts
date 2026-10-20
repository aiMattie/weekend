/**
 * Typed in-process event bus. Services emit; the SSE endpoint, automations, webhooks and
 * notifications subscribe. Cached on globalThis so every Next bundle shares one bus.
 *
 * To add an event: extend `AppEvent` below (additive) and emit it from the owning service.
 */
import { EventEmitter } from "node:events";

export interface EventBase {
  /** board the event belongs to (SSE channel). Account-level events use boardId = null. */
  boardId: string | null;
  /** user that caused it (null = system) */
  actorId: string | null;
  at: string;
}

export type AppEvent =
  | (EventBase & { type: "board.created" | "board.updated" | "board.deleted" | "board.archived" })
  | (EventBase & { type: "group.created" | "group.updated" | "group.deleted"; groupId: string })
  | (EventBase & { type: "column.created" | "column.updated" | "column.deleted"; columnId: string })
  | (EventBase & { type: "item.created" | "item.updated" | "item.deleted" | "item.archived" | "item.moved" | "item.duplicated"; itemId: string; parentItemId?: string | null })
  | (EventBase & { type: "column_value.changed"; itemId: string; columnId: string; columnType: string; from: unknown; to: unknown })
  | (EventBase & { type: "update.created" | "update.updated" | "update.deleted" | "update.liked"; itemId: string; updateId: string })
  | (EventBase & { type: "view.created" | "view.updated" | "view.deleted"; viewId: string })
  | (EventBase & { type: "button.clicked"; itemId: string; columnId: string })
  | (EventBase & { type: "sprint.started" | "sprint.completed"; sprintId: string })
  | (EventBase & { type: "workspace.changed" | "folder.changed" | "member.changed" });

export type AppEventType = AppEvent["type"];
export type AppEventOf<T extends AppEventType> = Extract<AppEvent, { type: T }>;
/** Distributive Omit so callers can emit without base fields */
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type NewAppEvent = DistributiveOmit<AppEvent, "at">;
/** What services pass to record(): actorId is filled in from the Actor. */
export type NewServiceEvent = DistributiveOmit<AppEvent, "at" | "actorId">;

type Listener = (e: AppEvent) => void;

const g = globalThis as unknown as { __weekendBus?: EventEmitter };
const bus = (g.__weekendBus ??= (() => {
  const b = new EventEmitter();
  b.setMaxListeners(0);
  return b;
})());

export function emit(event: NewAppEvent): void {
  const full = { ...event, at: new Date().toISOString() } as AppEvent;
  // listeners must never break the mutation that emitted the event
  for (const l of bus.listeners("*") as Listener[]) {
    try {
      l(full);
    } catch (err) {
      console.error("[events] listener failed", err);
    }
  }
}

/** Subscribe to every event. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  bus.on("*", listener);
  return () => bus.off("*", listener);
}

export function subscribeToBoard(boardId: string, listener: Listener): () => void {
  return subscribe((e) => {
    if (e.boardId === boardId) listener(e);
  });
}

export function subscribeToType<T extends AppEventType>(type: T, listener: (e: AppEventOf<T>) => void): () => void {
  return subscribe((e) => {
    if (e.type === type) listener(e as AppEventOf<T>);
  });
}
