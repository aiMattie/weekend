import { describe, expect, it } from "vitest";
import { FormulaError, formulaRefs, parseFormula, runFormula, type Val } from "../../src/server/columns/computed/formula-lang";

const NOW = new Date("2026-10-06T12:00:00Z");
const run = (src: string, refs: Record<string, Val> = {}) =>
  runFormula(src, { now: NOW, ref: (n) => { if (!(n in refs)) throw new FormulaError(`Unknown column {${n}}`); return refs[n]; } });
const val = (src: string, refs: Record<string, Val> = {}) => run(src, refs).value;

describe("formula parser", () => {
  it("parses operators with the right precedence", () => {
    expect(val("1 + 2 * 3")).toBe(7);
    expect(val("(1 + 2) * 3")).toBe(9);
    expect(val("2 ^ 3 ^ 2")).toBe(512);
    expect(val("-2 + 5")).toBe(3);
    expect(val("10 / 4")).toBe(2.5);
    expect(val("=1+1")).toBe(2);
  });
  it("handles references with spaces and symbols", () => {
    expect(val("{Uren dev} * {Uurtarief}", { "Uren dev": 10, Uurtarief: 95 })).toBe(950);
    expect(formulaRefs(parseFormula("{A} + SUM({B}, {A}) & {C d}"))).toEqual(["A", "B", "C d"]);
  });
  it("concatenates with & and CONCATENATE", () => {
    expect(val('"a" & "b" & 1')).toBe("ab1");
    expect(val('CONCATENATE("x", {n})', { n: 5 })).toBe("x5");
  });
  it("evaluates logic functions", () => {
    expect(val('IF({s} = "Done", 1, 0)', { s: "done" })).toBe(1);
    expect(val("IF(AND(1 > 0, OR(0 > 1, 2 >= 2)), \"yes\", \"no\")")).toBe("yes");
    expect(val("IF(NOT(TRUE), 1)")).toBeNull();
    expect(val("ISBLANK({x})", { x: null })).toBe(true);
    expect(val("{a} <> {b}", { a: 1, b: 2 })).toBe(true);
  });
  it("evaluates aggregations over lists (mirrors) and scalars", () => {
    expect(val("SUM({m})", { m: [1, 2, 3.5] })).toBe(6.5);
    expect(val("AVERAGE(1, 2, 3, 4)")).toBe(2.5);
    expect(val("MIN({m}, 0)", { m: [4, 2] })).toBe(0);
    expect(val("MAX({m})", { m: [4, 9, null] })).toBe(9);
    expect(val("SUM({m})", { m: [] })).toBe(0);
    expect(val("COUNT({m})", { m: [1, "x", 2] })).toBe(2);
  });
  it("rounds and does maths", () => {
    expect(val("ROUND(2.567, 2)")).toBe(2.57);
    expect(val("ROUND(-2.5)")).toBe(-3);
    expect(val("ROUNDUP(2.01, 1)")).toBe(2.1);
    expect(val("ROUNDDOWN(2.99)")).toBe(2);
    expect(val("ABS(-4) + SQRT(9) + POWER(2,3) + MOD(7,3) + INT(2.9)")).toBe(4 + 3 + 8 + 1 + 2);
  });
  it("does date maths", () => {
    expect(val("TODAY()")).toBe("2026-10-06");
    expect(val("DAYS({e}, {s})", { e: { date: "2026-10-10" }, s: { date: "2026-10-06" } })).toBe(4);
    expect(val("{d} + 7", { d: { date: "2026-10-30" } })).toBe("2026-11-06");
    expect(val("{e} - {s}", { e: { date: "2026-10-10" }, s: { date: "2026-10-06" } })).toBe(4);
    expect(val("YEAR(TODAY()) * 100 + MONTH(TODAY())")).toBe(202610);
    expect(val("DAY({d})", { d: { date: "2026-10-30" } })).toBe(30);
    expect(val("ADD_DAYS(DATE(2026,2,27), 3)")).toBe("2026-03-02");
    expect(val('FORMAT_DATE(DATE(2026,10,6), "DD-MM-YYYY")')).toBe("06-10-2026");
    expect(val("WEEKDAY(DATE(2026,10,6))")).toBe(2);
  });
  it("does text functions", () => {
    expect(val('LEFT("Hello", 2)')).toBe("He");
    expect(val('RIGHT("Hello", 3)')).toBe("llo");
    expect(val('MID("Hello", 2, 3)')).toBe("ell");
    expect(val('LEN("Hello")')).toBe(5);
    expect(val('UPPER("a") & LOWER("B")')).toBe("Ab");
    expect(val('TRIM("  a   b ")')).toBe("a b");
    expect(val('SUBSTITUTE("a-b-c", "-", "+")')).toBe("a+b+c");
    expect(val('REPLACE("abcdef", 2, 3, "X")')).toBe("aXef");
    expect(val('SEARCH("lo", "Hello")')).toBe(4);
    expect(val("TEXT(3.14159, 2)")).toBe("3.14");
    expect(val('VALUE("12,5") * 2')).toBe(25);
  });
  it("treats empty references as 0 in arithmetic", () => {
    expect(val("{a} + 5", { a: null })).toBe(5);
  });
  it("reports errors instead of throwing", () => {
    expect(run("1 / 0").error).toMatch(/Division by zero/);
    expect(run("1 +").error).toBeTruthy();
    expect(run("FOO(1)").error).toMatch(/Unknown function/);
    expect(run("{Nope}").error).toMatch(/Unknown column/);
    expect(run("(1").error).toBeTruthy();
    expect(run("").error).toBeTruthy();
    expect(run('"abc" * 2').error).toMatch(/not a number/);
  });
  it("throws FormulaError with a position from parseFormula", () => {
    expect(() => parseFormula("1 + $")).toThrow(FormulaError);
    expect(() => parseFormula("{open")).toThrow(/Missing/);
    expect(() => parseFormula("SUM 1")).toThrow();
  });
  it("normalises results", () => {
    expect(run("0.1 + 0.2").value).toBe(0.3);
    expect(run('"x"').kind).toBe("text");
    expect(run("TRUE").kind).toBe("boolean");
    expect(run("TODAY()").kind).toBe("date");
    expect(run('""').kind).toBe("empty");
  });
});
