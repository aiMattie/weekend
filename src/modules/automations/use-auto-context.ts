"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { useLocale } from "@/lib/i18n/client";
import type { BoardFull, ColumnDto, GroupDto } from "@/lib/board-types";

export interface ChatTarget { id: string; name: string; kind: string; connected: boolean }
export interface UiCtx {
  boardId: string;
  locale: "nl" | "en";
  board: BoardFull;
  boards: { id: string; name: string }[];
  chatTargets: ChatTarget[];
  /** columns/groups of any board (the current board comes from `board`, others are fetched) */
  boardColumns: (boardId: string) => ColumnDto[];
  boardGroups: (boardId: string) => GroupDto[];
  ensureBoard: (boardId: string) => void;
}

/** Loads what the pickers need: other boards, chat integrations and columns/groups of other boards on demand. */
export function useAutoContext(board: BoardFull): UiCtx {
  const locale = useLocale() as "nl" | "en";
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [chatTargets, setChatTargets] = useState<ChatTarget[]>([]);
  const [others, setOthers] = useState<Record<string, { columns: ColumnDto[]; groups: GroupDto[] }>>({});
  const asked = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;
    api.get<{ id: string; name: string; kind?: string }[]>("/api/v1/boards").then((b) => alive && setBoards(b.filter((x) => !x.kind || x.kind === "board" || x.kind === "dev_sprints"))).catch(() => undefined);
    api.get<ChatTarget[]>("/api/v1/integrations/chat-targets").then((t) => alive && setChatTargets(t)).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const ensureBoard = useCallback((id: string) => {
    if (!id || id === board.board.id || asked.current.has(id)) return;
    asked.current.add(id);
    Promise.all([api.get<ColumnDto[]>(`/api/v1/boards/${id}/columns`), api.get<GroupDto[]>(`/api/v1/boards/${id}/groups`)])
      .then(([columns, groups]) => setOthers((o) => ({ ...o, [id]: { columns, groups } })))
      .catch(() => asked.current.delete(id));
  }, [board.board.id]);

  return {
    boardId: board.board.id, locale, board, boards, chatTargets, ensureBoard,
    boardColumns: (id) => (id === board.board.id ? board.columns : others[id]?.columns ?? []).filter((c) => c.scope === "item" || !c.scope),
    boardGroups: (id) => (id === board.board.id ? board.groups : others[id]?.groups ?? []),
  };
}
