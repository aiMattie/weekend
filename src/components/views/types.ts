import type { BoardFull, ViewDto } from "@/lib/board-types";
import type { ViewState } from "@/lib/view-state";
import type { BoardActions } from "@/components/board/use-board";

/**
 * Props every view component receives (table, kanban, calendar ...).
 * `viewState` = toolbar state (search/person/filters/sort/hidden/groupBy); apply it with
 * `buildRenderGroups` / `itemMatches` from src/lib/view-state.ts so the toolbar works in your view.
 */
export interface ViewProps {
  board: BoardFull;
  view: ViewDto;
  viewState: ViewState;
  /** merge a patch into the toolbar state (sort from a column menu, hide a column ...) */
  setViewState: (patch: Partial<ViewState>) => void;
  actions: BoardActions;
  /** open the item panel (null closes) */
  onOpenItem: (itemId: string | null) => void;
  openItemId: string | null;
  /** item whose name should be in edit mode (set after creating an item from the toolbar) */
  editItemId: string | null;
  setEditItemId: (id: string | null) => void;
  /** false when the user may not edit items on this board */
  canEdit: boolean;
  canEditStructure: boolean;
}
