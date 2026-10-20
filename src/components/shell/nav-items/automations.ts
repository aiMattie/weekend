import { Integrations, Workflow } from "@vibe/icons";
import type { NavItem } from "../nav-registry";

/** automations: Integrations center and Workflows. */
export const automationsNavItems: NavItem[] = [
  { id: "integrations", labelKey: "auto.int.nav", icon: Integrations, href: "/integrations", section: "sidebar-top", order: 60 },
  { id: "workflows", labelKey: "auto.wf.nav", icon: Workflow, href: "/workflows", section: "sidebar-top", order: 61 },
  { id: "integrations-rail", labelKey: "auto.int.nav", icon: Integrations, href: "/integrations", section: "rail", order: 60 },
  { id: "workflows-rail", labelKey: "auto.wf.nav", icon: Workflow, href: "/workflows", section: "rail", order: 61 },
];
