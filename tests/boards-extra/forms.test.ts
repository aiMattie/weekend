import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "../../src/lib/errors";
import * as forms from "../../src/server/services/forms";
import * as items from "../../src/server/services/items";
import * as updates from "../../src/server/services/updates";
import { checkRateLimit, embedCode, isEmptyAnswer, visibleQuestionIds } from "../../src/modules/boards-extra/forms/logic";
import { freshCtx, type Ctx } from "../helpers";
import { boardColumns } from "../../src/server/services/_shared";

let c: Ctx;
beforeEach(async () => { c = await freshCtx(); });

/** a published form on a fresh board; returns ids of the questions by column key */
function setup(settings: Record<string, unknown> = {}) {
  const { form, questions } = forms.create(c.admin, { workspaceId: c.workspaceId, name: "Aanvraag" });
  const q = (key: string) => {
    const col = boardColumns(form.boardId, "item").find((x) => x.key === key)!;
    return questions.find((x) => x.columnId === col.id)!;
  };
  const name = questions.find((x) => x.kind === "name")!;
  forms.update(c.admin, form.id, { settings });
  forms.setPublished(c.admin, form.id, true);
  const token = forms.get(c.admin, form.id).form.token;
  return { form, questions, q, name, token };
}

describe("forms: create + questions", () => {
  it("creates a backing board and default questions (Name + columns, people hidden)", () => {
    const { form, questions } = forms.create(c.admin, { workspaceId: c.workspaceId, name: "Intake" });
    expect(form.boardId).toBeTruthy();
    expect(form.settings.hasPassword).toBe(false);
    expect(questions[0].kind).toBe("name");
    expect(questions[0].required).toBe(true);
    expect(questions.map((x) => x.kind)).toEqual(expect.arrayContaining(["status", "date", "people"]));
    expect(questions.find((x) => x.kind === "people")!.hidden).toBe(true);
  });

  it("attaches to an existing board and edits questions via the batch editor", () => {
    const { form } = forms.create(c.admin, { boardId: c.boardId, name: "Op bestaand board" });
    expect(form.boardId).toBe(c.boardId);
    const cols = boardColumns(c.boardId, "item");
    const status = cols.find((x) => x.type === "status")!;
    const qs = forms.questionsEditor(c.admin, form.id, [
      { op: "delete", questionId: forms.get(c.admin, form.id).questions.find((x) => x.columnId === status.id)!.id },
      { op: "add", question: { kind: "section", title: "Let op", description: "Vul alles in" } },
    ]);
    expect(qs.find((x) => x.columnId === status.id)).toBeUndefined();
    expect(qs.at(-1)!.kind).toBe("section");
    expect(forms.availableColumns(c.admin, form.id).some((x) => x.id === status.id)).toBe(true);
  });

  it("rejects unsupported columns, duplicate columns and unknown logic targets", () => {
    const { form, questions } = forms.create(c.admin, { workspaceId: c.workspaceId, name: "X" });
    const dateQ = questions.find((x) => x.kind === "date")!;
    expect(() => forms.addQuestion(c.admin, form.id, { columnId: dateQ.columnId })).toThrow(ConflictError);
    expect(() => forms.updateQuestion(c.admin, form.id, dateQ.id, { settings: { logic: { showWhen: [{ questionId: "999", op: "not_empty" }] } } })).toThrow(ValidationError);
    expect(() => forms.updateQuestion(c.admin, form.id, dateQ.id, { settings: { logic: { showWhen: [{ questionId: dateQ.id, op: "not_empty" }] } } })).toThrow(/itself/);
  });

  it("requires structure permission and never exposes the password hash", () => {
    const { form } = forms.create(c.admin, { workspaceId: c.workspaceId, name: "Geheim" });
    expect(() => forms.update(c.viewer, form.id, { name: "Nee" })).toThrow(ForbiddenError);
    const dto = forms.update(c.admin, form.id, { settings: { password: "geheim" } });
    expect(dto.settings.hasPassword).toBe(true);
    expect(JSON.stringify(dto)).not.toContain("scrypt");
    expect(JSON.stringify(forms.get(c.admin, form.id))).not.toContain("passwordHash");
    expect(forms.update(c.admin, form.id, { settings: { password: null } }).settings.hasPassword).toBe(false);
  });
});

describe("forms: submissions map answers to columns", () => {
  it("creates an item with mapped values and an update with the answers", async () => {
    const { q, name, token, form } = setup();
    const status = q("status");
    const label = (status.settings.optionIds as number[] | undefined) ?? [];
    expect(label).toEqual([]);
    const pub = await forms.getPublic(token);
    const sOpt = pub.questions.find((x) => x.id === status.id)!.options!.find((o) => o.text === "Done")!;
    const res = await forms.submit(null, { token, answers: { [name.id]: "Nieuwe aanvraag", [status.id]: sOpt.id, [q("date").id]: "2026-11-02" } });
    expect(res.ok).toBe(true);
    const item = items.get(c.admin, res.itemId!);
    expect(item.name).toBe("Nieuwe aanvraag");
    const cols = boardColumns(form.boardId, "item");
    expect(item.values[cols.find((x) => x.key === "status")!.id]).toEqual({ index: sOpt.id });
    expect(item.values[cols.find((x) => x.key === "date")!.id]).toEqual({ date: "2026-11-02" });
    const ups = updates.list(c.admin, res.itemId!);
    expect(ups[0].bodyText).toContain("Nieuwe aanvraag");
    expect(ups[0].bodyText).toContain("2026-11-02");
    expect(forms.listSubmissions(c.admin, form.id)).toHaveLength(1);
  });

  it("validates required, bad values and unavailable options with field errors", async () => {
    const { q, name, token, form } = setup();
    forms.updateQuestion(c.admin, form.id, q("date").id, { required: true });
    const err = await forms.submit(null, { token, answers: { [name.id]: "", [q("date").id]: "" } }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err.details as { questionId: string }[]).map((d) => d.questionId).sort()).toEqual([name.id, q("date").id].sort());
    const bad = await forms.submit(null, { token, answers: { [name.id]: "ok", [q("date").id]: "morgen" } }).catch((e) => e);
    expect(bad).toBeInstanceOf(ValidationError);
    expect(items.list(c.admin, { boardId: form.boardId })).toHaveLength(0);
    // restricted options
    forms.updateQuestion(c.admin, form.id, q("status").id, { settings: { optionIds: [1] } });
    const pub = await forms.getPublic(token);
    expect(pub.questions.find((x) => x.id === q("status").id)!.options!.map((o) => o.text)).toEqual(["Done"]);
    const wrong = await forms.submit(null, { token, answers: { [name.id]: "ok", [q("date").id]: "2026-01-01", [q("status").id]: 0 } }).catch((e) => e);
    expect(wrong).toBeInstanceOf(ValidationError);
  });

  it("validates numbers columns", async () => {
    const { form, name, token } = setup();
    const col = (await import("../../src/server/services/columns")).create(c.admin, form.boardId, { title: "Bedrag", type: "numbers" });
    const nq = forms.addQuestion(c.admin, form.id, { columnId: col.id });
    expect(nq.kind).toBe("numbers");
    const bad = await forms.submit(null, { token, answers: { [name.id]: "a", [nq.id]: "abc" } }).catch((e) => e);
    expect(bad).toBeInstanceOf(ValidationError);
    const ok = await forms.submit(null, { token, answers: { [name.id]: "a", [nq.id]: "12,5" } });
    expect(items.get(c.admin, ok.itemId!).values[col.id]).toBe(12.5);
  });

  it("ignores unknown answer keys and unpublished or deleted forms are 404", async () => {
    const { form, name, token } = setup();
    const ok = await forms.submit(null, { token, answers: { [name.id]: "x", "123": "stray" } });
    expect(ok.itemId).toBeTruthy();
    forms.setPublished(c.admin, form.id, false);
    await expect(forms.submit(null, { token, answers: { [name.id]: "x" } })).rejects.toThrow(NotFoundError);
    await expect(forms.getPublic(token)).rejects.toThrow(NotFoundError);
    forms.setPublished(c.admin, form.id, true);
    forms.remove(c.admin, form.id);
    await expect(forms.getPublic(token)).rejects.toThrow(NotFoundError);
  });

  it("createSubmission (MCP) accepts column keys and titles and needs edit rights", () => {
    const { form } = setup();
    const res = forms.createSubmission(c.member, form.id, { name: "Via MCP", status: "Done", Date: "2026-12-01" });
    const item = items.get(c.admin, res.itemId!);
    expect(item.name).toBe("Via MCP");
    expect(Object.keys(item.values)).toHaveLength(2);
    expect(() => forms.createSubmission(c.viewer, form.id, { name: "x" })).toThrow(ForbiddenError);
    expect(() => forms.createSubmission(c.admin, form.id, { bogus: 1 })).toThrow(/Unknown question/);
  });
});

describe("forms: logic, honeypot, password, one response", () => {
  it("conditional logic: hidden questions are not required and not stored", async () => {
    const { form, q, name, token } = setup();
    const trigger = q("status");
    const dep = q("date");
    forms.updateQuestion(c.admin, form.id, dep.id, { required: true, settings: { logic: { showWhen: [{ questionId: trigger.id, op: "equals", value: 1 }] } } });
    // trigger not answered: date is hidden -> not required, and ignored even if sent
    const a = await forms.submit(null, { token, answers: { [name.id]: "A", [dep.id]: "2026-01-01" } });
    expect(Object.keys(items.get(c.admin, a.itemId!).values)).toHaveLength(0);
    // trigger answered Done -> date required
    const err = await forms.submit(null, { token, answers: { [name.id]: "B", [trigger.id]: 1 } }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    const b = await forms.submit(null, { token, answers: { [name.id]: "B", [trigger.id]: 1, [dep.id]: "2026-01-02" } });
    expect(Object.keys(items.get(c.admin, b.itemId!).values)).toHaveLength(2);
  });

  it("visibleQuestionIds handles any/all, chains and hidden flags", () => {
    const mk = (id: string, logic?: object, hidden = false) => ({ id, hidden, kind: "text", settings: logic ? { logic } : {} });
    const qs = [mk("1"), mk("2", { showWhen: [{ questionId: "1", op: "equals", value: "ja" }] }), mk("3", { showWhen: [{ questionId: "2", op: "not_empty" }] }), mk("4", { match: "any", showWhen: [{ questionId: "1", op: "contains", value: "x" }, { questionId: "1", op: "equals", value: "ja" }] }), mk("5", undefined, true)];
    expect([...visibleQuestionIds(qs, { "1": "nee", "2": "iets" })]).toEqual(["1"]);
    expect([...visibleQuestionIds(qs, { "1": "ja", "2": "iets" })]).toEqual(["1", "2", "3", "4"]);
    expect(isEmptyAnswer({ checked: false })).toBe(true);
    expect(isEmptyAnswer([])).toBe(true);
    expect(isEmptyAnswer("0")).toBe(false);
  });

  it("honeypot: filled field fakes success without storing anything", async () => {
    const { form, name, token } = setup();
    const res = await forms.submit(null, { token, answers: { [name.id]: "Bot" }, honeypot: "http://spam" });
    expect(res.ok).toBe(true);
    expect(res.itemId).toBeNull();
    expect(items.list(c.admin, { boardId: form.boardId })).toHaveLength(0);
    expect(forms.listSubmissions(c.admin, form.id)).toHaveLength(0);
  });

  it("password protects the form: locked until correct, submit needs it", async () => {
    const { name, token } = setup({ password: "pw123" });
    const locked = await forms.getPublic(token);
    expect(locked.locked).toBe(true);
    expect(locked.questions).toHaveLength(0);
    expect((await forms.getPublic(token, { password: "fout" })).locked).toBe(true);
    const open = await forms.unlockPublic(token, "pw123");
    expect(open.locked).toBe(false);
    expect(open.questions.length).toBeGreaterThan(0);
    await expect(forms.submit(null, { token, answers: { [name.id]: "x" } })).rejects.toThrow(ValidationError);
    await expect(forms.submit(null, { token, answers: { [name.id]: "x" }, password: "pw123" })).resolves.toMatchObject({ ok: true });
  });

  it("limit one response per user and requireLogin", async () => {
    const { name, token } = setup({ limitOneResponse: true });
    await expect(forms.submit(null, { token, answers: { [name.id]: "anon" } })).rejects.toThrow(UnauthorizedError);
    const r = await forms.submit(c.member, { token, answers: { [name.id]: "eerste" } });
    expect(items.get(c.admin, r.itemId!).creatorId).toBe(c.member.id);
    await expect(forms.submit(c.member, { token, answers: { [name.id]: "tweede" } })).rejects.toThrow(ConflictError);
    await expect(forms.submit(c.admin, { token, answers: { [name.id]: "andere" } })).resolves.toMatchObject({ ok: true });
  });

  it("people questions are only offered to logged-in viewers; size limit", async () => {
    const { form, q, token, name } = setup();
    forms.updateQuestion(c.admin, form.id, q("people").id, { hidden: false });
    expect((await forms.getPublic(token)).questions.some((x) => x.kind === "people")).toBe(false);
    expect((await forms.getPublic(token, { viewer: c.member })).questions.some((x) => x.kind === "people")).toBe(true);
    await expect(forms.submit(null, { token, answers: { [name.id]: "x".repeat(200_000) } })).rejects.toThrow(/too large/i);
  });
});

describe("forms: rate limiter + embed", () => {
  it("allows max hits per window per key, then blocks with retry-after, and recovers", () => {
    const store = new Map<string, number[]>();
    const opts = { max: 3, windowMs: 1000 };
    for (let i = 0; i < 3; i++) expect(checkRateLimit(store, "f:ip", 1000 + i, opts).ok).toBe(true);
    const blocked = checkRateLimit(store, "f:ip", 1500, opts);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(checkRateLimit(store, "f:other", 1500, opts).ok).toBe(true);
    expect(checkRateLimit(store, "f:ip", 2100, opts).ok).toBe(true);
  });
  it("builds an iframe snippet", () => {
    expect(embedCode("https://x.nl", "tok")).toContain('src="https://x.nl/f/tok"');
  });
});
