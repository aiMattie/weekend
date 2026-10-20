/** Column center catalog: which types exist per category, their icon and whether they need setup first. */
import type { Icon } from "@vibe/core";
import type { ComponentProps } from "react";
import {
  Battery, Check, Connect, Dependency, Doc, DropdownChevronDown, Email, File as FileIcon, Formula, Globe, Link, Location, Mirror, Mobile,
  Numbers, Person, Status, TextCopy, Tags, Time, Timeline, Calendar, ThumbsUp, ButtonIndicator, HighlightColorBucket, MyWeek, Update, Bookmark, Group,
} from "@vibe/icons";

export type CenterCategory = "essentials" | "super_useful";
type SvgIconType = ComponentProps<typeof Icon>["icon"];

export interface CatalogEntry {
  type: string;
  category: CenterCategory;
  icon: SvgIconType;
  /** accent color of the tile icon */
  color: string;
  /** the user must configure something before the column makes sense (shows the settings step) */
  needsSetup?: boolean;
}

export const CATALOG: CatalogEntry[] = [
  { type: "status", category: "essentials", icon: Status, color: "#00c875" },
  { type: "text", category: "essentials", icon: TextCopy, color: "#ffcb00" },
  { type: "people", category: "essentials", icon: Person, color: "#579bfc" },
  { type: "dropdown", category: "essentials", icon: DropdownChevronDown, color: "#00c875" },
  { type: "date", category: "essentials", icon: Calendar, color: "#a25ddc" },
  { type: "timeline", category: "essentials", icon: Timeline, color: "#a25ddc" },
  { type: "numbers", category: "essentials", icon: Numbers, color: "#ffcb00" },
  { type: "file", category: "essentials", icon: FileIcon, color: "#ff642e" },
  { type: "checkbox", category: "essentials", icon: Check, color: "#ff158a" },
  { type: "long_text", category: "essentials", icon: TextCopy, color: "#ffcb00" },
  { type: "link", category: "essentials", icon: Link, color: "#579bfc" },
  { type: "email", category: "essentials", icon: Email, color: "#579bfc" },
  { type: "phone", category: "essentials", icon: Mobile, color: "#579bfc" },
  { type: "tags", category: "essentials", icon: Tags, color: "#a25ddc" },
  { type: "board_relation", category: "super_useful", icon: Connect, color: "#ff158a", needsSetup: true },
  { type: "mirror", category: "super_useful", icon: Mirror, color: "#ff158a", needsSetup: true },
  { type: "formula", category: "super_useful", icon: Formula, color: "#00c875", needsSetup: true },
  { type: "dependency", category: "super_useful", icon: Dependency, color: "#579bfc" },
  { type: "time_tracking", category: "super_useful", icon: Time, color: "#a25ddc" },
  { type: "progress", category: "super_useful", icon: Battery, color: "#00c875" },
  { type: "rating", category: "super_useful", icon: Bookmark, color: "#fdab3d" },
  { type: "vote", category: "super_useful", icon: ThumbsUp, color: "#579bfc" },
  { type: "button", category: "super_useful", icon: ButtonIndicator, color: "#0073ea" },
  { type: "color_picker", category: "super_useful", icon: HighlightColorBucket, color: "#ff642e" },
  { type: "week", category: "super_useful", icon: MyWeek, color: "#a25ddc" },
  { type: "hour", category: "super_useful", icon: Time, color: "#a25ddc" },
  { type: "world_clock", category: "super_useful", icon: Globe, color: "#a25ddc" },
  { type: "location", category: "super_useful", icon: Location, color: "#ff158a" },
  { type: "country", category: "super_useful", icon: Globe, color: "#00c875" },
  { type: "doc", category: "super_useful", icon: Doc, color: "#ff642e" },
  { type: "item_assignees", category: "super_useful", icon: Group, color: "#579bfc" },
  { type: "auto_number", category: "super_useful", icon: Numbers, color: "#ffcb00" },
  { type: "item_id", category: "super_useful", icon: Numbers, color: "#ffcb00" },
  { type: "creation_log", category: "super_useful", icon: Calendar, color: "#a25ddc" },
  { type: "last_updated", category: "super_useful", icon: Update, color: "#a25ddc" },
];

export const catalogEntry = (type: string): CatalogEntry | undefined => CATALOG.find((c) => c.type === type);
/** Types that cannot be chosen when changing the type of an existing column. */
export const NO_CONVERT = new Set(["name", "subtasks", "sprint"]);
