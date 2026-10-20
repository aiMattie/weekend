"use client";

/** Rail icons in the (outlined, 24px grid): Sidekick sparkle, Agent, Notetaker waveform. */
import type { SVGProps } from "react";

type P = { size?: number | string; className?: string } & Omit<SVGProps<SVGSVGElement>, "width" | "height">;
const base = (size: number | string | undefined) => ({ width: size ?? 24, height: size ?? 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

export function SparkleIcon({ size, className }: P) {
  return (<svg {...base(size)} className={className}><path d="M12 3.5c.6 4.6 3 7 8 8.5-5 1.5-7.4 3.9-8 8.5-.6-4.6-3-7-8-8.5 5-1.5 7.4-3.9 8-8.5Z" /></svg>);
}
export function AgentIcon({ size, className }: P) {
  return (<svg {...base(size)} className={className}><path d="M9.2 20.5c-2.9 0-4.7-2.4-4.7-5 0-3.4 2.6-5.1 4.6-5.1 1.1 0 1.9.4 2.6 1 .7-.6 1.5-1 2.6-1 2 0 4.6 1.7 4.6 5.1 0 2.6-1.8 5-4.7 5-1.1 0-1.8-.5-2.5-1.2-.7.7-1.4 1.2-2.5 1.2Z" /><path d="M12 10.4V6.5M9.7 6.5h4.6" /></svg>);
}
export function NotetakerIcon({ size, className }: P) {
  return (<svg {...base(size)} className={className}><path d="M5 10v4M8.5 7v10M12 4v16M15.5 8v8M19 10.5v3" /></svg>);
}
