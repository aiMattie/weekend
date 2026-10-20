import { ForbiddenError } from "@/lib/errors";
import { api } from "@/server/http";
import { inbox } from "@/server/services";

/** Admin/system only: build and "send" (outbox) the daily digests. Call from a scheduler. */
export const POST = api(({ actor }) => {
  if (!actor.isSystem && actor.role !== "admin") throw new ForbiddenError();
  return { sent: inbox.sendDailyDigests() };
});
