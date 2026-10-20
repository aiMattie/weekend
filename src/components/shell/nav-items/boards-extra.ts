import { Dashboard, Doc, Form, Inbox, Layout, MyWeek } from "@vibe/icons";
import type { NavItem } from "../nav-registry";

/** boards-extra: My work, Inbox, Dashboards, Forms, Docs, Whiteboards. */
export const boardsExtraNavItems: NavItem[] = [
  { id: "my-work", labelKey: "extra.nav.myWork", icon: MyWeek, href: "/my-work", section: "sidebar-top", order: 20 },
  { id: "inbox", labelKey: "extra.nav.inbox", icon: Inbox, href: "/inbox", section: "sidebar-top", order: 25 },
  { id: "dashboards", labelKey: "extra.nav.dashboards", icon: Dashboard, href: "/dashboards", section: "sidebar-top", order: 40 },
  { id: "forms", labelKey: "extra.nav.forms", icon: Form, href: "/forms", section: "sidebar-top", order: 41 },
  { id: "docs", labelKey: "extra.nav.docs", icon: Doc, href: "/docs", section: "sidebar-top", order: 42 },
  { id: "whiteboards", labelKey: "extra.nav.whiteboards", icon: Layout, href: "/whiteboards", section: "sidebar-top", order: 43 },
  { id: "my-work-rail", labelKey: "extra.nav.myWork", icon: MyWeek, href: "/my-work", section: "rail", order: 20 },
  { id: "dashboards-rail", labelKey: "extra.nav.dashboards", icon: Dashboard, href: "/dashboards", section: "rail", order: 40 },
  { id: "forms-rail", labelKey: "extra.nav.forms", icon: Form, href: "/forms", section: "rail", order: 41 },
  { id: "docs-rail", labelKey: "extra.nav.docs", icon: Doc, href: "/docs", section: "rail", order: 42 },
  { id: "whiteboards-rail", labelKey: "extra.nav.whiteboards", icon: Layout, href: "/whiteboards", section: "rail", order: 43 },
];
