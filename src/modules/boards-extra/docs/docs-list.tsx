"use client";

import { Button } from "@vibe/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useIsClient } from "@/lib/use-persistent-state";
import { useT } from "@/lib/i18n/client";
import type { DocSummary } from "@/server/services/docs";
import styles from "./docs.module.css";

const isImage = (c: string | null) => !!c && !c.startsWith("#");

export function DocsList({ docs, workspaces, defaultWorkspaceId }: { docs: DocSummary[]; workspaces: { id: string; name: string }[]; defaultWorkspaceId: string | null }) {
  const t = useT();
  const hydrated = useIsClient();
  const router = useRouter();
  const [ws, setWs] = useState(defaultWorkspaceId ?? workspaces[0]?.id ?? "");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wsName = useMemo(() => new Map(workspaces.map((w) => [w.id, w.name])), [workspaces]);
  const shown = docs.filter((d) => filter === "all" || d.workspaceId === filter);

  const create = async () => {
    if (!ws || busy) return;
    setBusy(true);
    setError("");
    const r = await fetch("/api/v1/docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: ws }) });
    if (r.ok) router.push(`/docs/${(await r.json()).id}`);
    else { setError((await r.json().catch(() => null))?.error?.message ?? t("common.error")); setBusy(false); }
  };

  return (
    <div className={styles.list} data-testid="docs-page">
      <div className={styles.listHead}>
        <h1 className={styles.listTitle}>{t("extra.nav.docs")}</h1>
        <select className={styles.wsSelect} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t("docs.filterWorkspace")} data-testid="docs-filter">
          <option value="all">{t("docs.allWorkspaces")}</option>
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select className={styles.wsSelect} value={ws} onChange={(e) => setWs(e.target.value)} aria-label={t("docs.newIn")} data-testid="new-doc-workspace">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <Button onClick={() => void create()} disabled={!ws || busy || !hydrated} data-testid="new-doc">{t("docs.newDoc")}</Button>
      </div>
      {error && <div className={styles.saveError} role="alert">{error}</div>}
      {!shown.length ? <div className={styles.empty} data-testid="docs-empty">{t("docs.empty")}</div> : (
        <div className={styles.grid}>
          {shown.map((d) => (
            <Link key={d.id} href={`/docs/${d.id}`} className={styles.docCard} data-testid="doc-card" data-doc-id={d.id}>
              <div className={styles.docCardCover} style={d.cover ? (isImage(d.cover) ? { backgroundImage: `url("${d.cover}")` } : { background: d.cover }) : undefined} />
              <div className={styles.docCardBody}>
                <div className={styles.docCardTitle}>{d.title}</div>
                <div className={styles.docCardExcerpt}>{d.excerpt}</div>
                <div className={styles.docCardMeta}>
                  {d.itemName ? `${t("docs.onItem")}: ${d.itemName}` : wsName.get(d.workspaceId)} · {new Date(d.updatedAt).toLocaleDateString("nl-NL")}
                  {d.visibility === "private" ? ` · ${t("docs.private")}` : ""}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
