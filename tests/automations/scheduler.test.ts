import { beforeEach, describe, expect, it } from "vitest";
import { dateArrivesAt, latestOccurrence, localParts, zonedToUtc } from "../../src/server/automations/schedule-math";
import { tick } from "../../src/server/automations/scheduler";
import * as items from "../../src/server/services/items";
import { autoCtx, makeAutomation, newItem, runsOf, settle, type AutoCtx } from "./setup";

describe("schedule math (Europe/Amsterdam)", () => {
  it("converts wall clock time to UTC across DST", () => {
    expect(zonedToUtc(2026, 7, 1, 9, 0).toISOString()).toBe("2026-07-01T07:00:00.000Z"); // CEST
    expect(zonedToUtc(2026, 12, 1, 9, 0).toISOString()).toBe("2026-12-01T08:00:00.000Z"); // CET
    expect(localParts(new Date("2026-12-01T23:30:00Z")).d).toBe(2);
  });
  it("date arrives: offsets before/after and time of day", () => {
    const v = { date: "2026-12-10" };
    expect(dateArrivesAt({ direction: "at", time: "09:00" }, v)!.toISOString()).toBe("2026-12-10T08:00:00.000Z");
    expect(dateArrivesAt({ direction: "before", offsetValue: 2, offsetUnit: "days", time: "09:00" }, v)!.toISOString()).toBe("2026-12-08T08:00:00.000Z");
    expect(dateArrivesAt({ direction: "after", offsetValue: 3, offsetUnit: "hours", time: "09:00" }, v)!.toISOString()).toBe("2026-12-10T11:00:00.000Z");
    expect(dateArrivesAt({ direction: "at" }, { date: "2026-12-10", time: "14:30:00" })!.toISOString()).toBe("2026-12-10T14:30:00.000Z");
    expect(dateArrivesAt({}, null)).toBeNull();
  });
  it("latest recurring occurrence for day/week/month", () => {
    const now = new Date("2026-12-09T10:00:00Z"); // Wednesday 11:00 local
    expect(latestOccurrence({ every: "day", time: "09:00" }, now)!.toISOString()).toBe("2026-12-09T08:00:00.000Z");
    expect(latestOccurrence({ every: "day", time: "12:00" }, now)!.toISOString()).toBe("2026-12-08T11:00:00.000Z");
    expect(latestOccurrence({ every: "week", weekday: 1, time: "09:00" }, now)!.toISOString()).toBe("2026-12-07T08:00:00.000Z");
    expect(latestOccurrence({ every: "month", dayOfMonth: 31, time: "09:00" }, now)!.toISOString()).toBe("2026-11-30T08:00:00.000Z");
    expect(latestOccurrence({ every: "weekday", time: "09:00" }, new Date("2026-12-12T10:00:00Z"))!.toISOString()).toBe("2026-12-11T08:00:00.000Z");
  });
});

let c: AutoCtx;
beforeEach(async () => { c = await autoCtx(); });
const future = (days: number) => new Date(Date.now() + days * 86_400_000);

describe("scheduler tick with an injected clock", () => {
  it("date arrives fires once, at the offset, and not before", async () => {
    const a = makeAutomation(c, { trigger: { type: "date_arrives", config: { columnId: c.dateId, direction: "before", offsetValue: 1, offsetUnit: "days", time: "09:00" } }, steps: [{ type: "action", block: "set_status", config: { columnId: c.statusId, labelId: c.stuckLabel } }] });
    const day = future(10).toISOString().slice(0, 10);
    const it1 = newItem(c, "Deadline", { values: { date: day } });
    const early = new Date(`${day}T00:00:00Z`); early.setUTCDate(early.getUTCDate() - 2);
    expect((await tick(early)).fired).toBe(0);
    const arrive = new Date(`${day}T12:00:00Z`); arrive.setUTCDate(arrive.getUTCDate() - 1); // day before at 12:00Z, after 09:00 local
    expect((await tick(arrive)).fired).toBe(1);
    expect(items.get(c.admin, it1.id).values[c.statusId]).toEqual({ index: Number(c.stuckLabel) });
    expect((await tick(new Date(arrive.getTime() + 60_000))).fired).toBe(0); // dedupe
    expect(runsOf(a.id)).toHaveLength(1);
  });

  it("catches up after downtime but only fires once per date and ignores dates before the automation existed", async () => {
    const day = future(5).toISOString().slice(0, 10);
    newItem(c, "Oud", { values: { date: "2020-01-01" } });
    const a = makeAutomation(c, { trigger: { type: "date_arrives", config: { columnId: c.dateId, direction: "at", time: "09:00" } }, steps: [{ type: "action", block: "create_update", config: { text: "bereikt" } }] });
    newItem(c, "Nieuw", { values: { date: day } });
    // scheduler was "down" for 3 days after the date
    const late = new Date(`${day}T08:00:00Z`); late.setUTCDate(late.getUTCDate() + 3);
    expect((await tick(late)).fired).toBe(1);
    expect((await tick(late)).fired).toBe(0);
    expect(runsOf(a.id)).toHaveLength(1);
  });

  it("recurring fires once per occurrence and creates an item", async () => {
    const a = makeAutomation(c, { trigger: { type: "recurring", config: { every: "day", time: "09:00" } }, steps: [{ type: "action", block: "create_item", config: { name: "Dagelijkse check" } }] });
    const base = future(3);
    base.setUTCHours(10, 0, 0, 0);
    expect((await tick(base)).fired).toBe(1);
    expect((await tick(new Date(base.getTime() + 3_600_000))).fired).toBe(0);
    const next = new Date(base.getTime() + 86_400_000);
    expect((await tick(next)).fired).toBe(1);
    // two missed days -> only the latest occurrence fires
    expect((await tick(new Date(next.getTime() + 3 * 86_400_000))).fired).toBe(1);
    expect(items.list(c.admin, { boardId: c.boardId }).filter((i) => i.name === "Dagelijkse check")).toHaveLength(3);
    expect(runsOf(a.id)).toHaveLength(3);
  });

  it("status duration notifies when an item stays in a status longer than N days", async () => {
    const a = makeAutomation(c, { trigger: { type: "status_duration", config: { columnId: c.statusId, labelId: c.stuckLabel, days: 5 } }, steps: [{ type: "action", block: "notify", config: { recipients: [c.userIds.dev1], message: "{item} wacht al {days} dagen" } }] });
    const it1 = newItem(c, "Wacht");
    items.changeColumnValue(c.admin, it1.id, "status", "Stuck");
    await settle();
    expect((await tick(new Date(Date.now() + 4 * 86_400_000))).fired).toBe(0);
    expect((await tick(new Date(Date.now() + 6 * 86_400_000))).fired).toBe(1);
    expect((await tick(new Date(Date.now() + 7 * 86_400_000))).fired).toBe(0);
    expect(runsOf(a.id)[0].status).toBe("success");
  });
});
