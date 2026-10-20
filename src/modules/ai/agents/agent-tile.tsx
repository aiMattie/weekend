"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { initials, type AgentDto } from "./types";
import s from "../ai.module.css";

export const statusPill = (st: string) => (st === "active" || st === "success" ? s.pillGreen : st === "failed" ? s.pillRed : st === "capped" || st === "paused" || st === "skipped" ? s.pillOrange : st === "running" ? s.pillBlue : "");

export function AgentTile({ agent }: { agent: AgentDto }) {
  const t = useT();
  return (
    <Link href={`/agents/${agent.id}`} className={s.tile} style={{ textDecoration: "none", color: "inherit" }} data-testid="agent-tile" data-agent-id={agent.id}>
      <div className={s.tileHead}>
        <span className={s.avatar} style={{ background: agent.avatar }}>{initials(agent.name)}</span>
        <span className={s.tileName}>{agent.name}</span>
        <span className={`${s.pill} ${statusPill(agent.status)}`} style={{ marginLeft: "auto" }}>{t(`ai.ag.status.${agent.status}`)}</span>
      </div>
      <div className={s.tileDesc}>{agent.description || agent.instructions.slice(0, 120)}</div>
      <div className={s.tileFoot}><span>{agent.lastRun ? t("ai.ag.lastRun", { status: t(`ai.ag.run.${agent.lastRun.status}`) }) : t("ai.ag.neverRun")}</span></div>
    </Link>
  );
}
