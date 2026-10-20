/** Type resolution + field resolvers for the ColumnValue interface and its fragments. */
import type { ColumnValueDto } from "../column-values";
import type { GqlContext } from "../context";
import * as services from "@/server/services";
import { statusLabels } from "@/server/columns/labels";

const TYPE_MAP: Record<string, string> = {
  status: "StatusValue", date: "DateValue", people: "PeopleValue", numbers: "NumbersValue", text: "TextValue", long_text: "LongTextValue",
  checkbox: "CheckboxValue", dropdown: "DropdownValue", link: "LinkValue", timeline: "TimelineValue", board_relation: "BoardRelationValue",
  mirror: "MirrorValue", formula: "FormulaValue", progress: "ProgressValue", file: "FileValue", tags: "TagsValue", rating: "RatingValue",
  email: "EmailValue", phone: "PhoneValue", week: "WeekValue", item_id: "ItemIdValue", creation_log: "CreationLogValue",
  last_updated: "LastUpdatedValue", subtasks: "SubtasksValue", button: "ButtonValue",
};

export const ColumnValueInterface = {
  __resolveType: (cv: ColumnValueDto) => TYPE_MAP[cv.type] ?? "GenericColumnValue",
};

type CV = ColumnValueDto;
const o = (cv: CV): Record<string, unknown> => (cv.raw && typeof cv.raw === "object" ? (cv.raw as Record<string, unknown>) : {});
const stored = (cv: CV): Record<string, unknown> => {
  const v = cv.item.values[cv.column.id];
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
};

const base = {
  id: (cv: CV) => cv.id,
  type: (cv: CV) => cv.type,
  text: (cv: CV) => cv.text,
  value: (cv: CV) => (cv.raw === null || cv.raw === undefined ? null : JSON.stringify(cv.raw)),
  column: (cv: CV) => cv.column,
  updated_at: (cv: CV) => cv.item.updatedAt,
};

/** linked item ids from any stored shape: { linkedPulseIds: [{ linkedPulseId }] }, { item_ids } or decorated { items } */
function linkedIds(v: Record<string, unknown>): string[] {
  const pulses = v.linkedPulseIds as { linkedPulseId: unknown }[] | undefined;
  if (Array.isArray(pulses)) return pulses.map((p) => String(p.linkedPulseId));
  if (Array.isArray(v.item_ids)) return (v.item_ids as unknown[]).map(String);
  return ((v.items as { id: string }[] | undefined) ?? []).map((i) => i.id);
}

const strOrNull = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));

export const columnValueResolvers: Record<string, Record<string, unknown>> = {
  StatusValue: {
    ...base,
    label: (cv: CV) => (cv.text === "" ? null : cv.text),
    index: (cv: CV) => (typeof stored(cv).index === "number" ? stored(cv).index : null),
    is_done: (cv: CV) => {
      const l = statusLabels(cv.column.settings).find((x) => x.id === stored(cv).index);
      return !!l?.isDone;
    },
    label_style: (cv: CV) => {
      const l = statusLabels(cv.column.settings).find((x) => x.id === stored(cv).index);
      return l ? { color: l.color, border: l.color } : null;
    },
    update_id: () => null,
  },
  DateValue: { ...base, date: (cv: CV) => strOrNull(stored(cv).date), time: (cv: CV) => strOrNull(stored(cv).time), icon: () => null },
  PeopleValue: { ...base, persons_and_teams: (cv: CV) => (o(cv).personsAndTeams as unknown[]) ?? null },
  NumbersValue: {
    ...base,
    number: (cv: CV) => (typeof cv.item.values[cv.column.id] === "number" ? cv.item.values[cv.column.id] : null),
    symbol: (cv: CV) => strOrNull(cv.column.settings.unit),
    direction: (cv: CV) => (cv.column.settings.unitPosition === "left" ? "left" : "right"),
  },
  TextValue: base,
  LongTextValue: base,
  CheckboxValue: { ...base, checked: (cv: CV) => !!stored(cv).checked },
  DropdownValue: {
    ...base,
    values: (cv: CV) => {
      const labels = (Array.isArray(cv.column.settings.labels) ? cv.column.settings.labels : []) as { id: number; text: string }[];
      return ((stored(cv).ids as number[]) ?? []).map((id) => ({ id, label: labels.find((l) => l.id === id)?.text ?? String(id) }));
    },
  },
  LinkValue: { ...base, url: (cv: CV) => strOrNull(stored(cv).url), url_text: (cv: CV) => strOrNull(stored(cv).text) },
  TimelineValue: { ...base, from: (cv: CV) => strOrNull(stored(cv).from), to: (cv: CV) => strOrNull(stored(cv).to), visualization_type: () => null },
  BoardRelationValue: {
    ...base,
    display_value: (cv: CV) => cv.text,
    linked_item_ids: (cv: CV) => linkedIds(stored(cv)),
    linked_board_ids: (cv: CV) => [...new Set(((stored(cv).items as { boardId: string }[] | undefined) ?? []).map((i) => i.boardId))],
    linked_items: (cv: CV, _a: unknown, ctx: GqlContext) =>
      linkedIds(stored(cv)).map((id) => { try { return services.items.get(ctx.actor, id); } catch { return null; } }).filter(Boolean),
  },
  MirrorValue: { ...base, display_value: (cv: CV) => cv.text, mirrored_items: () => [] },
  FormulaValue: { ...base, display_value: (cv: CV) => cv.text },
  ProgressValue: base,
  FileValue: { ...base, files: (cv: CV) => (stored(cv).files as unknown[]) ?? [] },
  TagsValue: {
    ...base,
    tag_ids: (cv: CV) => ((stored(cv).tag_ids ?? stored(cv).ids ?? []) as unknown[]).map(Number),
    tags: (cv: CV) => (stored(cv).tags as unknown[]) ?? [],
  },
  RatingValue: { ...base, rating: (cv: CV) => (typeof stored(cv).rating === "number" ? stored(cv).rating : null) },
  EmailValue: { ...base, email: (cv: CV) => strOrNull(stored(cv).email ?? stored(cv).text), label: (cv: CV) => strOrNull(stored(cv).text) },
  PhoneValue: { ...base, phone: (cv: CV) => strOrNull(stored(cv).phone), country_short_name: (cv: CV) => strOrNull(stored(cv).countryShortName ?? stored(cv).country_short_name) },
  WeekValue: { ...base, start_date: (cv: CV) => strOrNull(stored(cv).startDate), end_date: (cv: CV) => strOrNull(stored(cv).endDate) },
  ItemIdValue: { ...base, item_id: (cv: CV) => cv.item.id },
  CreationLogValue: { ...base, created_at: (cv: CV) => cv.item.createdAt, creator_id: (cv: CV) => cv.item.creatorId },
  LastUpdatedValue: { ...base, updated_at: (cv: CV) => cv.item.updatedAt, updater_id: () => null },
  SubtasksValue: { ...base, subitems_ids: (cv: CV, _a: unknown, ctx: GqlContext) => services.items.listSubitems(ctx.actor, cv.item.id).map((i) => i.id) },
  ButtonValue: { ...base, label: (cv: CV) => strOrNull(cv.column.settings.label), color: (cv: CV) => strOrNull(cv.column.settings.color) },
  GenericColumnValue: base,
};
