"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { BoardFull, ColumnDto } from "@/lib/board-types";
import { useT } from "@/lib/i18n/client";
import type { FormProps } from "./settings-forms";
import css from "./menu.module.css";

type BoardLite = { id: string; name: string; workspaceId: string };
type ColLite = { id: string; key: string; title: string; type: string; scope: string; settings: Record<string, unknown> };

const cache = new Map<string, ColLite[]>();
async function boardColumns(boardId: string): Promise<ColLite[]> {
  const hit = cache.get(boardId);
  if (hit) return hit;
  const cols = await api.get<ColLite[]>(`/api/v1/boards/${boardId}/columns?scope=item`);
  cache.set(boardId, cols);
  return cols;
}

/** Columns of other boards (for mirror targets and pairing). Cached per mount. */
function useBoardColumns(boardIds: string[], board: BoardFull): Record<string, ColLite[]> {
  const [map, setMap] = useState<Record<string, ColLite[]>>({});
  const key = boardIds.join(",");
  useEffect(() => {
    let alive = true;
    for (const id of boardIds) {
      if (id === board.board.id) continue;
      boardColumns(id).then((cols) => { if (alive) setMap((m) => ({ ...m, [id]: cols })); }).catch(() => undefined);
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const own = boardIds.includes(board.board.id) ? { [board.board.id]: board.columns.filter((c) => c.scope === "item") as ColLite[] } : {};
  return { ...map, ...own };
}

export function BoardRelationForm({ settings, onChange, column, board, mode }: FormProps) {
  const t = useT();
  const [boards, setBoards] = useState<BoardLite[]>([]);
  useEffect(() => { api.get<BoardLite[]>("/api/v1/boards").then(setBoards).catch(() => undefined); }, []);
  const ids = (settings.boardIds as string[] | undefined) ?? [];
  const locked = mode === "edit" && !!settings.peerColumnId; // changing boards of a paired column re-pairs it
  const targetCols = useBoardColumns(ids.length === 1 ? ids : [], board);
  const unlinked = (targetCols[ids[0]] ?? []).filter((c) => c.type === "board_relation" && !c.settings.peerColumnId && (c.settings.boardIds as string[] | undefined ?? []).length === 0 && c.id !== column?.id);
  const toggle = (id: string) => onChange({ boardIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id], peerColumnId: undefined });
  const pairing = settings.twoWay === false ? "none" : settings.peerColumnId ? String(settings.peerColumnId) : "new";
  return (
    <div className={css.form} data-testid="relation-form">
      <div className={css.field}>
        {t("col.relation.boards")}
        <div className={css.boardPick} data-testid="relation-boards">
          {boards.filter((b) => b.id !== undefined).map((b) => (
            <label key={b.id} className={css.check}>
              <input type="checkbox" checked={ids.includes(b.id)} data-testid={`relation-board-${b.name}`} onChange={() => toggle(b.id)} />
              {b.name}{b.id === board.board.id ? ` (${t("col.relation.thisBoard")})` : ""}
            </label>
          ))}
        </div>
      </div>
      <label className={css.check}>
        <input type="checkbox" checked={settings.allowMultiple === false} data-testid="relation-limit-one" onChange={(e) => onChange({ allowMultiple: !e.target.checked })} />
        {t("col.relation.limitOne")}
      </label>
      {ids.length === 1 && ids[0] !== board.board.id ? (
        <label className={css.field}>
          {t("col.relation.twoWay")}
          <select value={pairing} disabled={locked && pairing !== "none"} data-testid="relation-pairing" onChange={(e) => {
            const v = e.target.value;
            onChange(v === "new" ? { twoWay: true, peerColumnId: undefined } : v === "none" ? { twoWay: false, peerColumnId: undefined } : { twoWay: true, peerColumnId: v });
          }}>
            <option value="new">{t("col.relation.twoWayNew")}</option>
            <option value="none">{t("col.relation.oneWay")}</option>
            {settings.peerColumnId && !unlinked.some((c) => c.id === settings.peerColumnId) ? <option value={String(settings.peerColumnId)}>{t("col.relation.paired")}</option> : null}
            {unlinked.map((c) => <option key={c.id} value={c.id}>{t("col.relation.pairWith", { name: c.title })}</option>)}
          </select>
        </label>
      ) : null}
    </div>
  );
}

export function MirrorForm({ settings, onChange, column, board }: FormProps) {
  const t = useT();
  const relations = board.columns.filter((c) => c.type === "board_relation" && c.scope === "item" && c.id !== column?.id) as ColumnDto[];
  const rel = relations.find((r) => r.id === settings.relationColumnId || r.key === settings.relationColumnId);
  const targets = (rel?.settings.boardIds as string[] | undefined) ?? [];
  const cols = useBoardColumns(targets, board);
  const options = targets.flatMap((b) => (cols[b] ?? []).filter((c) => c.type !== "name" && c.type !== "mirror" && c.type !== "subtasks").map((c) => ({ ...c, boardId: b })));
  const names = (id: string) => (id === board.board.id ? board.board.name : id);
  return (
    <div className={css.form} data-testid="mirror-form">
      <label className={css.field}>
        {t("col.mirror.relation")}
        <select value={String(settings.relationColumnId ?? "")} data-testid="mirror-relation" onChange={(e) => onChange({ relationColumnId: e.target.value, targetColumnId: "" })}>
          <option value="">{t("col.mirror.choose")}</option>
          {relations.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </label>
      {!relations.length ? <span className={css.hintErr}>{t("col.mirror.noRelation")}</span> : null}
      <label className={css.field}>
        {t("col.mirror.target")}
        <select value={String(settings.targetColumnId ?? "")} disabled={!rel} data-testid="mirror-target" onChange={(e) => onChange({ targetColumnId: e.target.value })}>
          <option value="">{t("col.mirror.choose")}</option>
          {options.map((c) => <option key={`${c.boardId}-${c.id}`} value={c.id}>{targets.length > 1 ? `${names(c.boardId)} / ` : ""}{c.title}</option>)}
        </select>
      </label>
      <AggregateSelect value={String(settings.aggregate ?? "none")} onChange={(v) => onChange({ aggregate: v })} />
    </div>
  );
}

export function AggregateSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <label className={css.field}>
      {t("col.mirror.aggregate")}
      <select value={value} data-testid="mirror-aggregate" onChange={(e) => onChange(e.target.value)}>
        {["none", "sum", "avg", "min", "max", "median", "count"].map((a) => <option key={a} value={a}>{t(`col.agg.${a}`)}</option>)}
      </select>
    </label>
  );
}

export function ProgressForm({ settings, onChange, column, board }: FormProps) {
  const t = useT();
  const source = settings.source === "relation" ? "relation" : "subitems";
  const relations = board.columns.filter((c) => c.type === "board_relation" && c.scope === "item" && c.id !== column?.id);
  return (
    <div className={css.form} data-testid="progress-form">
      <label className={css.field}>
        {t("col.progress.source")}
        <select value={source} data-testid="progress-source" onChange={(e) => onChange({ source: e.target.value })}>
          <option value="subitems">{t("col.progress.subitems")}</option>
          <option value="relation">{t("col.progress.relation")}</option>
        </select>
      </label>
      {source === "relation" ? (
        <label className={css.field}>
          {t("col.mirror.relation")}
          <select value={String(settings.relationColumnId ?? "")} onChange={(e) => onChange({ relationColumnId: e.target.value })}>
            <option value="">{t("col.mirror.choose")}</option>
            {relations.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </label>
      ) : null}
      <span className={css.hint}>{t("col.progress.hint")}</span>
    </div>
  );
}
