"use client";

import { Button } from "@vibe/core";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { useLocale, useT } from "@/lib/i18n/client";
import type { IntegrationCatalogEntry, IntegrationDto } from "../types";
import { WebhooksSection } from "./webhooks-section";
import { tx } from "../field-input";
import s from "./integrations.module.css";

const COLORS: Record<string, string> = { slack: "#4a154b", teams: "#5059c9", github: "#24292f", gmail: "#ea4335", outlook: "#0078d4", jira: "#0052cc", webhook_in: "#00c875", webhook_out: "#a25ddc" };
const LOGO: Record<string, string> = { slack: "S", teams: "T", github: "GH", gmail: "G", outlook: "O", jira: "J", webhook_in: "↘", webhook_out: "↗" };

export interface BoardOpt { id: string; name: string }

function Instance({ it, entry, boards, reload }: { it: IntegrationDto; entry: IntegrationCatalogEntry; boards: BoardOpt[]; reload: () => void }) {
  const t = useT();
  const [config, setConfig] = useState<Record<string, unknown>>(it.config);
  const [groups, setGroups] = useState<{ id: string; title: string }[]>([]);
  const [mapText, setMapText] = useState(Object.entries((it.config.mapping as Record<string, string>) ?? {}).map(([k, v]) => `${k}=${v}`).join("\n"));
  const [saved, setSaved] = useState(false);
  const boardId = String(config.boardId ?? "");
  useEffect(() => {
    if (!boardId || entry.mode !== "inbound") return;
    void api.get<{ id: string; title: string }[]>(`/api/v1/boards/${boardId}/groups`).then(setGroups).catch(() => undefined);
  }, [boardId, entry.mode]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const save = async () => {
    const mapping = Object.fromEntries(mapText.split("\n").map((l) => l.split("=")).filter((p) => p.length >= 2 && p[0].trim()).map((p) => [p[0].trim(), p.slice(1).join("=").trim()]));
    await api.patch(`/api/v1/integrations/${it.id}`, { config: entry.mode === "inbound" ? { ...config, mapping } : config, boardId: boardId || undefined });
    setSaved(true); reload();
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div className={s.inst} data-testid={`int-instance-${it.id}`}>
      <div className={s.row}><strong>{it.name}</strong><span className={`${s.status} ${it.connected ? s.on : s.off}`} data-testid={`int-status-${it.id}`}>{it.connected ? t("auto.int.connected") : t("auto.int.notConnected")}</span></div>
      {entry.mode === "chat" ? <div className={s.muted}>{t("auto.int.hint.chat")}</div> : null}
      {entry.mode === "inbound" ? <div className={s.muted}>{t("auto.int.hint.inbound")}</div> : null}
      {entry.fields.map((f) => (
        <label key={f.key}><span className={s.label}>{tx(f.label, "nl")}</span>
          <input className={s.input} type={f.secret ? "password" : "text"} value={String(config[f.key] ?? "")} placeholder={f.placeholder} onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })} data-testid={`int-field-${it.id}-${f.key}`} autoComplete="off" />
        </label>
      ))}
      {entry.mode === "inbound" ? (
        <>
          <label><span className={s.label}>{t("auto.int.board")}</span>
            <select className={s.input} value={boardId} onChange={(e) => setConfig({ ...config, boardId: e.target.value, groupId: "" })} data-testid={`int-board-${it.id}`}>
              <option value="">-</option>{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          {groups.length ? <label><span className={s.label}>{t("auto.int.group")}</span>
            <select className={s.input} value={String(config.groupId ?? "")} onChange={(e) => setConfig({ ...config, groupId: e.target.value })}><option value="">-</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label> : null}
          <label><span className={s.label}>{t("auto.int.mapping")}</span><textarea className={s.input} rows={3} value={mapText} onChange={(e) => setMapText(e.target.value)} placeholder={"name=$.title\ndate=$.due"} data-testid={`int-mapping-${it.id}`} /></label>
          {it.inboundPath ? (
            <div><span className={s.label}>{t("auto.int.url")}</span>
              <div className={s.mono} data-testid={`int-url-${it.id}`}>{origin}{it.inboundPath}</div>
              <div className={s.row} style={{ marginTop: 6 }}>
                <Button size="xs" kind="tertiary" onClick={() => void navigator.clipboard?.writeText(`${origin}${it.inboundPath}`)}>{t("auto.int.copy")}</Button>
                <Button size="xs" kind="tertiary" onClick={() => void api.post(`/api/v1/integrations/${it.id}/regenerate`).then(reload)}>{t("auto.int.regen")}</Button>
              </div>
              {it.lastEventAt ? <div className={s.muted}>{t("auto.int.lastEvent")}: {new Date(it.lastEventAt).toLocaleString("nl-NL")}</div> : null}
            </div>
          ) : null}
        </>
      ) : null}
      <div className={s.row}>
        <Button size="small" kind="primary" onClick={() => void save()} data-testid={`int-save-${it.id}`}>{saved ? "✓" : t("auto.int.save")}</Button>
        <Button size="small" kind="tertiary" color="negative" onClick={() => { if (window.confirm(t("auto.deleteConfirm"))) void api.del(`/api/v1/integrations/${it.id}`).then(reload); }} data-testid={`int-remove-${it.id}`}>{t("auto.int.disconnect")}</Button>
      </div>
    </div>
  );
}

export function IntegrationsPage() {
  const t = useT();
  const locale = useLocale() as "nl" | "en";
  const [catalog, setCatalog] = useState<IntegrationCatalogEntry[]>([]);
  const [list, setList] = useState<IntegrationDto[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [boards, setBoards] = useState<BoardOpt[]>([]);
  const reload = useCallback(() => {
    api.get<IntegrationDto[]>("/api/v1/integrations").then((l) => { setList(l); setForbidden(false); }).catch(() => { setList([]); setForbidden(true); });
  }, []);
  useEffect(() => {
    void api.get<IntegrationCatalogEntry[]>("/api/v1/integrations/catalog").then(setCatalog);
    void api.get<BoardOpt[]>("/api/v1/boards").then(setBoards).catch(() => undefined);
    reload();
  }, [reload]);
  return (
    <div className={s.page} data-testid="integrations-page">
      <h1 className={s.title}>{t("auto.int.title")}</h1>
      <p className={s.sub}>{t("auto.int.sub")}</p>
      {forbidden ? <p className={s.muted} data-testid="int-forbidden">{t("auto.int.adminOnly")}</p> : null}
      <div className={s.grid}>
        {catalog.filter((c) => c.mode !== "outbound").map((c) => {
          const mine = (list ?? []).filter((i) => i.kind === c.kind);
          const connected = mine.some((i) => i.connected);
          return (
            <div key={c.kind} className={s.card} data-testid={`int-card-${c.kind}`}>
              <div className={s.cardHead}>
                <span className={s.logo} style={{ background: COLORS[c.kind] ?? "#0073ea" }}>{LOGO[c.kind] ?? c.name[0]}</span>
                <span className={s.name}>{c.name}</span>
                <span className={`${s.status} ${connected ? s.on : s.off}`} data-testid={`int-card-status-${c.kind}`}>{connected ? t("auto.int.connected") : t("auto.int.notConnected")}</span>
              </div>
              <div className={s.desc}>{tx(c.description, locale)}</div>
              {mine.map((i) => <Instance key={i.id} it={i} entry={c} boards={boards} reload={reload} />)}
              {!forbidden ? <div><Button size="small" kind={mine.length ? "tertiary" : "secondary"} onClick={() => void api.post("/api/v1/integrations", { kind: c.kind }).then(reload)} data-testid={`int-connect-${c.kind}`}>{mine.length ? `+ ${t("auto.int.connect")}` : t("auto.int.connect")}</Button></div> : null}
            </div>
          );
        })}
      </div>
      {!forbidden ? <WebhooksSection boards={boards} /> : null}
    </div>
  );
}
