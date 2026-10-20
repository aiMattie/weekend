import { requireUser, userToActor } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { NoAccess } from "@/modules/admin/ui/no-access";
import { AiSettingsPage } from "@/modules/ai/admin/ai-settings-page";
import { ai } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function Page() {
  const actor = userToActor(await requireUser());
  if (!can(actor, "account:manage")) return <NoAccess />;
  return <AiSettingsPage initial={{ settings: ai.getSettings(actor.accountId), status: ai.status(actor), usage: ai.usageSummary(actor) }} />;
}
