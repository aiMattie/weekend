import { systemActor } from "../../../lib/actor";
import type { DevTemplateResult } from "../dev-template";
import { ensureRelationPair } from "./template-kit";
import type { DeliveryResult } from "./template-delivery";

/** Urenregistratie.Taak <-> Taken.Uren (also done by seedAllTemplates; repeated here so a Jira run is self-sufficient). */
export function linkUrenToTakenSafe(accountId: string, dev: DevTemplateResult, delivery: DeliveryResult): void {
  const sys = systemActor(accountId, "system");
  ensureRelationPair(sys, { boardId: delivery.boards.uren, key: "taak", title: "Taak" }, { boardId: dev.boards.taken, key: "uren", title: "Uren" }, { allowMultipleA: false });
}
