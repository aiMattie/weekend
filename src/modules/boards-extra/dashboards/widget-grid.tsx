"use client";

import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { useMemo, type ReactNode } from "react";
import type { WidgetDto } from "./types";

/** 12-column drag/resize grid (react-grid-layout). `renderWidget` draws the card, the card header has class `.widgetHead` as drag handle. */
export function WidgetGrid({ widgets, editable, onLayout, renderWidget }: {
  widgets: WidgetDto[];
  editable: boolean;
  onLayout: (l: { id: string; x: number; y: number; w: number; h: number }[]) => void;
  renderWidget: (w: WidgetDto) => ReactNode;
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  const layout: Layout = useMemo(() => widgets.map((w) => ({ i: w.id, x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h, minW: 2, minH: 2 })), [widgets]);
  const commit = (next: Layout) => {
    const changed = next.some((n) => { const w = widgets.find((x) => x.id === n.i); return w && (w.layout.x !== n.x || w.layout.y !== n.y || w.layout.w !== n.w || w.layout.h !== n.h); });
    if (changed) onLayout(next.map((n) => ({ id: n.i, x: n.x, y: n.y, w: n.w, h: n.h })));
  };
  return (
    <div ref={containerRef} data-testid="widget-grid">
      {mounted && (
        <ReactGridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: 12, rowHeight: 56, margin: [12, 12], containerPadding: [0, 0] }}
          dragConfig={{ enabled: editable, bounded: false, handle: ".widgetHead", cancel: ".widgetActions" }}
          resizeConfig={{ enabled: editable, handles: ["se"] }}
          compactor={verticalCompactor}
          onLayoutChange={commit}
        >
          {widgets.map((w) => <div key={w.id} data-testid="widget" data-widget-id={w.id} data-widget-type={w.type}>{renderWidget(w)}</div>)}
        </ReactGridLayout>
      )}
    </div>
  );
}
