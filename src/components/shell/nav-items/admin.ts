import { Settings } from "@vibe/icons";
import type { NavItem } from "../nav-registry";

/** admin: Admin center (rail + sidebar) for account admins. Other roles with custom capabilities use the avatar menu. */
export const adminNavItems: NavItem[] = [
  { id: "admin", labelKey: "admin.nav.title", icon: Settings, href: "/admin", section: "sidebar-top", order: 90, activeOn: ["/admin"], hideForRoles: ["member", "viewer", "guest"] },
  { id: "admin-rail", labelKey: "admin.nav.title", icon: Settings, href: "/admin", section: "rail", order: 90, activeOn: ["/admin"], hideForRoles: ["member", "viewer", "guest"] },
];
