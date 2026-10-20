"use client";

import type { ReactNode } from "react";
import styles from "./whiteboard.module.css";
import { boundsOf, connectorEnds, penPath, type El } from "./model";

const STROKE = "#323338";

/** Text inside a shape (HTML in a foreignObject so it wraps). */
function Cell({ r, text, top, color }: { r: { x: number; y: number; w: number; h: number }; text?: string; top?: boolean; color?: string }) {
  return (
    <foreignObject x={r.x} y={r.y} width={Math.max(r.w, 1)} height={Math.max(r.h, 1)} style={{ pointerEvents: "none" }}>
      <div className={`${styles.cell} ${top ? styles.cellTop : styles.cellCenter}`} style={color ? { color } : undefined}>{text}</div>
    </foreignObject>
  );
}

export function renderBody(el: El, all: Map<string, El>): ReactNode {
  const r = boundsOf(el, all);
  const fill = el.color ?? "#ffeb8a";
  switch (el.type) {
    case "note":
      return (<>
        <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={4} fill={fill} filter="drop-shadow(0 2px 3px rgba(0,0,0,.25))" />
        <Cell r={r} text={el.text} top />
      </>);
    case "rect":
      return (<><rect x={r.x} y={r.y} width={r.w} height={r.h} rx={6} fill={fill} stroke={STROKE} strokeWidth={2} /><Cell r={r} text={el.text} /></>);
    case "ellipse":
      return (<><ellipse cx={r.x + r.w / 2} cy={r.y + r.h / 2} rx={r.w / 2} ry={r.h / 2} fill={fill} stroke={STROKE} strokeWidth={2} /><Cell r={r} text={el.text} /></>);
    case "diamond":
      return (<>
        <polygon points={`${r.x + r.w / 2},${r.y} ${r.x + r.w},${r.y + r.h / 2} ${r.x + r.w / 2},${r.y + r.h} ${r.x},${r.y + r.h / 2}`} fill={fill} stroke={STROKE} strokeWidth={2} />
        <Cell r={r} text={el.text} />
      </>);
    case "text":
      return (<><rect x={r.x} y={r.y} width={r.w} height={r.h} fill="transparent" /><Cell r={r} text={el.text} top color={el.color && el.color !== "#ffeb8a" ? el.color : undefined} /></>);
    case "image":
      return <image href={el.src} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="xMidYMid meet" />;
    case "pen":
      return <path d={penPath(el)} transform={`translate(${el.x} ${el.y})`} fill="none" stroke={el.color && el.color !== "#ffeb8a" ? el.color : STROKE} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />;
    case "connector": {
      const [a, b] = connectorEnds(el, all);
      return (<>
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={STROKE} strokeWidth={2} markerEnd="url(#wb-arrow)" />
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={14} />
      </>);
    }
    default:
      return null;
  }
}
