import { requireUser, userToActor } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { AdminNav, type AdminNavEntry } from "@/modules/admin/ui/admin-nav";
import { NoAccess } from "@/modules/admin/ui/no-access";
import styles from "@/modules/admin/ui/admin.module.css";

export const dynamic = "force-dynamic";

/** Admin center frame: left menu with the screens the user may open. Each page also checks its own permission. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const actor = userToActor(user);
  const entries: AdminNavEntry[] = [
    can(actor, "account:invite") && { id: "users", href: "/admin/users", labelKey: "admin.nav.users", group: "people" },
    can(actor, "account:teams") && { id: "teams", href: "/admin/teams", labelKey: "admin.nav.teams", group: "people" },
    can(actor, "account:guests") && { id: "guests", href: "/admin/guests", labelKey: "admin.nav.guests", group: "people" },
    can(actor, "account:invite") && { id: "roles", href: "/admin/roles", labelKey: "admin.nav.roles", group: "people" },
    can(actor, "account:manage") && { id: "account", href: "/admin/account", labelKey: "admin.nav.account", group: "settings" },
    can(actor, "account:security") && { id: "security", href: "/admin/security", labelKey: "admin.nav.security", group: "settings" },
    can(actor, "account:security") && { id: "sso", href: "/admin/sso", labelKey: "admin.nav.sso", group: "settings" },
    can(actor, "account:security") && { id: "saml", href: "/admin/security#security-sso", labelKey: "admin.nav.saml", group: "settings" },
    can(actor, "account:manage") && { id: "ai", href: "/admin/ai", labelKey: "ai.nav.admin", group: "settings" },
    can(actor, "account:audit") && { id: "audit", href: "/admin/audit", labelKey: "admin.nav.audit", group: "data" },
    actor.role !== "guest" && { id: "api", href: "/admin/api", labelKey: "platform.nav", group: "data" },
    actor.role === "admin" && { id: "import", href: "/admin/import", labelKey: "admin.nav.import", group: "data" },
  ].filter(Boolean) as AdminNavEntry[];
  if (!entries.length) return <NoAccess />;
  return (
    <div className={styles.layout} data-testid="admin-center">
      <AdminNav entries={entries} />
      <div className={styles.content}><div className={styles.page}>{children}</div></div>
    </div>
  );
}
