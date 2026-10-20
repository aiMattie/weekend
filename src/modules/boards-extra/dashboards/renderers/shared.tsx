"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/client";

export const nf = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 });

export interface RendererProps<D = unknown, S = Record<string, unknown>> {
  data: D;
  settings: S;
  /** open an item in its board */
  openItem: (boardId: string, itemId: string) => void;
}

export function Empty({ children }: { children?: ReactNode }) {
  const t = useT();
  return <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--app-text-secondary)", fontSize: 13, textAlign: "center", padding: 12 }}>{children ?? t("dashboards.noData")}</div>;
}

/** Label for the "no value" group. */
export function useLabel() {
  const t = useT();
  return (label: string) => label || t("dashboards.empty");
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
