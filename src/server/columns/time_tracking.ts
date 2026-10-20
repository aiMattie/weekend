import { ValidationError } from "../../lib/errors";
import { NUMBER_OPS, testNumber } from "./ops";
import type { ColumnLogic } from "./types";
import { isObj } from "./util";

/**
 * time_tracking, :
 *   { running, startDate (epoch seconds of the running session, else null), duration (seconds, finished
 *     sessions), additional_value: [{ id, started_at, ended_at, started_user_id, ended_user_id,
 *     manually_entered?, note? }] }
 * Total = duration + (running ? now - startDate : 0). The UI/automations send commands that the
 * column hooks resolve against the current value (validate() cannot see it):
 *   { command: "start" } { command: "stop" } { command: "add", seconds, startedAt?, note? }
 *   { command: "remove", id } { command: "reset" }
 */
export interface TimeSession {
  id: string;
  started_at: string;
  ended_at: string;
  started_user_id: string | null;
  ended_user_id: string | null;
  manually_entered?: boolean;
  note?: string;
}
export type TimeValue = { running: boolean; startDate: number | null; duration: number; additional_value: TimeSession[] };
export type TimeCommand =
  | { command: "start" }
  | { command: "stop" }
  | { command: "add"; seconds: number; startedAt?: string; note?: string }
  | { command: "remove"; id: string }
  | { command: "reset" };
export type TimeInput = TimeValue & Partial<TimeCommand>;

export const isTimeCommand = (v: unknown): v is TimeCommand => isObj(v) && typeof v.command === "string";

export const emptyTime = (): TimeValue => ({ running: false, startDate: null, duration: 0, additional_value: [] });

export function totalSeconds(v: TimeValue | null | undefined, nowMs = Date.now()): number {
  if (!v) return 0;
  return v.duration + (v.running && v.startDate ? Math.max(0, Math.floor(nowMs / 1000) - v.startDate) : 0);
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

let seq = 0;
const sessionId = (now: number) => `${now.toString(36)}${(seq++ % 1296).toString(36)}`;

/** Resolve a command against the current value. Pure; `nowMs` and `userId` are injected. */
export function applyTimeCommand(cur: TimeValue | null, cmd: TimeCommand, userId: string | null, nowMs: number = Date.now()): TimeValue | null {
  const v: TimeValue = cur ? { ...cur, additional_value: [...cur.additional_value] } : emptyTime();
  switch (cmd.command) {
    case "start":
      if (v.running) return v;
      return { ...v, running: true, startDate: Math.floor(nowMs / 1000) };
    case "stop": {
      if (!v.running || !v.startDate) return v;
      const end = Math.floor(nowMs / 1000);
      const secs = Math.max(0, end - v.startDate);
      const session: TimeSession = { id: sessionId(nowMs), started_at: new Date(v.startDate * 1000).toISOString(), ended_at: new Date(end * 1000).toISOString(), started_user_id: userId, ended_user_id: userId };
      return { running: false, startDate: null, duration: v.duration + secs, additional_value: [...v.additional_value, session] };
    }
    case "add": {
      const secs = Math.round(Number(cmd.seconds));
      if (!Number.isFinite(secs) || secs <= 0 || secs > 365 * 86400) throw new ValidationError("Time entry must be a positive number of seconds");
      const startMs = cmd.startedAt ? Date.parse(cmd.startedAt) : nowMs - secs * 1000;
      if (Number.isNaN(startMs)) throw new ValidationError("Invalid startedAt");
      const session: TimeSession = { id: sessionId(nowMs), started_at: new Date(startMs).toISOString(), ended_at: new Date(startMs + secs * 1000).toISOString(), started_user_id: userId, ended_user_id: userId, manually_entered: true, ...(cmd.note ? { note: cmd.note } : {}) };
      return { ...v, duration: v.duration + secs, additional_value: [...v.additional_value, session] };
    }
    case "remove": {
      const s = v.additional_value.find((x) => x.id === cmd.id);
      if (!s) throw new ValidationError("Time entry not found");
      const secs = Math.max(0, Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000));
      const next = { ...v, duration: Math.max(0, v.duration - secs), additional_value: v.additional_value.filter((x) => x.id !== cmd.id) };
      return next.duration === 0 && !next.running && !next.additional_value.length ? null : next;
    }
    case "reset":
      return null;
    default:
      throw new ValidationError("Unknown time tracking command");
  }
}

function normalizeSession(e: unknown): TimeSession {
  if (!isObj(e)) throw new ValidationError("Invalid time entry");
  const s = Date.parse(String(e.started_at ?? e.startedAt ?? ""));
  const en = Date.parse(String(e.ended_at ?? e.endedAt ?? ""));
  if (Number.isNaN(s) || Number.isNaN(en) || en < s) throw new ValidationError("Invalid time entry dates");
  return {
    id: String(e.id ?? sessionId(s)), started_at: new Date(s).toISOString(), ended_at: new Date(en).toISOString(),
    started_user_id: e.started_user_id ? String(e.started_user_id) : null, ended_user_id: e.ended_user_id ? String(e.ended_user_id) : null,
    ...(e.manually_entered ? { manually_entered: true } : {}), ...(typeof e.note === "string" ? { note: e.note } : {}),
  };
}

export const timeTrackingColumn: ColumnLogic<TimeValue> = {
  type: "time_tracking",
  label: "Time tracking",
  category: "time",
  icon: "Time",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined || input === "") return null;
    if (isTimeCommand(input)) return input as unknown as TimeValue; // resolved by the column hooks
    if (!isObj(input)) throw new ValidationError("Time tracking value must be an object");
    const sessions = Array.isArray(input.additional_value) ? input.additional_value.map(normalizeSession) : [];
    const durRaw = Number(input.duration ?? sessions.reduce((a, s) => a + (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 1000, 0));
    if (!Number.isFinite(durRaw) || durRaw < 0) throw new ValidationError("Invalid duration");
    const running = input.running === true;
    const startRaw = input.startDate ?? input.started_at;
    const startDate = running ? (typeof startRaw === "number" ? Math.floor(startRaw) : startRaw ? Math.floor(Date.parse(String(startRaw)) / 1000) : Math.floor(Date.now() / 1000)) : null;
    if (running && (startDate === null || !Number.isFinite(startDate))) throw new ValidationError("Invalid startDate");
    const v: TimeValue = { running, startDate, duration: Math.round(durRaw), additional_value: sessions };
    return v.duration === 0 && !running && !sessions.length ? null : v;
  },
  serialize: (v) => v,
  format: (v) => (v ? formatDuration(totalSeconds(v)) : ""),
  filter: {
    operators: NUMBER_OPS,
    /** operand in hours */
    test: (v, op, operand) => testNumber(v ? totalSeconds(v) / 3600 : null, op, operand),
  },
  sortKey: (v) => (v ? totalSeconds(v) : null),
  summarize(vals) {
    const sum = vals.reduce((a, v) => a + (v ? totalSeconds(v) : 0), 0);
    return sum ? { text: formatDuration(sum) } : null;
  },
};
