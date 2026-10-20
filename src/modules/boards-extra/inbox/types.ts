/** Shared inbox types and constants (no db, no React). */
export const EVENT_TYPES = ["mention", "reply", "assigned", "update", "system", "automation"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** defaults when the user never saved a preference */
export const DEFAULT_SETTINGS: Record<EventType, { inApp: boolean; email: boolean }> = {
  mention: { inApp: true, email: true },
  reply: { inApp: true, email: true },
  assigned: { inApp: true, email: true },
  update: { inApp: true, email: false },
  system: { inApp: true, email: false },
  automation: { inApp: true, email: false },
};

export type InboxFilter = "all" | "unread" | "mentioned" | "assigned" | "bookmarked";

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string | null;
  boardId: string | null;
  itemId: string | null;
  updateId: string | null;
  link: string | null;
  read: boolean;
  bookmarked: boolean;
  createdAt: string;
  actor: { id: string; name: string; photoUrl: string | null } | null;
  itemName: string | null;
  boardName: string | null;
}
export interface NotificationPage { notifications: NotificationDto[]; nextCursor: string | null; unread: number }
export interface NotificationSetting { eventType: EventType; inApp: boolean; email: boolean }
