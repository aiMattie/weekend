import { AgentIcon, NotetakerIcon, SparkleIcon } from "@/modules/ai/icons";
import type { NavItem } from "../nav-registry";

/** ai: Sidekick (opens the right-hand panel), Agents and Notetaker in the rail. */
export const aiNavItems: NavItem[] = [
  { id: "sidekick-rail", labelKey: "ai.nav.sidekick", icon: SparkleIcon, href: "/sidekick", action: "weekend:sidekick-toggle", section: "rail", order: 11, activeOn: ["/sidekick"], hideForRoles: ["guest"] },
  { id: "agents-rail", labelKey: "ai.nav.agents", icon: AgentIcon, href: "/agents", section: "rail", order: 12, activeOn: ["/agents"], hideForRoles: ["guest", "viewer"] },
  { id: "notetaker-rail", labelKey: "ai.nav.notetaker", icon: NotetakerIcon, href: "/notetaker", section: "rail", order: 13, activeOn: ["/notetaker"], hideForRoles: ["guest", "viewer"] },
];
