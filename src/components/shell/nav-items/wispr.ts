import { MeetingsIcon } from "@/modules/wispr/icon";
import type { NavItem } from "../nav-registry";

/** wispr: Wispr Flow meetings page in the rail, next to Notetaker. */
export const wisprNavItems: NavItem[] = [
  { id: "meetings-rail", labelKey: "wispr.nav", icon: MeetingsIcon, href: "/meetings", section: "rail", order: 14, activeOn: ["/meetings"], hideForRoles: ["guest", "viewer"] },
];
