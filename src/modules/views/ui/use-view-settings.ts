"use client";

import { useCallback, useMemo, useState } from "react";
import type { BoardActions } from "@/components/board/use-board";
import type { ViewDto } from "@/lib/board-types";

/**
 * Read/patch the settings of a view. Users who may edit the board structure persist the patch to
 * the view (shared with everybody); everyone else keeps it local, so a viewer can still switch
 * month/week or zoom without a permission error.
 */
export function useViewSettings(view: ViewDto, actions: BoardActions, canPersist: boolean) {
  const [local, setLocal] = useState<Record<string, unknown>>({});
  const settings = useMemo(() => ({ ...view.settings, ...local }), [view.settings, local]);
  const patch = useCallback((p: Record<string, unknown>) => {
    if (canPersist) void actions.updateView(view.id, { settings: { ...view.settings, ...local, ...p } });
    else setLocal((cur) => ({ ...cur, ...p }));
  }, [actions, canPersist, view.id, view.settings, local]);
  return { settings, patch };
}
