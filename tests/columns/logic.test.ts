import { describe, expect, it } from "vitest";
import { getColumnLogic, listColumnLogic } from "../../src/server/columns/registry";
import { DEFAULT_STATUS_LABELS } from "../../src/server/columns/status";
import type { ColumnRef } from "../../src/server/columns/types";

const col = (type: string, settings: Record<string, unknown> = {}): ColumnRef => ({ id: "1", key: type, title: type, type, settings });

describe("column registry", () => {
  it("has the reference types and a fallback for unknown ones", () => {
    const types = listColumnLogic().map((l) => l.type);
    for (const t of ["checkbox", "date", "dropdown", "link", "long_text", "numbers", "people", "status", "text"]) expect(types).toContain(t);
    expect(getColumnLogic("some_future_type").validate({ x: 1 }, col("some_future_type"))).toEqual({ x: 1 });
  });
  it("status: accepts label, index and API shapes; filters and summarises", () => {
    const l = getColumnLogic("status");
    const c = col("status", { labels: DEFAULT_STATUS_LABELS });
    expect(l.validate("Done", c)).toEqual({ index: 1 });
    expect(l.validate({ label: "stuck" }, c)).toEqual({ index: 2 });
    expect(l.validate({ index: 0 }, c)).toEqual({ index: 0 });
    expect(l.validate(null, c)).toBeNull();
    expect(() => l.validate("Nope", c)).toThrow();
    expect(l.format({ index: 1 }, c)).toBe("Done");
    expect(l.filter.test({ index: 1 }, "any_of", [1, 2], c)).toBe(true);
    expect(l.filter.test(null, "is_empty", null, c)).toBe(true);
    expect(l.summarize!([{ index: 1 }, { index: 1 }, { index: 2 }], c)!.segments!.map((s) => s.count)).toEqual([2, 1]);
  });
  it("numbers: parses strings, formats units, sums", () => {
    const l = getColumnLogic("numbers");
    const c = col("numbers", { unit: "€", unitPosition: "left", decimals: 2 });
    expect(l.validate("12,5", c)).toBe(12.5);
    expect(() => l.validate("abc", c)).toThrow();
    expect(l.format(12.5, c)).toBe("€12.50");
    expect(l.summarize!([1, 2, null], c)!.text).toBe("€3.00");
    expect(l.filter.test(5, "gt", 3, c)).toBe(true);
  });
  it("date: validates, formats, filters", () => {
    const l = getColumnLogic("date");
    expect(l.validate("2026-10-06T09:30", col("date"))).toEqual({ date: "2026-10-06", time: "09:30:00" });
    expect(() => l.validate("06-10-2026", col("date"))).toThrow();
    expect(l.filter.test({ date: "2000-01-01" }, "overdue", null, col("date"))).toBe(true);
  });
  it("people, checkbox, dropdown, link, text, long_text", () => {
    expect(getColumnLogic("people").validate(["12", { id: 13, kind: "team" }], col("people"))).toEqual({ personsAndTeams: [{ id: "12", kind: "person" }, { id: "13", kind: "team" }] });
    expect(getColumnLogic("checkbox").validate(true, col("checkbox"))).toEqual({ checked: true });
    expect(getColumnLogic("checkbox").validate(false, col("checkbox"))).toBeNull();
    const dd = col("dropdown", { labels: [{ id: 1, text: "A" }, { id: 2, text: "B" }] });
    expect(getColumnLogic("dropdown").validate(["a", 2], dd)).toEqual({ ids: [1, 2] });
    expect(getColumnLogic("link").validate("https://example.com", col("link"))).toEqual({ url: "https://example.com" });
    expect(() => getColumnLogic("link").validate("javascript:alert(1)", col("link"))).toThrow();
    expect(getColumnLogic("text").validate("", col("text"))).toBeNull();
    expect(getColumnLogic("long_text").validate("hello", col("long_text"))).toEqual({ text: "hello" });
  });
});
