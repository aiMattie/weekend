import { redirect } from "next/navigation";
import { requireUser, userToActor } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const actor = userToActor(await requireUser());
  const target = [["account:invite", "users"], ["account:teams", "teams"], ["account:guests", "guests"], ["account:manage", "account"], ["account:security", "security"], ["account:audit", "audit"]]
    .find(([cap]) => can(actor, cap as "account:invite"));
  redirect(`/admin/${target?.[1] ?? "users"}`);
}
