/**
 * SCIM 2.0 (minimal): Users list / get / create / patch / replace / deactivate for IdP provisioning
 * (Okta, Entra ID). Authentication is the SCIM bearer token (security.createScimToken), not a user session.
 * The functions return plain SCIM JSON documents, routes under /api/scim/v2 only add HTTP.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { users } from "../../db/schema/core";
import { userSecurity } from "../../db/schema/audit-log";
import { emit } from "../../lib/events";
import { recordAudit } from "./audit";
import { revokeAllForUser } from "./sessions";

export const SCIM_USER = "urn:ietf:params:scim:schemas:core:2.0:User";
export const SCIM_LIST = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
export const SCIM_ERROR = "urn:ietf:params:scim:api:messages:2.0:Error";
export const SCIM_PATCH = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

export class ScimError extends Error {
  constructor(readonly status: number, readonly detail: string, readonly scimType?: string) { super(detail); }
}

export const errorBody = (status: number, detail: string, scimType?: string) => ({ schemas: [SCIM_ERROR], status: String(status), detail, ...(scimType ? { scimType } : {}) });

type UserRow = typeof users.$inferSelect;

export function toScimUser(u: UserRow, base = ""): Record<string, unknown> {
  const [given, ...rest] = u.name.split(" ");
  return {
    schemas: [SCIM_USER], id: u.id, userName: u.email, displayName: u.name,
    name: { formatted: u.name, givenName: given ?? u.name, familyName: rest.join(" ") },
    emails: [{ value: u.email, primary: true, type: "work" }],
    ...(u.title ? { title: u.title } : {}), ...(u.phone ? { phoneNumbers: [{ value: u.phone, type: "work" }] } : {}),
    active: u.isActive, locale: u.locale, timezone: u.timeZone,
    meta: { resourceType: "User", created: u.createdAt, lastModified: u.updatedAt, location: `${base}/api/scim/v2/Users/${u.id}` },
  };
}

function find(accountId: string, id: string): UserRow {
  const u = db.select().from(users).where(and(eq(users.id, id), eq(users.accountId, accountId))).get();
  if (!u) throw new ScimError(404, "User not found");
  return u;
}

const actorOf = (accountId: string) => ({ accountId, isSystem: true, source: "scim" as const, name: "SCIM" });

/** GET /Users with `filter=userName eq "x"`, startIndex (1 based) and count. */
export function list(accountId: string, q: { filter?: string | null; startIndex?: string | null; count?: string | null }, base = "") {
  const startIndex = Math.max(1, Number(q.startIndex ?? 1) || 1);
  const count = Math.min(200, Math.max(0, Number(q.count ?? 100) || 100));
  let rows = db.select().from(users).where(and(eq(users.accountId, accountId), eq(users.isAiAgent, false))).orderBy(asc(users.name)).all();
  if (q.filter) {
    const m = /^\s*(userName|emails\.value|id|externalId)\s+eq\s+"([^"]*)"\s*$/i.exec(q.filter);
    if (!m) throw new ScimError(400, "Only filters of the form: userName eq \"value\" are supported", "invalidFilter");
    const [, attr, val] = m;
    rows = rows.filter((u) => (attr.toLowerCase() === "id" ? u.id === val : attr.toLowerCase() === "externalid" ? false : u.email.toLowerCase() === val.toLowerCase()));
  }
  const page = rows.slice(startIndex - 1, startIndex - 1 + count);
  return { schemas: [SCIM_LIST], totalResults: rows.length, startIndex, itemsPerPage: page.length, Resources: page.map((u) => toScimUser(u, base)) };
}

export function get(accountId: string, id: string, base = ""): Record<string, unknown> {
  return toScimUser(find(accountId, id), base);
}

interface ScimUserInput {
  userName?: string; displayName?: string; active?: boolean; title?: string;
  name?: { formatted?: string; givenName?: string; familyName?: string };
  emails?: { value: string; primary?: boolean }[];
}

const nameOf = (b: ScimUserInput): string | undefined =>
  b.displayName ?? b.name?.formatted ?? ([b.name?.givenName, b.name?.familyName].filter(Boolean).join(" ") || undefined);

export function create(accountId: string, body: unknown, base = ""): Record<string, unknown> {
  const b = (body ?? {}) as ScimUserInput;
  const email = (b.userName ?? b.emails?.find((e) => e.primary)?.value ?? b.emails?.[0]?.value ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ScimError(400, "userName must be an e-mail address", "invalidValue");
  if (db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).get()) throw new ScimError(409, "User already exists", "uniqueness");
  const u = db.insert(users).values({ accountId, name: nameOf(b) ?? email.split("@")[0], email, title: b.title ?? null, role: "member", isActive: b.active !== false }).returning().get();
  db.insert(userSecurity).values({ userId: u.id }).onConflictDoNothing().run();
  recordAudit(actorOf(accountId), "scim.user_created", { targetType: "user", targetId: u.id, targetName: u.email });
  emit({ type: "member.changed", boardId: null, actorId: null });
  return toScimUser(u, base);
}

function apply(accountId: string, u: UserRow, attrs: Record<string, unknown>): void {
  const set: Partial<typeof users.$inferInsert> = {};
  const name = nameOf(attrs as ScimUserInput);
  if (name) set.name = name;
  if (typeof attrs.userName === "string" && attrs.userName.includes("@")) set.email = attrs.userName.toLowerCase();
  if (typeof attrs.title === "string") set.title = attrs.title;
  if (typeof attrs.active === "boolean" || typeof attrs.active === "string") set.isActive = attrs.active === true || attrs.active === "True" || attrs.active === "true";
  if (!Object.keys(set).length) return;
  db.update(users).set(set).where(eq(users.id, u.id)).run();
  if (set.isActive === false) revokeAllForUser(u.id, "scim_deactivated");
  recordAudit(actorOf(accountId), set.isActive === false ? "scim.user_deactivated" : "scim.user_updated", { targetType: "user", targetId: u.id, targetName: u.email, changed: Object.keys(set) });
  emit({ type: "member.changed", boardId: null, actorId: null });
}

/** PATCH with Operations (add / replace / remove), with or without `path`. Supports active, userName, displayName, name.*, title. */
export function patch(accountId: string, id: string, body: unknown, base = ""): Record<string, unknown> {
  const u = find(accountId, id);
  const ops = (body as { Operations?: { op?: string; path?: string; value?: unknown }[] })?.Operations;
  if (!Array.isArray(ops) || !ops.length) throw new ScimError(400, "Operations is required", "invalidSyntax");
  const attrs: Record<string, unknown> = {};
  for (const o of ops) {
    const op = String(o.op ?? "").toLowerCase();
    if (!["add", "replace", "remove"].includes(op)) throw new ScimError(400, `Unsupported op ${o.op}`, "invalidSyntax");
    if (op === "remove") continue;
    if (!o.path && o.value && typeof o.value === "object") Object.assign(attrs, o.value);
    else if (o.path === "name.givenName" || o.path === "name.familyName" || o.path === "name.formatted") attrs.name = { ...(attrs.name as object), [o.path.slice(5)]: o.value };
    else if (o.path) attrs[o.path.replace(/\[.*$/, "")] = o.value;
  }
  apply(accountId, u, attrs);
  return get(accountId, id, base);
}

/** PUT: replace the attributes we manage. */
export function replace(accountId: string, id: string, body: unknown, base = ""): Record<string, unknown> {
  apply(accountId, find(accountId, id), (body ?? {}) as Record<string, unknown>);
  return get(accountId, id, base);
}

/** DELETE = deactivate (the account keeps its history). */
export function deactivate(accountId: string, id: string): void {
  const u = find(accountId, id);
  apply(accountId, u, { active: false });
}
