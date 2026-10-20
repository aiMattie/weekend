"use client";

import { Button, Icon } from "@vibe/core";
import { Add, Doc, Person } from "@vibe/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useCurrentUser } from "@/components/shell/user-context";
import { useLocale, useT } from "@/lib/i18n/client";
import { AgentTile } from "./agent-tile";
import { InstallDialog } from "./install-dialog";
import { initials, type AgentDto, type CatalogEntry } from "./types";
import s from "../ai.module.css";

export type HubView = "new" | "mine" | "directory";

/** /agents: left menu (New agent, My agents, Agent directory), content on the right. */
export function AgentsHub({ view }: { view: HubView }) {
  const t = useT();
  const locale = useLocale();
  const user = useCurrentUser();
  const router = useRouter();
  const [agents, setAgents] = useState<AgentDto[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [status, setStatus] = useState<{ configured: boolean; agentsEnabled: boolean } | null>(null);
  const [install, setInstall] = useState<CatalogEntry | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    void api.get<AgentDto[]>("/api/v1/ai/agents").then(setAgents).catch(() => undefined);
    void api.get<{ templates: CatalogEntry[] }>("/api/v1/ai/agents/catalog").then((c) => setCatalog(c.templates)).catch(() => undefined);
    void api.get<{ configured: boolean; agentsEnabled: boolean }>("/api/v1/ai/status").then(setStatus).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);
  const mine = agents.filter((a) => a.ownerId === user.id);

  const blank = async () => {
    setBusy(true); setError("");
    try { const a = await api.post<AgentDto>("/api/v1/ai/agents", { name: "Nieuwe agent" }); router.push(`/agents/${a.id}`); }
    catch (e) { setError(e instanceof Error ? e.message : t("ai.error")); setBusy(false); }
  };
  const draft = async () => {
    setBusy(true); setError("");
    try {
      const d = await api.post<{ name: string; description: string; instructions: string; skill?: { name: string; instruction: string; tools: string[] } }>("/api/v1/ai/agents/draft", { description });
      const a = await api.post<AgentDto>("/api/v1/ai/agents", { name: d.name, description: d.description, instructions: d.instructions });
      if (d.skill) await api.post(`/api/v1/ai/agents/${a.id}/skills`, d.skill);
      router.push(`/agents/${a.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : t("ai.error")); setBusy(false); }
  };

  const nav = [
    { id: "new" as const, label: t("ai.ag.new"), icon: <Icon icon={Add} size={18} ignoreFocusStyle />, href: "/agents" },
    { id: "mine" as const, label: t("ai.ag.mine"), icon: <Icon icon={Person} size={18} ignoreFocusStyle />, href: "/agents?view=mine" },
    { id: "directory" as const, label: t("ai.ag.directory"), icon: <Icon icon={Doc} size={18} ignoreFocusStyle />, href: "/agents?view=directory" },
  ];
  return (
    <div className={`${s.page} ${s.ai}`} data-testid="agents-page">
      <aside className={s.side}>
        <div className={s.sideTitle}>{t("ai.ag.title")}</div>
        {nav.map((n) => <Link key={n.id} href={n.href} className={`${s.sideBtn} ${view === n.id ? s.sideActive : ""}`} data-testid={`agents-nav-${n.id}`}>{n.icon}{n.label}</Link>)}
      </aside>
      <div className={s.pageScroll}>
        <div className={s.wrap}>
          {status && !status.configured ? <div className={s.banner} style={{ margin: "0 0 16px" }} data-testid="ai-not-configured"><strong>{t("ai.notConfigured")}</strong>{t("ai.notConfigured.sub")}</div> : null}
          {status && !status.agentsEnabled ? <div className={`${s.banner} ${s.bannerRed}`} style={{ margin: "0 0 16px" }} data-testid="agents-killed">{t("ai.ag.killed")}</div> : null}
          {view === "new" ? (
            <div className={s.hero}>
              <div className={s.rowEnd} style={{ marginBottom: -40 }}><Button size="small" kind="tertiary" onClick={() => void blank()} disabled={busy} data-testid="agent-blank">{t("ai.ag.startBlank")}</Button></div>
              <h1 className={s.heroTitle}>{t("ai.ag.meet").replace(/agents$/i, "")}<span className={s.grad}>agents</span></h1>
              <p className={s.sub}>{t("ai.ag.meetSub")}</p>
              <div className={s.promptBox}>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("ai.ag.describePh")} data-testid="agent-describe" />
                <div className={s.promptRow}><Button size="small" kind="primary" onClick={() => void draft()} disabled={busy || description.trim().length < 5 || !status?.configured} data-testid="agent-draft">{busy ? t("ai.ag.drafting") : t("ai.ag.draft")}</Button></div>
              </div>
              {error ? <div className={s.err} role="alert" style={{ maxWidth: 640, margin: "0 auto" }}>{error}</div> : null}
              <h2 style={{ textAlign: "left", fontSize: 18, margin: "40px 0 12px" }}>{t("ai.ag.directory")}</h2>
              <div className={s.grid} style={{ textAlign: "left" }}>
                {catalog.slice(0, 3).map((c) => <TemplateTile key={c.key} entry={c} locale={locale} onUse={() => setInstall(c)} />)}
              </div>
            </div>
          ) : view === "mine" ? (
            <>
              <h1 className={s.h1}>{t("ai.ag.mine")}</h1>
              {error ? <div className={s.err} role="alert">{error}</div> : null}
              {mine.length ? <div className={s.grid} data-testid="my-agents">{mine.map((a) => <AgentTile key={a.id} agent={a} />)}</div> : <p className={s.muted} data-testid="my-agents-empty">{t("ai.ag.noAgents")}</p>}
            </>
          ) : (
            <>
              <h1 className={s.h1}>{t("ai.ag.directory")}</h1>
              <p className={s.sub}>{t("ai.ag.meetSub")}</p>
              <div className={s.grid} data-testid="agent-catalog">{catalog.map((c) => <TemplateTile key={c.key} entry={c} locale={locale} onUse={() => setInstall(c)} />)}</div>
            </>
          )}
        </div>
      </div>
      {install ? <InstallDialog entry={install} onClose={() => setInstall(null)} onDone={(id) => router.push(`/agents/${id}`)} /> : null}
    </div>
  );
}

function TemplateTile({ entry, locale, onUse }: { entry: CatalogEntry; locale: string; onUse: () => void }) {
  const t = useT();
  return (
    <div className={s.tile} data-testid={`catalog-${entry.key}`}>
      <div className={s.tileHead}><span className={s.avatar} style={{ background: entry.avatar }}>{initials(entry.name)}</span><span className={s.tileName}>{entry.name}</span></div>
      <div className={s.tileDesc}>{locale === "en" ? entry.description.en : entry.description.nl}</div>
      <div className={s.tileFoot}>
        <span>{entry.installed ? t("ai.ag.installed", { n: entry.installed }) : entry.native ? t("ai.ag.native") : ""}</span>
        <Button size="xs" kind="primary" onClick={onUse} data-testid={`catalog-use-${entry.key}`}>{t("ai.ag.use")}</Button>
      </div>
    </div>
  );
}
