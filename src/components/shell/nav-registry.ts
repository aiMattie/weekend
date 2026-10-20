/**
 * Navigation registry for the app shell. Modules add their own entries (one import + one line
 * in `navItems`) so rail/sidebar grow without editing the shell components.
 *
 *  - section "rail":        icon buttons in the narrow left rail (product areas)
 *  - section "sidebar-top": links above Favorites in the sidebar (Home, My work, ...)
 *
 * ADD AN ENTRY: create the page under src/app/(app)/<route>/page.tsx, then add a NavItem below.
 * Only client components import this file (it holds React icon components).
 */
import { Home } from "@vibe/icons";
import type { ComponentType } from "react";

export interface NavItem {
  id: string;
  /** i18n key under shell.* */
  labelKey: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
  href: string;
  section: "rail" | "sidebar-top";
  /** sort order within the section (ascending) */
  order: number;
  /** extra pathname prefixes that mark this entry active (default: href itself; "/" matches only "/") */
  activeOn?: string[];
  /** hide for these account roles (e.g. guests) */
  hideForRoles?: ("admin" | "member" | "guest" | "viewer")[];
  /** rail only: window event to dispatch on click instead of navigating (Sidekick opens its panel); `href` stays the full-page fallback */
  action?: string;
}

import { adminNavItems } from "./nav-items/admin";
import { boardsExtraNavItems } from "./nav-items/boards-extra";
import { devNavItems } from "./nav-items/dev";
import { automationsNavItems } from "./nav-items/automations";
import { platformNavItems } from "./nav-items/platform";
import { aiNavItems } from "./nav-items/ai";
import { wisprNavItems } from "./nav-items/wispr";

export const navItems: NavItem[] = [
  { id: "home", labelKey: "shell.home", icon: Home, href: "/", section: "sidebar-top", order: 10 },
  { id: "home-rail", labelKey: "shell.home", icon: Home, href: "/", section: "rail", order: 10, activeOn: ["/", "/boards", "/workspaces"] },
  // Other modules: { id: "my-work", labelKey: "shell.myWork", icon: MyWeek, href: "/my-work", section: "sidebar-top", order: 20 },
  ...adminNavItems,
  ...boardsExtraNavItems,
  ...devNavItems,
  ...automationsNavItems,
  ...platformNavItems,
  ...aiNavItems,
  ...wisprNavItems,
  // <- add new entries above this line
];

export const navFor = (section: NavItem["section"], role: string): NavItem[] =>
  navItems.filter((n) => n.section === section && !(n.hideForRoles ?? []).includes(role as never)).sort((a, b) => a.order - b.order);

export const isNavActive = (item: NavItem, pathname: string): boolean => {
  const prefixes = item.activeOn ?? [item.href];
  return prefixes.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/")));
};

