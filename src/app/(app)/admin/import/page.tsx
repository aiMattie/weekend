import { requireUser, userToActor } from "@/lib/auth";
import { translate } from "@/lib/i18n";
import { ImportPage } from "@/modules/migration/import-page";
import { importConnections, importer } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
  const user = await requireUser();
  if (user.role !== "admin") return <div style={{ padding: 32 }} data-testid="import-no-access">{translate("nl", "migration.noAccess")}</div>;
  const actor = userToActor(user);
  const jobs = importer.listJobs(actor);
  const connections = importConnections.adminView(actor);
  const mondayLinked = connections.connections.some((c) => c.kind === "monday" && c.linked);
  return <ImportPage initialJobs={JSON.parse(JSON.stringify(jobs))} connections={JSON.parse(JSON.stringify(connections))} hasKey={mondayLinked || !!process.env.MONDAY_API_URL || process.env.E2E_RESET === "1"} />;
}
