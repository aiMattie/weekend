"use client";

import { Button } from "@vibe/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useIsClient } from "@/lib/use-persistent-state";
import { useT } from "@/lib/i18n/client";
import styles from "./whiteboard.module.css";

export interface BoardSummary { id: string; name: string; workspaceId: string; elementCount: number; updatedAt: string }

export function WhiteboardsList({ boards, workspaces, defaultWorkspaceId }: { boards: BoardSummary[]; workspaces: { id: string; name: string }[]; defaultWorkspaceId: string | null }) {
  const t = useT();
  const hydrated = useIsClient();
  const router = useRouter();
  const [ws, setWs] = useState(defaultWorkspaceId ?? workspaces[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wsName = new Map(workspaces.map((w) => [w.id, w.name]));
  const create = async () => {
    if (!ws || busy) return;
    setBusy(true);
    const r = await fetch("/api/v1/whiteboards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: ws }) });
    if (r.ok) router.push(`/whiteboards/${(await r.json()).id}`);
    else { setError((await r.json().catch(() => null))?.error?.message ?? t("common.error")); setBusy(false); }
  };
  return (
    <div className={styles.list} data-testid="whiteboards-page">
      <div className={styles.listHead}>
        <h1 className={styles.listTitle}>{t("docs.wb.title")}</h1>
        <select className={styles.select} value={ws} onChange={(e) => setWs(e.target.value)} aria-label={t("docs.wb.newIn")} data-testid="new-wb-workspace">
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <Button onClick={() => void create()} disabled={!ws || busy || !hydrated} data-testid="new-whiteboard">{t("docs.wb.new")}</Button>
      </div>
      {error && <div role="alert" style={{ color: "#df2f4a" }}>{error}</div>}
      {!boards.length ? <div className={styles.empty}>{t("docs.wb.empty")}</div> : (
        <div className={styles.grid}>
          {boards.map((b) => (
            <Link key={b.id} href={`/whiteboards/${b.id}`} className={styles.card} data-testid="whiteboard-card" data-wb-id={b.id}>
              <span className={styles.cardTitle}>{b.name}</span>
              <span className={styles.cardMeta}>{wsName.get(b.workspaceId)} · {t("docs.wb.elements", { n: b.elementCount })} · {new Date(b.updatedAt).toLocaleDateString("nl-NL")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
