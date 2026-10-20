"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import { BuilderKnowledge } from "./builder-knowledge";
import { BuilderSettings } from "./builder-settings";
import { BuilderSkills } from "./builder-skills";
import { BuilderTriggers } from "./builder-triggers";
import { RunConsole } from "./run-console";
import { RunHistory } from "./run-history";
import { statusPill } from "./agent-tile";
import { initials, type AgentDto, type ToolInfo } from "./types";
import s from "../ai.module.css";

type Tab = "settings" | "triggers" | "skills" | "knowledge" | "test" | "runs";
const TABS: Tab[] = ["settings", "triggers", "skills", "knowledge", "test", "runs"];

export interface BuilderProps { agent: AgentDto; reload: () => void; tools: ToolInfo[]; boards: { id: string; name: string }[] }

/** /agents/:id: the agent builder (settings, triggers, skills, knowledge), test console and run history. */
export function AgentBuilder({ agentId }: { agentId: string }) {
  const t = useT();
  const [agent, setAgent] = useState<AgentDto | null>(null);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState<Tab>("settings");
  const [missing, setMissing] = useState(false);
  const [runsKey, setRunsKey] = useState(0);
  const reload = useCallback(() => { api.get<AgentDto>(`/api/v1/ai/agents/${agentId}`).then(setAgent).catch(() => setMissing(true)); }, [agentId]);
  useEffect(() => {
    reload();
    void api.get<{ tools: ToolInfo[] }>("/api/v1/ai/agents/catalog").then((c) => setTools(c.tools)).catch(() => undefined);
    void api.get<{ id: string; name: string; kind?: string }[]>("/api/v1/boards").then((b) => setBoards(b.filter((x) => !x.kind || x.kind === "board" || x.kind === "dev_sprints"))).catch(() => undefined);
  }, [reload]);
  if (missing) return <div className={`${s.wrap} ${s.ai}`}><Link href="/agents?view=mine">{t("ai.ag.back")}</Link><p className={s.muted}>404</p></div>;
  if (!agent) return <div className={`${s.wrap} ${s.ai}`} />;
  const props: BuilderProps = { agent, reload, tools, boards };
  return (
    <div className={`${s.pageScroll} ${s.ai}`} data-testid="agent-builder" data-agent-id={agent.id}>
      <div className={s.wrap}>
        <Link href="/agents?view=mine" style={{ fontSize: 13 }} data-testid="agent-back">{t("ai.ag.back")}</Link>
        <div className={s.row} style={{ margin: "12px 0 20px" }}>
          <span className={s.avatar} style={{ background: agent.avatar, width: 48, height: 48, fontSize: 18 }}>{initials(agent.name)}</span>
          <div style={{ flex: 1 }}><h1 className={s.h1} style={{ margin: 0 }} data-testid="agent-title">{agent.name}</h1><span className={s.muted}>{agent.identityName ? `${t("ai.ag.identity")}: ${agent.identityName}` : ""}</span></div>
          <span className={`${s.pill} ${statusPill(agent.status)}`} data-testid="agent-status">{t(`ai.ag.status.${agent.status}`)}</span>
        </div>
        <div className={s.tabs} role="tablist">
          {TABS.map((x) => <button key={x} type="button" role="tab" aria-selected={tab === x} className={`${s.tab} ${tab === x ? s.tabOn : ""}`} onClick={() => setTab(x)} data-testid={`agent-tab-${x}`}>{t(`ai.ag.tab.${x}`)}</button>)}
        </div>
        {tab === "settings" ? <BuilderSettings {...props} /> : null}
        {tab === "triggers" ? <BuilderTriggers {...props} /> : null}
        {tab === "skills" ? <BuilderSkills {...props} /> : null}
        {tab === "knowledge" ? <BuilderKnowledge {...props} /> : null}
        {tab === "test" ? <RunConsole {...props} onRan={() => { setRunsKey((k) => k + 1); reload(); }} /> : null}
        {tab === "runs" ? <RunHistory agentId={agent.id} refreshKey={runsKey} /> : null}
      </div>
    </div>
  );
}
