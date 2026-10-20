/**
 * Maps Wispr Flow MCP tool output onto our shapes (module wispr). The Wispr tools return JSON whose exact field
 * names are not a published contract, so every reader tolerates the common variants (`meeting_id` / `id`,
 * `start_time` / `started_at` / `start`, attendee strings or `{ name, email }` objects, transcript as text or
 * segments). Pure functions, unit tested in tests/wispr.
 */
import type { ToolInfo } from "./client";

export interface WisprMeetingSummary { externalId: string; title: string; startedAt: string | null; attendees: string[]; preview: string; calendarId: string | null }
export interface WisprMeetingDetail extends WisprMeetingSummary { summary: string; notes: string; transcript: string }

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const first = (o: Obj, keys: string[]): unknown => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k]; return undefined; };

function isoOrNull(v: unknown): string | null {
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000).toISOString();
  if (isObj(v)) return isoOrNull(first(v, ["dateTime", "date_time", "date"]));
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function person(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (isObj(v)) return str(first(v, ["name", "display_name", "displayName", "full_name", "email"])).trim();
  return "";
}

function attendeesOf(o: Obj): string[] {
  const raw = first(o, ["attendees", "participants", "attendee_preview", "attendees_preview"]);
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.attendees) ? raw.attendees : [];
  return [...new Set(list.map(person).filter(Boolean))].slice(0, 50);
}

function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    return v.map((seg) => {
      if (typeof seg === "string") return seg;
      if (!isObj(seg)) return "";
      const who = person(first(seg, ["speaker", "speaker_name", "name"]));
      const said = str(first(seg, ["text", "content", "utterance"]));
      return who ? `${who}: ${said}` : said;
    }).filter(Boolean).join("\n");
  }
  if (isObj(v)) return textOf(first(v, ["markdown", "text", "content", "segments", "lines"]));
  return "";
}

/** Finds the meeting array in a search_meetings result (top-level array or the first array-valued field). */
export function meetingsArray(result: unknown): Obj[] {
  if (Array.isArray(result)) return result.filter(isObj);
  if (!isObj(result)) return [];
  const named = first(result, ["meetings", "results", "items", "data"]);
  if (Array.isArray(named)) return named.filter(isObj);
  const any = Object.values(result).find(Array.isArray);
  return (any ?? []).filter(isObj);
}

export function toSummary(o: Obj): WisprMeetingSummary | null {
  const externalId = str(first(o, ["meeting_id", "meetingId", "id", "uuid"]));
  if (!externalId) return null;
  const summary = textOf(first(o, ["summary", "summary_preview", "snippet", "preview", "description"]));
  return {
    externalId,
    title: (str(first(o, ["title", "name", "meeting_title", "subject"])).trim() || "Meeting").slice(0, 200),
    startedAt: isoOrNull(first(o, ["start_time", "started_at", "startedAt", "start", "start_at", "date", "recorded_at", "created_at"])),
    attendees: attendeesOf(o),
    preview: summary.replace(/\s+/g, " ").trim().slice(0, 280),
    calendarId: str(first(o, ["calendar_id", "calendarId", "event_id"])) || null,
  };
}

export function toDetail(result: unknown, fallback: WisprMeetingSummary): WisprMeetingDetail {
  const o: Obj = isObj(result) ? (isObj(result.meeting) ? { ...result, ...result.meeting } : result) : { notes: str(result) };
  const base = toSummary({ meeting_id: fallback.externalId, ...o });
  const attendees = attendeesOf(o);
  return {
    externalId: fallback.externalId,
    title: str(first(o, ["title", "name", "meeting_title", "subject"])).trim().slice(0, 200) || fallback.title,
    startedAt: base?.startedAt ?? fallback.startedAt,
    attendees: attendees.length ? attendees : fallback.attendees,
    preview: base?.preview || fallback.preview,
    calendarId: base?.calendarId ?? fallback.calendarId,
    summary: textOf(first(o, ["summary", "derived_summary", "summary_markdown"])).trim(),
    notes: textOf(first(o, ["notes", "notes_markdown", "markdown_notes", "markdown"])).trim(),
    transcript: textOf(first(o, ["transcript", "transcript_range", "transcript_segments", "segments"])).trim(),
  };
}

/** Builds arguments for a tool from its input schema: only properties the tool declares are sent. */
export function argsFor(tool: ToolInfo | undefined, wanted: Record<string, unknown>, aliases: Record<string, string[]> = {}): Record<string, unknown> {
  const props = tool?.inputSchema?.properties;
  if (!props) return wanted;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(wanted)) {
    const name = [k, ...(aliases[k] ?? [])].find((n) => n in props);
    if (name) out[name] = v;
  }
  return out;
}
