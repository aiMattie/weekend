"use client";

import type { ReactNode } from "react";

/**
 * Wrap a Vibe <Modal> in this: React synthetic events of a portal bubble through the React tree
 * (into table cells and the drag-and-drop column headers), so pointer/click/keyboard events are
 * stopped here.
 */
export function DialogRoot({ children }: { children: ReactNode }) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <div style={{ display: "contents" }} onPointerDown={stop} onMouseDown={stop} onClick={stop} onDoubleClick={stop} onKeyDown={stop} onKeyUp={stop}>
      {children}
    </div>
  );
}
