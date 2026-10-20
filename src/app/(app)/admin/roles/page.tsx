import { requireUser, userToActor } from "@/lib/auth";
import { CAPABILITIES, can } from "@/lib/permissions";
import { NoAccess } from "@/modules/admin/ui/no-access";
import { RolesPage } from "@/modules/admin/ui/roles-page";
import { permissionsAdmin } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function Page() {
  const actor = userToActor(await requireUser());
  if (!can(actor, "account:invite")) return <NoAccess />;
  return (
    <RolesPage
      roles={JSON.parse(JSON.stringify(permissionsAdmin.listRoles(actor)))}
      builtin={permissionsAdmin.builtinMatrix()}
      capabilities={CAPABILITIES.map((c) => ({ key: c.key, group: c.group, labelKey: c.labelKey }))}
      canManage={can(actor, "account:manage")}
    />
  );
}
