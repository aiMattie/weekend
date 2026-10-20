import { requireUser, userToActor } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AuditPage } from "@/modules/admin/ui/audit-page";
import { NoAccess } from "@/modules/admin/ui/no-access";
import { audit } from "@/server/services";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const actor = userToActor(await requireUser());
  if (!can(actor, "account:audit")) return <NoAccess />;
  const filters = { q: sp.q, category: sp.category, event: sp.event, from: sp.from, to: sp.to, cursor: sp.cursor, limit: 50 };
  const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));
  const page = audit.list(actor, clean);
  return <AuditPage page={JSON.parse(JSON.stringify(page))} events={audit.eventNames(actor)} filters={Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, v ?? ""]))} />;
}
