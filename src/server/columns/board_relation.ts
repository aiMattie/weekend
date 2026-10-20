import { ValidationError } from "../../lib/errors";
import { relationColumn } from "./relation-base";

export { makeRelationValue, relationIds, relationNames, type RelationValue } from "./relation-base";

/**
 * board_relation (Connect boards). settings:
 *   boardIds: string[]        boards that can be linked
 *   allowMultiple: boolean    false = "limit to one item" (default true)
 *   peerColumnId?: string     the column on the other board that mirrors this link (two-way)
 * Stored value: `{ linkedPulseIds: [{ linkedPulseId }] }`.
 */
export const boardRelationColumn = relationColumn({
  type: "board_relation",
  label: "Connect boards",
  category: "advanced",
  icon: "Connect",
  defaultSettings: () => ({ boardIds: [] as string[], allowMultiple: true }),
  normalizeSettings(s) {
    const raw = s.boardIds ?? s.board_ids ?? [];
    if (!Array.isArray(raw)) throw new ValidationError("settings.boardIds must be an array");
    const boardIds = [...new Set(raw.map((b) => String(b)))];
    if (boardIds.some((b) => !/^\d+$/.test(b))) throw new ValidationError("settings.boardIds must hold board ids");
    const { board_ids: _drop, ...rest } = s; // eslint-disable-line @typescript-eslint/no-unused-vars
    return { ...rest, boardIds, allowMultiple: s.allowMultiple !== false && s.allowMultipleItems !== false, ...(s.peerColumnId ? { peerColumnId: String(s.peerColumnId) } : {}) };
  },
});
