import { Code } from "@vibe/icons";
import type { NavItem } from "../nav-registry";

/** dev: hub with sprint boards, active sprint and Git-koppeling. */
export const devNavItems: NavItem[] = [
  { id: "dev", labelKey: "dev.nav", icon: Code, href: "/dev", section: "sidebar-top", order: 30 },
  { id: "dev-rail", labelKey: "dev.nav", icon: Code, href: "/dev", section: "rail", order: 30 },
];
