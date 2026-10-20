/**
 * Item-panel tab registry. ADD A TAB: create `<name>-tab.tsx` exporting a component taking
 * `PanelTabProps`, add ONE import and ONE entry to `PANEL_TABS` (e.g. time tracking, files).
 * `testId` is used as data-testid of the tab button (tab-<id>).
 */
import type { ComponentType } from "react";
import type { BoardFull, ItemDto } from "@/lib/board-types";
import { ActivityTab } from "./activity-tab";
import { FilesTab } from "./files-tab";
import { GitTab } from "@/modules/dev/git-tab";
import { SprintsTab } from "@/modules/dev/sprints-tab";
import { TimeTab } from "@/modules/dev/time-tab";
import { UpdatesTab } from "./updates-tab";

export interface PanelTabProps {
  board: BoardFull;
  item: ItemDto;
  canEdit: boolean;
  canComment: boolean;
  /** increments when the board changed (SSE): reload your data without remounting */
  refreshKey: number;
}

export interface PanelTab {
  id: string;
  /** i18n key */
  labelKey: string;
  Component: ComponentType<PanelTabProps>;
  /** show the tab only on boards for which this returns true (default: always) */
  visible?: (board: BoardFull) => boolean;
}

export const PANEL_TABS: PanelTab[] = [
  { id: "updates", labelKey: "panel.updates", Component: UpdatesTab },
  { id: "files", labelKey: "panel.files", Component: FilesTab },
  { id: "activity", labelKey: "panel.activity", Component: ActivityTab },
  { id: "git", labelKey: "panel.git", Component: GitTab },
  { id: "time", labelKey: "panel.time", Component: TimeTab },
  { id: "sprints", labelKey: "panel.sprints", Component: SprintsTab, visible: (b) => b.columns.some((c) => c.type === "sprint") },
  // <- add new tabs above this line
];
