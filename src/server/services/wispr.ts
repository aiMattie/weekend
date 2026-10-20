/**
 * Wispr Flow meetings (module wispr). Each user links their own Wispr Flow account (OAuth, see server/wispr/client).
 * `sync` lists their recorded meetings from the Wispr MCP server into wispr_meetings (metadata only). On the
 * /meetings page the user marks a meeting `personal` (hidden, never imported) or saves it into a workspace,
 * optionally linked to a board item (project, klant, ...). Saving imports notes + summary + transcript as a
 * Notetaker meeting, writes the gespreksverslag doc into the workspace and posts an update on the linked item.
 *
 * Nothing is imported automatically: personal meetings never leave Wispr unless the user saves them.
 * Meetings are private to the user who linked Wispr (also for admins).
 */
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../../lib/actor";
import { ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import { idSchema } from "../../lib/zod-schemas";
import { db } from "../../db/client";
import { wisprConnections, wisprMeetings, type WisprMeetingStatus } from "../../db/schema/wispr";
import { seal, unseal } from "../../modules/admin/lib/seal";
import { appUrl } from "../sso/config";
import * as wispr from "../wispr/client";
import { argsFor, meetingsArray, toDetail, toSummary, type WisprMeetingDetail, type WisprMeetingSummary } from "../wispr/normalize";
import { parse } from "./_shared";
import * as boardsSvc from "./boards";
import * as itemsSvc from "./items";
import * as notetaker from "./notetaker";
import * as updatesSvc from "./updates";
import * as workspacesSvc from "./workspaces";

export type WisprMeeting = typeof wisprMeetings.$inferSelect;
type Connection = typeof wisprConnections.$inferSelect;

export const CALLBACK_PATH = "/api/v1/wispr/callback";
const PENDING_TTL_MS = 15 * 60_000;
const MAX_TRANSCRIPT = 60_000;

function requireMember(actor: Actor): void {
  if (actor.isSystem || actor.agent) throw new ForbiddenError("Alleen gebruikers kunnen Wispr Flow koppelen");
  if (actor.role === "guest" || actor.role === "viewer") throw new ForbiddenError("Alleen leden kunnen Wispr Flow gebruiken");
}
const now = () => new Date().toISOString();
const conn = (userId: string): Connection | undefined => db.select().from(wisprConnections).where(eq(wisprConnections.userId, userId)).get();
const patchConn = (userId: string, patch: Partial<Connection>) => db.update(wisprConnections).set(patch).where(eq(wisprConnections.userId, userId)).run();

/* ------------------------------------------------------------------ connection */

export interface WisprStatus { connected: boolean; label: string | null; connectedAt: string | null; lastSyncAt: string | null; lastError: string | null; counts: Record<WisprMeetingStatus, number> }

export function status(actor: Actor): WisprStatus {
  requireMember(actor);
  const c = conn(actor.id);
  const counts: Record<WisprMeetingStatus, number> = { new: 0, personal: 0, saved: 0 };
  for (const r of db.select({ status: wisprMeetings.status }).from(wisprMeetings).where(eq(wisprMeetings.userId, actor.id)).all()) counts[r.status]++;
  return { connected: !!c?.accessToken, label: c?.label ?? null, connectedAt: c?.connectedAt ?? null, lastSyncAt: c?.lastSyncAt ?? null, lastError: c?.lastError ?? null, counts };
}

/** Starts the OAuth flow: (re)registers a client when needed and returns the Wispr authorize URL. */
export async function startConnect(actor: Actor): Promise<string> {
  requireMember(actor);
  const redirectUri = `${appUrl()}${CALLBACK_PATH}`;
  let c = conn(actor.id);
  if (!c) { db.insert(wisprConnections).values({ userId: actor.id, accountId: actor.accountId }).run(); c = conn(actor.id)!; }
  const clientId = c.clientId && c.redirectUri === redirectUri ? c.clientId : await wispr.registerClient(redirectUri);
  const state = wispr.randomState();
  const verifier = wispr.newVerifier();
  patchConn(actor.id, { clientId, redirectUri, pendingState: state, pendingVerifier: seal(verifier), pendingAt: now() });
  return wispr.authorizeUrl({ clientId, redirectUri, state, verifier });
}

/** OAuth callback: checks state, exchanges the code and stores the sealed tokens. */
export async function finishConnect(actor: Actor, q: { code?: string | null; state?: string | null; error?: string | null }): Promise<void> {
  requireMember(actor);
  const c = conn(actor.id);
  if (!c?.pendingState || !c.pendingVerifier || !c.clientId || !c.redirectUri) throw new ValidationError("Geen lopende Wispr Flow-koppeling");
  const expired = !c.pendingAt || Date.now() - new Date(c.pendingAt).getTime() > PENDING_TTL_MS;
  const clearPending = { pendingState: null, pendingVerifier: null, pendingAt: null };
  if (expired || q.state !== c.pendingState) { patchConn(actor.id, clearPending); throw new ValidationError("Koppeling verlopen of ongeldig, probeer opnieuw"); }
  if (q.error || !q.code) { patchConn(actor.id, { ...clearPending, lastError: "Toegang geweigerd in Wispr Flow" }); throw new ValidationError("Wispr Flow gaf geen toegang"); }
  const t = await wispr.exchangeCode({ clientId: c.clientId, redirectUri: c.redirectUri, code: q.code, verifier: unseal(c.pendingVerifier) });
  patchConn(actor.id, { ...clearPending, accessToken: seal(t.accessToken), refreshToken: t.refreshToken ? seal(t.refreshToken) : null, expiresAt: t.expiresAt, connectedAt: now(), lastError: null });
  try {
    await withSession(actor, async (s) => {
      const info = await s.call("get_account_info", {});
      const o = (info && typeof info === "object" ? info : {}) as Record<string, unknown>;
      const label = [o.name, o.email, o.display_name].find((v) => typeof v === "string" && v) as string | undefined;
      if (label) patchConn(actor.id, { label: label.slice(0, 200) });
    });
  } catch { /* label is informational */ }
}

export function disconnect(actor: Actor): void {
  requireMember(actor);
  db.delete(wisprConnections).where(eq(wisprConnections.userId, actor.id)).run();
  // keep saved/personal decisions (a reconnect shows the same choices), drop undecided rows
  db.delete(wisprMeetings).where(and(eq(wisprMeetings.userId, actor.id), eq(wisprMeetings.status, "new"))).run();
}

async function accessToken(actor: Actor): Promise<string> {
  const c = conn(actor.id);
  if (!c?.accessToken) throw new ValidationError("Koppel eerst je Wispr Flow-account");
  const expiring = c.expiresAt && new Date(c.expiresAt).getTime() - Date.now() < 60_000;
  if (!expiring) return unseal(c.accessToken);
  if (!c.refreshToken || !c.clientId) { patchConn(actor.id, { accessToken: null, lastError: "Koppeling verlopen, koppel opnieuw" }); throw new ValidationError("Wispr Flow-koppeling verlopen, koppel opnieuw"); }
  try {
    const t = await wispr.refresh({ clientId: c.clientId, refreshToken: unseal(c.refreshToken) });
    patchConn(actor.id, { accessToken: seal(t.accessToken), refreshToken: t.refreshToken ? seal(t.refreshToken) : c.refreshToken, expiresAt: t.expiresAt, lastError: null });
    return t.accessToken;
  } catch (e) {
    if (e instanceof wispr.WisprError && e.code === "auth_failed") patchConn(actor.id, { accessToken: null, refreshToken: null, lastError: "Koppeling verlopen, koppel opnieuw" });
    throw e;
  }
}

async function withSession<T>(actor: Actor, fn: (s: wispr.WisprSession) => Promise<T>): Promise<T> {
  try {
    const s = await new wispr.WisprSession(await accessToken(actor)).open();
    return await fn(s);
  } catch (e) {
    if (e instanceof wispr.WisprError) {
      if (e.code === "auth_failed") patchConn(actor.id, { accessToken: null, lastError: e.message });
      throw new ValidationError(e.message);
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ meetings */

/** Pulls the latest meetings from Wispr. Existing rows keep their decision (personal / saved). */
export async function sync(actor: Actor): Promise<{ fetched: number; added: number }> {
  requireMember(actor);
  const found = await withSession(actor, async (s) => {
    const tool = (await s.listTools()).find((t) => t.name === "search_meetings");
    return meetingsArray(await s.call("search_meetings", argsFor(tool, { limit: 50 }, { limit: ["max_results", "page_size", "count"] }))).map(toSummary).filter((m): m is WisprMeetingSummary => !!m);
  });
  let added = 0;
  db.transaction((tx) => {
    for (const m of found) {
      const cur = tx.select().from(wisprMeetings).where(and(eq(wisprMeetings.userId, actor.id), eq(wisprMeetings.externalId, m.externalId))).get();
      const meta = { title: m.title, startedAt: m.startedAt, attendees: m.attendees, preview: m.preview, calendarId: m.calendarId };
      if (cur) tx.update(wisprMeetings).set({ ...meta, preview: m.preview || cur.preview }).where(eq(wisprMeetings.id, cur.id)).run();
      else { tx.insert(wisprMeetings).values({ ...meta, userId: actor.id, accountId: actor.accountId, externalId: m.externalId }).run(); added++; }
    }
  });
  patchConn(actor.id, { lastSyncAt: now(), lastError: null });
  return { fetched: found.length, added };
}

export function list(actor: Actor, opts: { status?: string } = {}): WisprMeeting[] {
  requireMember(actor);
  const st = opts.status && opts.status !== "all" ? (opts.status as WisprMeetingStatus) : null;
  return db.select().from(wisprMeetings).where(and(eq(wisprMeetings.userId, actor.id), st ? eq(wisprMeetings.status, st) : undefined)).orderBy(desc(wisprMeetings.startedAt), desc(wisprMeetings.id)).all();
}

function load(actor: Actor, id: string): WisprMeeting {
  requireMember(actor);
  const m = db.select().from(wisprMeetings).where(eq(wisprMeetings.id, id)).get();
  if (!m || m.userId !== actor.id) throw new NotFoundError("Meeting");
  return m;
}

async function fetchDetail(actor: Actor, m: WisprMeeting): Promise<WisprMeetingDetail> {
  const fallback: WisprMeetingSummary = { externalId: m.externalId, title: m.title, startedAt: m.startedAt, attendees: m.attendees, preview: m.preview, calendarId: m.calendarId };
  return withSession(actor, async (s) => {
    const tool = (await s.listTools()).find((t) => t.name === "get_meeting");
    const args = argsFor(tool, { meeting_id: m.externalId, include_transcript: true, max_chars: MAX_TRANSCRIPT }, { meeting_id: ["id", "meetingId"], include_transcript: ["with_transcript", "transcript"], max_chars: ["transcript_max_chars", "limit_chars", "max_length"] });
    return toDetail(await s.call("get_meeting", args), fallback);
  });
}

/** Live preview from Wispr (summary, notes, transcript) before the user decides where to save it. */
export async function detail(actor: Actor, id: string): Promise<WisprMeeting & { detail: WisprMeetingDetail }> {
  const m = load(actor, id);
  return { ...m, detail: await fetchDetail(actor, m) };
}

export function setPersonal(actor: Actor, id: string, personal: boolean): WisprMeeting {
  const m = load(actor, id);
  if (m.status === "saved") throw new ValidationError("Deze meeting is al opgeslagen");
  return db.update(wisprMeetings).set({ status: personal ? "personal" : "new" }).where(eq(wisprMeetings.id, id)).returning().get();
}

const saveInput = z.object({
  workspaceId: idSchema,
  boardId: idSchema.nullish(),
  itemId: idSchema.nullish(),
  clientName: z.string().trim().max(200).nullish(),
});

export function transcriptText(d: WisprMeetingDetail): string {
  const parts = [
    d.summary && `Samenvatting (Wispr Flow):\n${d.summary}`,
    d.notes && `Notities:\n${d.notes}`,
    d.transcript && `Transcript:\n${d.transcript}`,
  ].filter(Boolean).join("\n\n");
  return (parts || d.preview || d.title).slice(0, MAX_TRANSCRIPT);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Saves the meeting into a workspace (and optionally on a board item): Notetaker meeting + report doc + item update. */
export async function save(actor: Actor, id: string, input: unknown): Promise<WisprMeeting> {
  const m = load(actor, id);
  const d = parse(saveInput, input);
  const ws = workspacesSvc.get(actor, d.workspaceId);
  let boardId = d.boardId ?? null;
  if (d.itemId) {
    const it = itemsSvc.get(actor, d.itemId);
    if (boardId && it.boardId !== boardId) throw new ValidationError("Item hoort niet bij dit board");
    boardId = it.boardId;
  }
  if (boardId && boardsSvc.get(actor, boardId).workspaceId !== ws.id) throw new ValidationError("Board hoort niet bij deze workspace");

  const det = await fetchDetail(actor, m);
  const text = transcriptText(det);
  const clientName = d.clientName ?? ws.name;
  let meetingId = m.meetingId;
  if (meetingId) {
    try { notetaker.update(actor, meetingId, { workspaceId: ws.id, clientName }); } catch (e) { if (!(e instanceof NotFoundError)) throw e; meetingId = null; }
  }
  if (!meetingId) {
    const nm = await notetaker.create(actor, { title: det.title, transcript: text.length >= 10 ? text : `${text} (geen notities)`, heldAt: det.startedAt ?? undefined, workspaceId: ws.id, clientName, attendees: det.attendees });
    // without AI the line based extractor gives a weak summary: prefer the one Wispr already made
    if (nm.method === "fallback" && det.summary) notetaker.update(actor, nm.id, { summary: det.summary.slice(0, 4000) });
    meetingId = nm.id;
  }
  const report = notetaker.createReport(actor, meetingId, { workspaceId: ws.id });

  if (d.itemId && d.itemId !== m.itemId) {
    const summary = notetaker.get(actor, meetingId).summary;
    updatesSvc.create(actor, { itemId: d.itemId, body: `<p><strong>Meeting: ${esc(det.title)}</strong>${det.startedAt ? ` (${det.startedAt.slice(0, 10)})` : ""}</p><p>${esc(summary)}</p><p><a href="${report.url}">Gespreksverslag</a></p>` });
  }
  return db.update(wisprMeetings).set({ status: "saved", workspaceId: ws.id, boardId, itemId: d.itemId ?? null, meetingId, docId: report.docId, savedAt: now() }).where(eq(wisprMeetings.id, id)).returning().get();
}
