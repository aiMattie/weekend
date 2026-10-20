import { Code } from "@vibe/icons";
import type { NavItem } from "../nav-registry";

/** platform: API tokens / MCP page for members and viewers (admins reach it through the Admin center). */
export const platformNavItems: NavItem[] = [
  { id: "api", labelKey: "platform.nav", icon: Code, href: "/admin/api", section: "sidebar-top", order: 92, activeOn: ["/admin/api"], hideForRoles: ["admin", "guest"] },
];
