"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCurrentUser } from "@/components/shell/user-context";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/client";
import type { AssetDto } from "./assets";
import { uploadAsset } from "./assets";
import { UpdateCard, type CardCtx, type Dto } from "./update-card";
import { UpdateEditor } from "./update-editor";
import type { PanelTabProps } from "./tabs";
import styles from "./item-panel.module.css";

const walk = (list: Dto[]): Dto[] => list.flatMap((u) => [u, ...walk(u.replies)]);

export function UpdatesTab({ board, item, canComment, refreshKey }: PanelTabProps) {
  const t = useT();
  const me = useCurrentUser();
  const [updates, setUpdates] = useState<Dto[] | null>(null);
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set());
  const seenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [ups, files] = await Promise.all([
        api.get<Dto[]>(`/api/v1/items/${item.id}/updates`),
        api.get<AssetDto[]>(`/api/v1/assets?itemId=${item.id}`).catch(() => [] as AssetDto[]),
      ]);
      setUpdates(ups);
      setAssets(Array.isArray(files) ? files : []);
      const fresh = walk(ups).filter((u) => u.userId !== me.id && !u.seenBy.some((s) => s.id === me.id)).map((u) => u.id);
      if (fresh.length) {
        setUnreadIds((cur) => new Set([...cur, ...fresh]));
        if (seenTimer.current) clearTimeout(seenTimer.current);
        // the updates were visible for a moment: mark them as seen
        seenTimer.current = setTimeout(() => { void api.post(`/api/v1/items/${item.id}/seen`, {}).catch(() => undefined); }, 1000);
      }
    } catch {
      setUpdates((cur) => cur ?? []);
    }
  }, [item.id, me.id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load, item.updateCount, refreshKey]);
  useEffect(() => () => { if (seenTimer.current) clearTimeout(seenTimer.current); }, []);

  const submitUpdate = useCallback(async (body: string, files: File[], parentUpdateId?: string) => {
    setError(null);
    const created = await api.post<{ id: string }>(`/api/v1/items/${item.id}/updates`, { body: body || "<p></p>", parentUpdateId, withFiles: files.length > 0 });
    const failed: string[] = [];
    for (const f of files) {
      try { await uploadAsset(f, { boardId: board.board.id, itemId: item.id, updateId: created.id }); } catch (e) { failed.push(e instanceof Error ? e.message : f.name); }
    }
    if (failed.length) setError(failed.join("; "));
    await load();
  }, [item.id, board.board.id, load]);

  const assetsByUpdate = useMemo(() => {
    const m = new Map<string, AssetDto[]>();
    for (const a of assets) if (a.updateId) m.set(a.updateId, [...(m.get(a.updateId) ?? []), a]);
    return m;
  }, [assets]);

  const ctx: CardCtx = { board, itemId: item.id, me: { id: me.id, role: me.role }, canComment, assetsByUpdate, unreadIds, onChanged: () => void load(), submitUpdate };

  return (
    <div className={styles.tabBody} data-testid="updates-tab">
      {canComment ? <UpdateEditor users={board.users} teams={board.teams} onSubmit={(body, files) => submitUpdate(body, files)} /> : null}
      {error ? <div className={styles.errorLine} role="alert">{error}</div> : null}
      {updates && updates.length === 0 ? <div className={styles.empty} data-testid="updates-empty">{t("panel.noUpdates")}</div> : null}
      {updates?.map((u) => <UpdateCard key={u.id} u={u} ctx={ctx} depth={0} />)}
    </div>
  );
}
