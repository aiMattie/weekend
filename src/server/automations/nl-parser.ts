/**
 * Simple pattern parser: English/Dutch sentence -> automation definition draft.
 * "When status changes to Done, move item to group Afgerond then notify Admin"
 * The ai agent can later replace this with Claude; the service API (planWorkflow/createFromText) stays.
 */
import type { AutomationDefinition, BlockRef, Step } from "./model";

export interface ParseColumn { id: string; key: string; title: string; type: string; settings: Record<string, unknown> }
export interface ParseContext {
  columns: ParseColumn[];
  groups: { id: string; title: string }[];
  users: { id: string; name: string; email: string }[];
  boards: { id: string; name: string }[];
}
export interface ParseResult { definition: AutomationDefinition | null; name: string; notes: string[] }

const lc = (s: string) => s.toLowerCase();
const labelsOf = (c: ParseColumn) => (Array.isArray(c.settings.labels) ? (c.settings.labels as { id: number; text: string }[]) : []);
const WEEKDAYS: Record<string, number> = { monday: 1, maandag: 1, tuesday: 2, dinsdag: 2, wednesday: 3, woensdag: 3, thursday: 4, donderdag: 4, friday: 5, vrijdag: 5, saturday: 6, zaterdag: 6, sunday: 7, zondag: 7 };

/** longest candidate whose text occurs in `text` */
function pick<T>(text: string, cands: T[], get: (c: T) => string): T | undefined {
  const t = lc(text);
  return cands.filter((c) => get(c).trim() && t.includes(lc(get(c)))).sort((a, b) => get(b).length - get(a).length)[0];
}

function findStatusLabel(text: string, ctx: ParseContext): { col: ParseColumn; label: { id: number; text: string } } | undefined {
  let best: { col: ParseColumn; label: { id: number; text: string } } | undefined;
  for (const col of ctx.columns.filter((c) => c.type === "status")) {
    const l = pick(text, labelsOf(col), (x) => x.text);
    if (l && (!best || l.text.length > best.label.text.length)) best = { col, label: l };
  }
  return best;
}

function parseTrigger(part: string, ctx: ParseContext, notes: string[]): BlockRef | null {
  const t = lc(part);
  const rec = /\b(every|elke|iedere|elk)\s+(day|dag|weekday|werkdag|week|month|maand|monday|maandag|tuesday|dinsdag|wednesday|woensdag|thursday|donderdag|friday|vrijdag|saturday|zaterdag|sunday|zondag)\b(?:.*?\b(?:at|om)\s+(\d{1,2})[:.](\d{2}))?/.exec(t);
  if (rec) {
    const w = rec[2];
    const every = WEEKDAYS[w] ? "week" : /^(day|dag)$/.test(w) ? "day" : /^(weekday|werkdag)$/.test(w) ? "weekday" : /^(week)$/.test(w) ? "week" : "month";
    return { type: "recurring", config: { every, weekday: WEEKDAYS[w] ?? 1, dayOfMonth: 1, time: rec[3] ? `${rec[3].padStart(2, "0")}:${rec[4]}` : "09:00" } };
  }
  const dur = /(\d+)\s*(?:days?|dagen)\b.*\b(?:in|op|at)\b/.exec(t);
  const st = findStatusLabel(part, ctx);
  if (dur && st && /(longer|langer|stays|blijft|more than|meer dan)/.test(t)) return { type: "status_duration", config: { columnId: st.col.id, labelId: String(st.label.id), days: Number(dur[1]) } };
  if (/\b(sprint)\b.*\b(start|begint|gestart)/.test(t)) return { type: "sprint_started", config: {} };
  if (/\b(sprint)\b.*\b(complete|afgesloten|klaar|done|finished)/.test(t)) return { type: "sprint_completed", config: {} };
  if (/\b(button|knop)\b/.test(t)) { const b = ctx.columns.find((c) => c.type === "button"); if (b) return { type: "button_clicked", config: { columnId: b.id } }; notes.push("No button column on this board"); }
  if (/(date|datum|deadline|due)/.test(t) && /(arrives|bereikt|aanbreekt|is here|breekt aan|arrive)/.test(t)) {
    const col = ctx.columns.find((c) => c.type === "date");
    if (col) {
      const n = /(\d+)\s*(?:days?|dagen)\s*(before|voor|after|na)/.exec(t);
      return { type: "date_arrives", config: { columnId: col.id, direction: n ? (/before|voor/.test(n[2]) ? "before" : "after") : "at", offsetValue: n ? Number(n[1]) : 0, offsetUnit: "days", time: "09:00" } };
    }
    notes.push("No date column on this board");
  }
  if (/(subitem).*(created|aangemaakt)/.test(t)) return { type: "subitem_created", config: {} };
  if (/(subitem).*(done|klaar|completed|afgerond)/.test(t)) return { type: "subitem_completed", config: {} };
  if (/(item|nieuw item|new item|taak).*(created|aangemaakt|toegevoegd|added)|new item|nieuw item/.test(t)) return { type: "item_created", config: {} };
  if (/(update).*(posted|geplaatst|created|aangemaakt)/.test(t)) return { type: "update_created", config: {} };
  const mv = /(?:moved|verplaatst|verschoven).*?(?:to|naar)\s+(?:group\s+|groep\s+)?(.+)/.exec(t);
  if (mv) { const g = pick(mv[1], ctx.groups, (x) => x.title); if (g) return { type: "item_moved_to_group", config: { groupId: g.id } }; }
  if (/(status|wordt|verandert|changes? to|is)/.test(t) && st) return { type: "status_changes_to", config: { columnId: st.col.id, labelId: String(st.label.id) } };
  if (/(assigned|toegewezen)/.test(t)) return { type: "person_assigned", config: {} };
  return null;
}

function quoted(s: string): string | undefined { return /["“'‘](.+?)["”'’]/.exec(s)?.[1]; }

function parseAction(clause: string, ctx: ParseContext, notes: string[]): Step | null {
  const t = lc(clause);
  const step = (block: string, config: Record<string, unknown>): Step => ({ id: `s${Math.random().toString(36).slice(2, 8)}`, type: "action", block, config });
  if (/(approval|goedkeuring|approve|goedkeuren)/.test(t)) {
    const u = pick(clause, ctx.users, (x) => x.name);
    return { id: `s${Math.random().toString(36).slice(2, 8)}`, type: "approval", approverIds: u ? [u.id] : [], message: quoted(clause) };
  }
  if (/\b(archive|archiveer)\b/.test(t)) return step("archive_item", {});
  if (/\b(delete|verwijder)\b/.test(t)) return step("delete_item", {});
  if (/\b(duplicate|dupliceer)\b/.test(t)) return step("duplicate_item", {});
  if (/\b(move|verplaats|verschuif)\b/.test(t)) {
    const g = pick(clause, ctx.groups, (x) => x.title);
    if (g) return step("move_item_to_group", { groupId: g.id });
    const b = pick(clause, ctx.boards, (x) => x.name);
    if (b) return step("move_item_to_board", { boardId: b.id });
    notes.push(`Could not find the group in "${clause}"`);
    return null;
  }
  if (/(notify|notification|melding|waarschuw|seintje|e-?mail|mail)/.test(t)) {
    const users = ctx.users.filter((u) => t.includes(lc(u.name.split(" ")[0])) || t.includes(lc(u.name)));
    const email = /e-?mail|mail/.test(t);
    return step("notify", { recipients: users.length ? users.map((u) => u.id) : ["@creator"], message: quoted(clause) ?? "{item}", email });
  }
  if (/(set|zet|change|wijzig|maak)\b.*\bstatus\b|\bstatus\b.*\b(to|op|naar)\b/.test(t)) {
    const st = findStatusLabel(clause, ctx);
    if (st) return step("set_status", { columnId: st.col.id, labelId: String(st.label.id) });
    notes.push(`Unknown status label in "${clause}"`);
    return null;
  }
  if (/(assign|wijs)\b/.test(t)) {
    const u = pick(clause, ctx.users, (x) => x.name) ?? ctx.users.find((x) => t.includes(lc(x.name.split(" ")[0])));
    const col = ctx.columns.find((c) => c.type === "people");
    if (u && col) return step("assign_person", { columnId: col.id, userIds: [u.id], mode: "add" });
    notes.push(`Could not resolve the person in "${clause}"`);
    return null;
  }
  if (/(subitem)/.test(t) && /(create|maak|add|voeg)/.test(t)) return step("create_subitem", { name: quoted(clause) ?? "Subitem" });
  if (/(create|maak|add|voeg).*\bitem\b/.test(t)) return step("create_item", { name: quoted(clause) ?? "{item}" });
  if (/(update|bericht|comment|reactie)/.test(t) && /(post|plaats|create|maak|add|schrijf)/.test(t)) return step("create_update", { text: quoted(clause) ?? "Automatische update voor {item}" });
  return null;
}

export function parseAutomationText(text: string, ctx: ParseContext): ParseResult {
  const notes: string[] = [];
  const clean = text.trim().replace(/\s+/g, " ");
  const idx = clean.search(/\s*(?:,|;|\bthen\b|\bdan\b|\bdaarna\b)\s+/i);
  if (!clean || idx < 0) return { definition: null, name: clean.slice(0, 80), notes: ["Write it as: When ..., then ..."] };
  const triggerPart = clean.slice(0, idx);
  const rest = clean.slice(idx).replace(/^\s*(?:,|;|\bthen\b|\bdan\b|\bdaarna\b)\s+/i, "");
  const trigger = parseTrigger(triggerPart, ctx, notes);
  if (!trigger) notes.push(`Could not understand the trigger: "${triggerPart}"`);
  const verbs = "notify|move|set|assign|archive|create|post|duplicate|stuur|verplaats|zet|wijs|maak|plaats|archiveer|waarschuw|dupliceer";
  const splitter = new RegExp(`\\s*(?:;|\\band then\\b|\\bthen\\b|\\bdaarna\\b|\\ben dan\\b|\\bdan\\b|,\\s*(?=(?:and\\s+|en\\s+)?(?:${verbs})\\b)|\\s+(?:and|en)\\s+(?=(?:${verbs})\\b))\\s*`, "i");
  const clauses = rest.split(splitter).filter(Boolean);
  const steps = clauses.map((c) => parseAction(c.replace(/^(and|en)\s+/i, ""), ctx, notes)).filter((s): s is Step => !!s);
  if (!steps.length) notes.push("No action found");
  if (!trigger || !steps.length) return { definition: null, name: clean.slice(0, 80), notes };
  return { definition: { trigger, steps }, name: clean.slice(0, 80), notes };
}
