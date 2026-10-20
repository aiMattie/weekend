import { requireUser, userToActor } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { NoAccess } from "@/modules/admin/ui/no-access";
import { TeamsPage } from "@/modules/admin/ui/teams-page";
import { teams, users } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function Page() {
  const actor = userToActor(await requireUser());
  if (!can(actor, "account:teams")) return <NoAccess />;
  const people = users.list(actor).filter((u) => !u.isAiAgent || true).map((u) => ({ id: u.id, name: u.name, email: u.email, isAiAgent: u.isAiAgent }));
  return <TeamsPage teams={JSON.parse(JSON.stringify(teams.list(actor)))} people={people} />;
}
