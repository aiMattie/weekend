import { describe, expect, it } from "vitest";
import { getColumnLogic } from "../../src/server/columns/registry";
import type { ColumnRef } from "../../src/server/columns/types";
import { applyTimeCommand, formatDuration, totalSeconds, type TimeValue } from "../../src/server/columns/time_tracking";
import { buildMirrorValue } from "../../src/server/columns/computed/mirror";
import { buildProgress, isDoneLabel } from "../../src/server/columns/computed/progress";
import { isoWeekOf } from "../../src/server/columns/util";

const col = (type: string, settings: Record<string, unknown> = {}): ColumnRef => ({ id: "1", key: type, title: type, type, settings });
const L = (type: string) => getColumnLogic(type);
const sorted = (type: string, vals: unknown[], c: ColumnRef = col(type)) => [...vals].sort((a, b) => {
  const x = L(type).sortKey!(a as never, c);
  const y = L(type).sortKey!(b as never, c);
  return x === y ? 0 : x === null ? 1 : y === null ? -1 : x < y ? -1 : 1;
});

describe("timeline", () => {
  const l = L("timeline");
  it("validates and serializes", () => {
    expect(l.validate({ from: "2026-10-01", to: "2026-10-05" }, col("timeline"))).toEqual({ from: "2026-10-01", to: "2026-10-05" });
    expect(l.validate({ start: "2026-10-01", end: "2026-10-05" }, col("timeline"))).toEqual({ from: "2026-10-01", to: "2026-10-05" });
    expect(l.validate("2026-10-01", col("timeline"))).toEqual({ from: "2026-10-01", to: "2026-10-01" });
    expect(l.validate(null, col("timeline"))).toBeNull();
    expect(() => l.validate({ from: "2026-10-05", to: "2026-10-01" }, col("timeline"))).toThrow();
    expect(() => l.validate({ from: "nope", to: "2026-10-01" }, col("timeline"))).toThrow();
    expect(l.serialize({ from: "2026-10-01", to: "2026-10-05" }, col("timeline"))).toEqual({ from: "2026-10-01", to: "2026-10-05" });
    expect(l.format({ from: "2026-10-01", to: "2026-10-05" }, col("timeline"))).toBe("2026-10-01 - 2026-10-05");
  });
  it("filters, sorts, summarizes", () => {
    const v = { from: "2026-10-01", to: "2026-10-05" };
    expect(l.filter.test(v, "overlaps", "2026-10-03", col("timeline"))).toBe(true);
    expect(l.filter.test(v, "overlaps", "2026-10-06", col("timeline"))).toBe(false);
    expect(l.filter.test(v, "before", "2026-10-06", col("timeline"))).toBe(true);
    expect(l.filter.test(v, "after", "2026-09-30", col("timeline"))).toBe(true);
    expect(l.filter.test(null, "is_empty", null, col("timeline"))).toBe(true);
    expect(l.filter.test(v, "overdue", null, col("timeline"))).toBe(true);
    expect(sorted("timeline", [{ from: "2026-12-01", to: "2026-12-02" }, null, v])[0]).toEqual(v);
    expect(l.summarize!([v, { from: "2026-09-01", to: "2026-09-02" }, null], col("timeline"))!.text).toBe("2026-09-01 - 2026-10-05");
  });
});

describe("week", () => {
  const l = L("week");
  it("accepts ISO week, date and API shape", () => {
    expect(l.validate("2026-W41", col("week"))).toEqual({ week: { startDate: "2026-10-05", endDate: "2026-10-11" } });
    expect(l.validate("2026-10-07", col("week"))).toEqual({ week: { startDate: "2026-10-05", endDate: "2026-10-11" } });
    expect(l.validate({ week: { startDate: "2026-10-05", endDate: "2026-10-11" } }, col("week"))).toEqual({ week: { startDate: "2026-10-05", endDate: "2026-10-11" } });
    expect(() => l.validate("2026-W99", col("week"))).toThrow();
    expect(() => l.validate("x", col("week"))).toThrow();
    expect(isoWeekOf("2026-01-01").week).toBe(1);
    expect(isoWeekOf("2027-01-01").week).toBe(53);
  });
  it("formats, filters, sorts", () => {
    const v = l.validate("2026-W41", col("week"))!;
    expect(l.format(v, col("week"))).toContain("Week 41");
    expect(l.filter.test(v, "is", "2026-10-09", col("week"))).toBe(true);
    expect(l.filter.test(v, "before", "2026-10-20", col("week"))).toBe(true);
    expect(l.filter.test(v, "after", "2026-10-20", col("week"))).toBe(false);
    expect(l.filter.test(null, "is_not_empty", null, col("week"))).toBe(false);
    expect(l.sortKey!(v, col("week"))).toBe("2026-10-05");
    expect(l.summarize!([v], col("week"))!.text).toBe("Week 41");
  });
});

describe("hour", () => {
  const l = L("hour");
  it("validates, formats, filters, sorts", () => {
    expect(l.validate("9:05", col("hour"))).toEqual({ hour: 9, minute: 5 });
    expect(l.validate({ hour: 14, minute: 30 }, col("hour"))).toEqual({ hour: 14, minute: 30 });
    expect(() => l.validate("25:00", col("hour"))).toThrow();
    expect(() => l.validate({ hour: 1, minute: 70 }, col("hour"))).toThrow();
    expect(l.format({ hour: 9, minute: 5 }, col("hour"))).toBe("09:05");
    expect(l.filter.test({ hour: 9, minute: 5 }, "gt", "08:00", col("hour"))).toBe(true);
    expect(l.filter.test({ hour: 9, minute: 5 }, "lt", "08:00", col("hour"))).toBe(false);
    expect(l.sortKey!({ hour: 1, minute: 1 }, col("hour"))).toBe(61);
    expect(l.summarize!([{ hour: 9, minute: 0 }, { hour: 17, minute: 30 }], col("hour"))!.text).toBe("09:00 - 17:30");
  });
});

describe("world_clock", () => {
  const l = L("world_clock");
  it("validates time zones", () => {
    expect(l.validate("Europe/Amsterdam", col("world_clock"))).toEqual({ timezone: "Europe/Amsterdam" });
    expect(l.validate({ timezone: "Asia/Tokyo" }, col("world_clock"))).toEqual({ timezone: "Asia/Tokyo" });
    expect(() => l.validate("Mars/Olympus", col("world_clock"))).toThrow();
    expect(l.format({ timezone: "Europe/Amsterdam" }, col("world_clock"))).toMatch(/^Europe\/Amsterdam \d{2}:\d{2}$/);
    expect(l.filter.test({ timezone: "Asia/Tokyo" }, "contains", "tokyo", col("world_clock"))).toBe(true);
    expect(l.sortKey!({ timezone: "Asia/Tokyo" }, col("world_clock"))).toBe("asia/tokyo");
  });
});

describe("rating", () => {
  const l = L("rating");
  const c = col("rating", { max: 5 });
  it("validates against max", () => {
    expect(l.validate(3, c)).toEqual({ rating: 3 });
    expect(l.validate({ rating: 4 }, c)).toEqual({ rating: 4 });
    expect(l.validate(0, c)).toBeNull();
    expect(() => l.validate(6, c)).toThrow();
    expect(() => l.validate(2.5, c)).toThrow();
    expect(() => l.normalizeSettings!({ max: 11 })).toThrow();
    expect(l.validate(8, col("rating", { max: 10 }))).toEqual({ rating: 8 });
  });
  it("filters, sorts, averages", () => {
    expect(l.filter.test({ rating: 4 }, "gte", 4, c)).toBe(true);
    expect(l.filter.test(null, "is_empty", null, c)).toBe(true);
    expect(sorted("rating", [{ rating: 5 }, { rating: 2 }, null])[0]).toEqual({ rating: 2 });
    expect(l.summarize!([{ rating: 5 }, { rating: 2 }, null], c)!.text).toBe("3.5");
  });
});

describe("vote", () => {
  const l = L("vote");
  it("validates, counts, filters", () => {
    expect(l.validate(["1", "2", "1"], col("vote"))).toEqual({ votersIds: ["1", "2"] });
    expect(l.validate({ votersIds: [] }, col("vote"))).toBeNull();
    expect(() => l.validate(["abc"], col("vote"))).toThrow();
    expect(l.format({ votersIds: ["1", "2"] }, col("vote"))).toBe("2");
    expect(l.filter.test({ votersIds: ["1", "2"] }, "gt", 1, col("vote"))).toBe(true);
    expect(l.filter.test({ votersIds: ["1"] }, "voted_by", ["1"], col("vote"))).toBe(true);
    expect(l.filter.test({ votersIds: ["1"] }, "voted_by", ["2"], col("vote"))).toBe(false);
    expect(l.sortKey!({ votersIds: ["1", "2"] }, col("vote"))).toBe(2);
    expect(l.summarize!([{ votersIds: ["1"] }, { votersIds: ["1", "2"] }], col("vote"))!.text).toBe("3");
  });
});

describe("tags", () => {
  const l = L("tags");
  it("validates ids, serializes without decoration, filters by id and name", () => {
    expect(l.validate({ tag_ids: [1, "2"] }, col("tags"))).toEqual({ tag_ids: ["1", "2"] });
    expect(l.validate(["5"], col("tags"))).toEqual({ tag_ids: ["5"] });
    expect(l.validate([], col("tags"))).toBeNull();
    expect(() => l.validate(["x"], col("tags"))).toThrow();
    const v = { tag_ids: ["1", "2"], tags: [{ id: "1", name: "Urgent", color: "#f00" }, { id: "2", name: "Klant", color: "#0f0" }] };
    expect(l.serialize(v, col("tags"))).toEqual({ tag_ids: ["1", "2"] });
    expect(l.format(v, col("tags"))).toBe("Urgent, Klant");
    expect(l.filter.test(v, "any_of", ["2"], col("tags"))).toBe(true);
    expect(l.filter.test(v, "none_of", ["2"], col("tags"))).toBe(false);
    expect(l.filter.test(v, "contains", "urg", col("tags"))).toBe(true);
    expect(l.sortKey!(v, col("tags"))).toBe("urgent, klant");
    expect(l.summarize!([v, v], col("tags"))!.segments![0].count).toBe(2);
  });
});

describe("email / phone", () => {
  it("email", () => {
    const l = L("email");
    expect(l.validate("a@b.nl", col("email"))).toEqual({ email: "a@b.nl", text: "a@b.nl" });
    expect(l.validate({ email: "a@b.nl", text: "Anna" }, col("email"))).toEqual({ email: "a@b.nl", text: "Anna" });
    expect(() => l.validate("not-an-email", col("email"))).toThrow();
    expect(l.validate("", col("email"))).toBeNull();
    expect(l.filter.test({ email: "a@b.nl", text: "a" }, "contains", "B.NL", col("email"))).toBe(true);
    expect(l.sortKey!({ email: "A@b.nl", text: "" }, col("email"))).toBe("a@b.nl");
    expect(l.serialize({ email: "a@b.nl", text: "Anna" }, col("email"))).toEqual({ email: "a@b.nl", text: "Anna" });
  });
  it("phone", () => {
    const l = L("phone");
    expect(l.validate("+31 6 12345678", col("phone"))).toEqual({ phone: "+31 6 12345678", countryShortName: "NL" });
    expect(l.validate({ phone: "0031612345678", countryShortName: "nl" }, col("phone"))).toEqual({ phone: "0031612345678", countryShortName: "NL" });
    expect(l.validate("06-12345678", col("phone"))!.countryShortName).toBe("");
    expect(() => l.validate("abc", col("phone"))).toThrow();
    expect(() => l.validate("12", col("phone"))).toThrow();
    expect(l.filter.test({ phone: "+31 6 1234", countryShortName: "NL" }, "contains", "+3161", col("phone"))).toBe(true);
    expect(l.format({ phone: "+31 6", countryShortName: "NL" }, col("phone"))).toBe("+31 6");
  });
});

describe("location / country", () => {
  it("location", () => {
    const l = L("location");
    expect(l.validate({ lat: 52.37, lng: 4.9, address: "Amsterdam" }, col("location"))).toEqual({ lat: 52.37, lng: 4.9, address: "Amsterdam" });
    expect(l.validate("Utrecht", col("location"))).toEqual({ lat: null, lng: null, address: "Utrecht" });
    expect(l.validate("52.1, 5.1", col("location"))).toEqual({ lat: 52.1, lng: 5.1, address: "52.1, 5.1" });
    expect(() => l.validate({ lat: 95, lng: 0 }, col("location"))).toThrow();
    expect(() => l.validate({ lat: 1 }, col("location"))).toThrow();
    expect(l.filter.test({ lat: null, lng: null, address: "Utrecht" }, "contains", "utr", col("location"))).toBe(true);
    expect(l.format({ lat: null, lng: null, address: "Utrecht" }, col("location"))).toBe("Utrecht");
  });
  it("country", () => {
    const l = L("country");
    expect(l.validate("nl", col("country"))).toEqual({ countryCode: "NL", countryName: "Netherlands" });
    expect(l.validate("Nederland", col("country"))!.countryCode).toBe("NL");
    expect(l.validate({ countryCode: "DE" }, col("country"))!.countryName).toBe("Germany");
    expect(() => l.validate("Atlantis", col("country"))).toThrow();
    expect(l.filter.test({ countryCode: "NL", countryName: "Netherlands" }, "any_of", ["nl"], col("country"))).toBe(true);
    expect(l.filter.test({ countryCode: "NL", countryName: "Netherlands" }, "none_of", ["NL"], col("country"))).toBe(false);
    expect(l.sortKey!({ countryCode: "BE", countryName: "Belgium" }, col("country"))).toBe("belgium");
  });
});

describe("color_picker", () => {
  const l = L("color_picker");
  it("validates hex shapes", () => {
    expect(l.validate("#FF0000", col("color_picker"))).toEqual({ color: { hex: "#ff0000" } });
    expect(l.validate("#f00", col("color_picker"))).toEqual({ color: { hex: "#ff0000" } });
    expect(l.validate({ color: { hex: "#225091" } }, col("color_picker"))).toEqual({ color: { hex: "#225091" } });
    expect(() => l.validate("red", col("color_picker"))).toThrow();
    expect(l.filter.test({ color: { hex: "#ff0000" } }, "any_of", ["#FF0000"], col("color_picker"))).toBe(true);
    expect(l.summarize!([{ color: { hex: "#ff0000" } }, { color: { hex: "#ff0000" } }], col("color_picker"))!.segments![0]).toMatchObject({ count: 2, color: "#ff0000" });
  });
});

describe("file", () => {
  const l = L("file");
  const v = { files: [{ assetId: "11", name: "a.png", fileType: "ASSET" as const, isImage: true }, { assetId: "12", name: "b.pdf", fileType: "ASSET" as const, isImage: false }] };
  it("validates assets and links", () => {
    expect(l.validate({ files: [{ assetId: 11, name: "a.png" }] }, col("file"))).toEqual({ files: [{ assetId: "11", name: "a.png", fileType: "ASSET", isImage: true }] });
    expect(l.validate({ files: [{ name: "doc", linkToFile: "https://x.nl/doc" }] }, col("file"))!.files[0].fileType).toBe("LINK");
    expect(l.validate({ files: [] }, col("file"))).toBeNull();
    expect(() => l.validate({ files: [{ name: "x" }] }, col("file"))).toThrow();
    expect(() => l.validate({ files: [{ name: "x", linkToFile: "javascript:alert(1)" }] }, col("file"))).toThrow();
    expect(() => l.validate("x", col("file"))).toThrow();
  });
  it("formats, filters, sorts", () => {
    expect(l.format(v, col("file"))).toBe("a.png, b.pdf");
    expect(l.filter.test(v, "contains", "PDF", col("file"))).toBe(true);
    expect(l.filter.test(v, "gt", 1, col("file"))).toBe(true);
    expect(l.filter.test(null, "is_empty", null, col("file"))).toBe(true);
    expect(l.sortKey!(v, col("file"))).toBe(2);
    expect(l.summarize!([v, null], col("file"))!.text).toBe("2");
  });
});

describe("button", () => {
  const l = L("button");
  it("is read-only, has no value and a label", () => {
    expect(l.readOnly).toBe(true);
    expect(l.validate("x", col("button"))).toBeNull();
    expect(l.normalizeSettings!({ label: "Go", color: "#fff" })).toMatchObject({ label: "Go", color: "#0073ea" });
    expect(l.format(null, col("button", { label: "Go" }))).toBe("Go");
  });
});

describe("board_relation and dependency", () => {
  for (const type of ["board_relation", "dependency"]) {
    const l = L(type);
    it(`${type}: accepts API shapes, strips decoration, filters`, () => {
      const c = col(type, { boardIds: ["5"], allowMultiple: true });
      expect(l.validate({ item_ids: [1, 2] }, c)).toEqual({ linkedPulseIds: [{ linkedPulseId: "1" }, { linkedPulseId: "2" }] });
      expect(l.validate(["3"], c)).toEqual({ linkedPulseIds: [{ linkedPulseId: "3" }] });
      expect(l.validate({ linkedPulseIds: [{ linkedPulseId: "4" }] }, c)).toEqual({ linkedPulseIds: [{ linkedPulseId: "4" }] });
      expect(l.validate([], c)).toBeNull();
      expect(() => l.validate(["abc"], c)).toThrow();
      expect(() => l.validate(["1", "2"], col(type, { allowMultiple: false }))).toThrow(/one/);
      const v = { linkedPulseIds: [{ linkedPulseId: "1" }, { linkedPulseId: "2" }], items: [{ id: "1", name: "Delta", boardId: "5" }, { id: "2", name: "Echo", boardId: "5" }] };
      expect(l.serialize(v, c)).toEqual({ linkedPulseIds: [{ linkedPulseId: "1" }, { linkedPulseId: "2" }] });
      expect(l.format(v, c)).toBe("Delta, Echo");
      expect(l.filter.test(v, "contains", "delt", c)).toBe(true);
      expect(l.filter.test(v, "any_of", ["2"], c)).toBe(true);
      expect(l.filter.test(v, "none_of", ["2"], c)).toBe(false);
      expect(l.filter.test(null, "is_empty", null, c)).toBe(true);
      expect(l.sortKey!(v, c)).toBe("delta, echo");
      expect(l.sortKey!(null, c)).toBeNull();
      expect(l.summarize!([v, v], c)!.text).toBe("4");
    });
  }
  it("board_relation settings", () => {
    const l = L("board_relation");
    expect(l.normalizeSettings!({ boardIds: ["1", "1", "2"], allowMultiple: false })).toMatchObject({ boardIds: ["1", "2"], allowMultiple: false });
    expect(() => l.normalizeSettings!({ boardIds: ["x"] })).toThrow();
    expect(() => l.normalizeSettings!({ boardIds: "1" })).toThrow();
  });
});

describe("doc", () => {
  const l = L("doc");
  it("links docs", () => {
    expect(l.validate({ files: [{ objectId: "7", name: "Plan" }] }, col("doc"))).toEqual({ files: [{ objectId: "7", fileType: "DOC", name: "Plan" }] });
    expect(l.validate("8", col("doc"))).toEqual({ files: [{ objectId: "8", fileType: "DOC" }] });
    expect(() => l.validate("x", col("doc"))).toThrow();
    expect(l.serialize({ files: [{ objectId: "7", fileType: "DOC", name: "Plan" }] }, col("doc"))).toEqual({ files: [{ objectId: "7", fileType: "DOC" }] });
    expect(l.format({ files: [{ objectId: "7", fileType: "DOC", name: "Plan" }] }, col("doc"))).toBe("Plan");
    expect(l.filter.test({ files: [{ objectId: "7", fileType: "DOC", name: "Plan" }] }, "contains", "pla", col("doc"))).toBe(true);
  });
});

describe("time_tracking", () => {
  const l = L("time_tracking");
  const T0 = Date.UTC(2026, 9, 6, 10, 0, 0);
  it("start / stop / add / remove commands", () => {
    let v = applyTimeCommand(null, { command: "start" }, "9", T0)!;
    expect(v.running).toBe(true);
    expect(totalSeconds(v, T0 + 90_000)).toBe(90);
    expect(applyTimeCommand(v, { command: "start" }, "9", T0 + 5000)).toEqual(v); // idempotent
    v = applyTimeCommand(v, { command: "stop" }, "9", T0 + 3_600_000)!;
    expect(v).toMatchObject({ running: false, startDate: null, duration: 3600 });
    expect(v.additional_value).toHaveLength(1);
    expect(v.additional_value[0]).toMatchObject({ started_user_id: "9", ended_user_id: "9" });
    v = applyTimeCommand(v, { command: "add", seconds: 1800, note: "review" }, "9", T0 + 4_000_000)!;
    expect(v.duration).toBe(5400);
    expect(v.additional_value[1].manually_entered).toBe(true);
    const manual = v.additional_value[1].id;
    v = applyTimeCommand(v, { command: "remove", id: manual }, "9", T0)!;
    expect(v.duration).toBe(3600);
    expect(() => applyTimeCommand(v, { command: "remove", id: "nope" }, "9", T0)).toThrow();
    expect(() => applyTimeCommand(v, { command: "add", seconds: -5 }, "9", T0)).toThrow();
    expect(applyTimeCommand(v, { command: "reset" }, "9", T0)).toBeNull();
    expect(applyTimeCommand(null, { command: "stop" }, "9", T0)).toEqual({ running: false, startDate: null, duration: 0, additional_value: [] });
  });
  it("validates stored values and keeps commands for the hooks", () => {
    expect(l.validate({ command: "start" }, col("time_tracking"))).toEqual({ command: "start" });
    const v = l.validate({ running: false, duration: 120, additional_value: [{ id: "a", started_at: "2026-10-06T10:00:00Z", ended_at: "2026-10-06T10:02:00Z" }] }, col("time_tracking"))!;
    expect(v.duration).toBe(120);
    expect(v.additional_value[0].started_user_id).toBeNull();
    expect(l.validate({ running: false, duration: 0 }, col("time_tracking"))).toBeNull();
    expect(() => l.validate({ duration: -1 }, col("time_tracking"))).toThrow();
    expect(() => l.validate({ additional_value: [{ started_at: "x", ended_at: "y" }] }, col("time_tracking"))).toThrow();
    expect(() => l.validate("x", col("time_tracking"))).toThrow();
  });
  it("formats, filters, sorts, sums", () => {
    const v: TimeValue = { running: false, startDate: null, duration: 5400, additional_value: [] };
    expect(formatDuration(5400)).toBe("1:30:00");
    expect(l.format(v, col("time_tracking"))).toBe("1:30:00");
    expect(l.filter.test(v, "gt", 1, col("time_tracking"))).toBe(true);
    expect(l.filter.test(v, "gt", 2, col("time_tracking"))).toBe(false);
    expect(l.sortKey!(v, col("time_tracking"))).toBe(5400);
    expect(l.summarize!([v, v, null], col("time_tracking"))!.text).toBe("3:00:00");
  });
});

describe("mirror", () => {
  const l = L("mirror");
  const target = col("numbers", { unit: "u" });
  const entries = [{ itemId: "1", name: "A", value: 10 }, { itemId: "2", name: "B", value: 5 }, { itemId: "3", name: "C", value: null }];
  it("aggregates and formats via the target column", () => {
    expect(buildMirrorValue(target, entries, "sum").result).toBe(15);
    expect(buildMirrorValue(target, entries, "avg").result).toBe(7.5);
    expect(buildMirrorValue(target, entries, "min").result).toBe(5);
    expect(buildMirrorValue(target, entries, "max").result).toBe(10);
    expect(buildMirrorValue(target, entries, "median").result).toBe(7.5);
    expect(buildMirrorValue(target, entries, "count").result).toBe(2);
    const none = buildMirrorValue(target, entries, "none");
    expect(none.result).toBeNull();
    expect(l.format(none, col("mirror"))).toBe("10u, 5u");
    const sum = buildMirrorValue(target, entries, "sum");
    expect(l.format(sum, col("mirror"))).toBe("15u");
    expect(l.serialize(sum, col("mirror"))).toMatchObject({ display_value: "15u", linked_item_ids: ["1", "2", "3"] });
  });
  it("mirrors status labels and filters / sorts / summarizes", () => {
    const status = col("status", { labels: [{ id: 1, text: "Done", color: "#0f0", index: 0 }] });
    const v = buildMirrorValue(status, [{ itemId: "1", name: "A", value: { index: 1 } }], "none");
    expect(l.format(v, col("mirror"))).toBe("Done");
    expect(l.filter.test(v, "contains", "don", col("mirror"))).toBe(true);
    const s = buildMirrorValue(target, entries, "sum");
    expect(l.filter.test(s, "gt", 10, col("mirror"))).toBe(true);
    expect(l.sortKey!(s, col("mirror"))).toBe(15);
    expect(l.summarize!([s, buildMirrorValue(target, entries, "sum")], col("mirror"))!.text).toBe("30u");
    expect(() => l.validate(1, col("mirror"))).toThrow(/read-only/);
    expect(() => l.normalizeSettings!({ aggregate: "wat" })).toThrow();
  });
});

describe("formula column", () => {
  const l = L("formula");
  it("rejects bad syntax in settings, formats numbers", () => {
    expect(() => l.normalizeSettings!({ formula: "1 +" })).toThrow(/Formula error/);
    expect(l.normalizeSettings!({ formula: "{A}*2", decimals: 1 })).toMatchObject({ formula: "{A}*2", decimals: 1 });
    expect(() => l.validate(1, col("formula"))).toThrow();
    const c = col("formula", { decimals: 2, unit: "€", unitPosition: "left" });
    expect(l.format({ value: 12.5, text: "12.5", kind: "number" }, c)).toBe("€12.50");
    expect(l.format({ value: null, text: "", kind: "empty", error: "x" }, c)).toBe("#ERROR");
    expect(l.format({ value: "abc", text: "abc", kind: "text" }, c)).toBe("abc");
    expect(l.filter.test({ value: 12, text: "12", kind: "number" }, "gt", 10, c)).toBe(true);
    expect(l.filter.test({ value: "abc", text: "abc", kind: "text" }, "contains", "b", c)).toBe(true);
    expect(l.sortKey!({ value: 12, text: "12", kind: "number" }, c)).toBe(12);
    expect(l.sortKey!(null, c)).toBeNull();
    expect(l.summarize!([{ value: 1, text: "1", kind: "number" }, { value: 2, text: "2", kind: "number" }], c)!.text).toBe("€3.00");
    expect(l.serialize({ value: 1, text: "1", kind: "number" }, c)).toEqual({ value: 1, text: "1" });
  });
});

describe("progress, auto_number, item_id, logs, assignees", () => {
  it("progress", () => {
    const l = L("progress");
    expect(buildProgress(1, 4)).toEqual({ done: 1, total: 4, percent: 25 });
    expect(buildProgress(0, 0)).toBeNull();
    expect(isDoneLabel({ id: 1, text: "Afgerond", color: "#0f0", index: 0 })).toBe(true);
    expect(isDoneLabel({ id: 2, text: "Whatever", color: "#0f0", index: 1, isDone: true })).toBe(true);
    expect(isDoneLabel({ id: 3, text: "Stuck", color: "#f00", index: 2 })).toBe(false);
    const v = buildProgress(1, 2);
    expect(l.format(v, col("progress"))).toBe("50%");
    expect(l.filter.test(v, "gte", 50, col("progress"))).toBe(true);
    expect(l.sortKey!(v, col("progress"))).toBe(50);
    expect(l.summarize!([buildProgress(1, 2), buildProgress(3, 4)], col("progress"))!.text).toBe("67%");
    expect(() => l.normalizeSettings!({ source: "x" })).toThrow();
    expect(() => l.validate(1, col("progress"))).toThrow();
    expect(l.serialize(v, col("progress"))).toEqual({ percent: 50, done: 1, total: 2 });
  });
  it("auto_number", () => {
    const l = L("auto_number");
    expect(l.format(7, col("auto_number", { prefix: "T-", minDigits: 4 }))).toBe("T-0007");
    expect(l.filter.test(7, "lt", 8, col("auto_number"))).toBe(true);
    expect(l.sortKey!(7, col("auto_number"))).toBe(7);
    expect(() => l.normalizeSettings!({ minDigits: 20 })).toThrow();
    expect(() => l.validate(1, col("auto_number"))).toThrow();
  });
  it("item_id", () => {
    const l = L("item_id");
    expect(l.format("2000000417", col("item_id"))).toBe("2000000417");
    expect(l.filter.test("2000000417", "contains", "417", col("item_id"))).toBe(true);
    expect(l.sortKey!("20", col("item_id"))).toBe(20);
    expect(() => l.validate("1", col("item_id"))).toThrow();
  });
  it("creation_log and last_updated", () => {
    for (const type of ["creation_log", "last_updated"]) {
      const l = L(type);
      const v = { at: "2026-10-06T09:30:00.000Z", userId: "9" };
      expect(l.format(v, col(type), { userNames: new Map([["9", "Admin"]]) })).toBe("2026-10-06 09:30 - Admin");
      expect(l.format(v, col(type))).toBe("2026-10-06 09:30");
      expect(l.filter.test(v, "after", "2026-10-01", col(type))).toBe(true);
      expect(l.filter.test(v, "before", "2026-10-01", col(type))).toBe(false);
      expect(l.filter.test(v, "is", "2026-10-06", col(type))).toBe(true);
      expect(l.sortKey!(v, col(type))).toBe(v.at);
      expect(l.serialize(v, col(type))).toMatchObject({ [type === "creation_log" ? "created_at" : "updated_at"]: v.at });
      expect(() => l.validate(v, col(type))).toThrow();
    }
  });
  it("item_assignees", () => {
    const l = L("item_assignees");
    const v = { personsAndTeams: [{ id: "9", kind: "person" as const }] };
    expect(l.readOnly).toBe(true);
    expect(l.format(v, col("item_assignees"), { userNames: new Map([["9", "Admin"]]) })).toBe("Admin");
    expect(l.filter.test(v, "any_of", ["9"], col("item_assignees"))).toBe(true);
    expect(() => l.validate(["9"], col("item_assignees"))).toThrow();
  });
});

describe("numbers summary functions", () => {
  const l = L("numbers");
  it("honours settings.summary", () => {
    const vals = [1, 2, 3, 10, null];
    expect(l.summarize!(vals, col("numbers"))!.text).toBe("16");
    expect(l.summarize!(vals, col("numbers", { summary: "avg" }))!.text).toBe("4");
    expect(l.summarize!(vals, col("numbers", { summary: "min" }))!.text).toBe("1");
    expect(l.summarize!(vals, col("numbers", { summary: "max" }))!.text).toBe("10");
    expect(l.summarize!(vals, col("numbers", { summary: "median" }))!.text).toBe("2.5");
    expect(l.summarize!(vals, col("numbers", { summary: "count" }))!.text).toBe("4");
    expect(l.summarize!(vals, col("numbers", { summary: "none" }))).toBeNull();
  });
});
