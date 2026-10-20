/**
 * formula language (pure, no db). Used by the `formula` column and unit tested.
 *
 *   {Column Title}   reference to a column of the same board (title, key or id; a mirror gives a list)
 *   + - * / ^        arithmetic (empty counts as 0; `/` by 0 is an error)
 *   &                text concatenation
 *   = <> != < <= > >=  comparison
 *   "text" 'text' 12 3.5 TRUE FALSE
 *   IF AND OR NOT ISBLANK SUM AVERAGE MIN MAX COUNT ROUND ROUNDUP ROUNDDOWN ABS SQRT POWER MOD INT
 *   TODAY NOW DATE YEAR MONTH DAY WEEKDAY DAYS ADD_DAYS FORMAT_DATE
 *   CONCATENATE LEFT RIGHT MID LEN UPPER LOWER TRIM SUBSTITUTE REPLACE SEARCH TEXT VALUE
 * Dates are `{ date: "YYYY-MM-DD" }`; date +/- number shifts days, date - date gives days.
 */
import { addDays, daysBetween, isoDate } from "../util";

export class FormulaError extends Error {
  constructor(message: string, public pos = 0) {
    super(message);
  }
}

export type DateVal = { date: string };
export type Val = number | string | boolean | null | DateVal | Val[];
export const isDate = (v: unknown): v is DateVal => typeof v === "object" && v !== null && !Array.isArray(v) && "date" in v;

export type Ast =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "ref"; name: string }
  | { t: "call"; fn: string; args: Ast[]; pos: number }
  | { t: "bin"; op: string; l: Ast; r: Ast; pos: number }
  | { t: "un"; op: string; e: Ast };

type Tok = { k: "num" | "str" | "ref" | "id" | "op" | "eof"; v: string; pos: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "{") {
      const end = src.indexOf("}", i);
      if (end < 0) throw new FormulaError("Missing } after column reference", i);
      out.push({ k: "ref", v: src.slice(i + 1, end).trim(), pos: i });
      i = end + 1;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) j++;
        s += src[j++];
      }
      if (j >= src.length) throw new FormulaError("Unterminated text", i);
      out.push({ k: "str", v: s, pos: i });
      i = j + 1;
    } else if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(src.slice(i))!;
      out.push({ k: "num", v: m[0], pos: i });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i))!;
      out.push({ k: "id", v: m[0].toUpperCase(), pos: i });
      i += m[0].length;
    } else {
      const two = src.slice(i, i + 2);
      if (["<>", "!=", "<=", ">=", "=="].includes(two)) { out.push({ k: "op", v: two === "==" ? "=" : two === "!=" ? "<>" : two, pos: i }); i += 2; }
      else if ("+-*/^&=<>(),;".includes(c)) { out.push({ k: "op", v: c === ";" ? "," : c, pos: i }); i++; }
      else throw new FormulaError(`Unexpected character "${c}"`, i);
    }
  }
  out.push({ k: "eof", v: "", pos: src.length });
  return out;
}

export function parseFormula(src: string): Ast {
  if (!src.trim()) throw new FormulaError("Formula is empty");
  const toks = tokenize(src.startsWith("=") ? src.slice(1) : src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek().k === "op" && peek().v === v;
  const eat = (v: string) => {
    if (!isOp(v)) throw new FormulaError(`Expected "${v}"`, peek().pos);
    p++;
  };

  const parseCompare = (): Ast => {
    let l = parseConcat();
    while (peek().k === "op" && ["=", "<>", "<", "<=", ">", ">="].includes(peek().v)) {
      const t = toks[p++];
      l = { t: "bin", op: t.v, l, r: parseConcat(), pos: t.pos };
    }
    return l;
  };
  const parseConcat = (): Ast => {
    let l = parseAdd();
    while (isOp("&")) { const t = toks[p++]; l = { t: "bin", op: "&", l, r: parseAdd(), pos: t.pos }; }
    return l;
  };
  const parseAdd = (): Ast => {
    let l = parseMul();
    while (isOp("+") || isOp("-")) { const t = toks[p++]; l = { t: "bin", op: t.v, l, r: parseMul(), pos: t.pos }; }
    return l;
  };
  const parseMul = (): Ast => {
    let l = parsePow();
    while (isOp("*") || isOp("/")) { const t = toks[p++]; l = { t: "bin", op: t.v, l, r: parsePow(), pos: t.pos }; }
    return l;
  };
  const parsePow = (): Ast => {
    const l = parseUnary();
    if (isOp("^")) { const t = toks[p++]; return { t: "bin", op: "^", l, r: parsePow(), pos: t.pos }; }
    return l;
  };
  const parseUnary = (): Ast => {
    if (isOp("-") || isOp("+")) { const t = toks[p++]; return { t: "un", op: t.v, e: parseUnary() }; }
    return parsePrimary();
  };
  const parsePrimary = (): Ast => {
    const t = toks[p++];
    switch (t.k) {
      case "num": return { t: "num", v: Number(t.v) };
      case "str": return { t: "str", v: t.v };
      case "ref": return { t: "ref", name: t.v };
      case "id": {
        if (t.v === "TRUE" || t.v === "FALSE") return { t: "bool", v: t.v === "TRUE" };
        if (!isOp("(")) throw new FormulaError(`Unknown name ${t.v} (did you mean {${t.v}} or ${t.v}()?)`, t.pos);
        eat("(");
        const args: Ast[] = [];
        if (!isOp(")")) {
          do { args.push(parseCompare()); } while (isOp(",") && (p++, true));
        }
        eat(")");
        return { t: "call", fn: t.v, args, pos: t.pos };
      }
      case "op":
        if (t.v === "(") { const e = parseCompare(); eat(")"); return e; }
        throw new FormulaError(`Unexpected "${t.v}"`, t.pos);
      default:
        throw new FormulaError("Unexpected end of formula", t.pos);
    }
  };

  const ast = parseCompare();
  if (peek().k !== "eof") throw new FormulaError(`Unexpected "${peek().v}"`, peek().pos);
  return ast;
}

export function formulaRefs(ast: Ast, acc: string[] = []): string[] {
  switch (ast.t) {
    case "ref": if (!acc.includes(ast.name)) acc.push(ast.name); break;
    case "call": ast.args.forEach((a) => formulaRefs(a, acc)); break;
    case "bin": formulaRefs(ast.l, acc); formulaRefs(ast.r, acc); break;
    case "un": formulaRefs(ast.e, acc); break;
  }
  return acc;
}

/* ---------------------------------------------------------------- evaluation */

export interface EvalCtx {
  /** resolve `{name}`; throw FormulaError when the column does not exist */
  ref(name: string): Val;
  now?: Date;
}

const flat = (vs: Val[]): Val[] => vs.flatMap((v) => (Array.isArray(v) ? flat(v) : [v]));
export const toNum = (v: Val): number => {
  if (v === null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (isDate(v)) return Date.parse(v.date) / 86_400_000;
  if (Array.isArray(v)) return flat(v).reduce<number>((a, x) => a + toNum(x), 0);
  const n = Number(String(v).trim().replace(",", "."));
  if (!Number.isFinite(n)) throw new FormulaError(`"${v}" is not a number`);
  return n;
};
const numbersOf = (vs: Val[]): number[] => flat(vs).filter((v) => v !== null && v !== "" && typeof v !== "boolean").map((v) => (isDate(v) ? NaN : typeof v === "number" ? v : Number(String(v).replace(",", ".")))).filter((n) => Number.isFinite(n));

export function toText(v: Val): string {
  if (v === null) return "";
  if (typeof v === "number") return String(Math.round(v * 1e10) / 1e10);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (isDate(v)) return v.date;
  if (Array.isArray(v)) return flat(v).map(toText).join(", ");
  return v;
}
const truthy = (v: Val): boolean => (Array.isArray(v) ? flat(v).some(truthy) : v === null ? false : typeof v === "string" ? v !== "" : isDate(v) ? true : !!v);
const asDate = (v: Val): string => {
  if (isDate(v)) return v.date;
  const d = typeof v === "string" ? isoDate(v) : null;
  if (!d) throw new FormulaError(`"${toText(v)}" is not a date`);
  return d;
};

function compare(op: string, a: Val, b: Val): boolean {
  const norm = (v: Val): number | string | boolean => (v === null ? "" : isDate(v) ? v.date : Array.isArray(v) ? toText(v) : v);
  let x = norm(a);
  let y = norm(b);
  if (typeof x === "string" && typeof y === "number" && x === "") x = 0;
  if (typeof y === "string" && typeof x === "number" && y === "") y = 0;
  if (typeof x === "string" && typeof y === "string") { x = x.toLowerCase(); y = y.toLowerCase(); }
  switch (op) {
    case "=": return x === y;
    case "<>": return x !== y;
    case "<": return x < y;
    case "<=": return x <= y;
    case ">": return x > y;
    default: return x >= y;
  }
}

const roundTo = (n: number, d: number, mode: "round" | "up" | "down") => {
  const f = 10 ** d;
  const x = n * f;
  const r = mode === "round" ? Math.sign(x) * Math.round(Math.abs(x)) : mode === "up" ? Math.sign(x) * Math.ceil(Math.abs(x)) : Math.sign(x) * Math.floor(Math.abs(x));
  return Math.round((r / f) * 1e10) / 1e10;
};

const arity = (name: string, args: Val[], min: number, max = min) => {
  if (args.length < min || args.length > max) throw new FormulaError(`${name} expects ${min === max ? min : `${min}-${max}`} argument(s)`);
};

function callFn(fn: string, rawArgs: Ast[], ev: (a: Ast) => Val, ctx: EvalCtx): Val {
  // lazy functions
  if (fn === "IF") {
    if (rawArgs.length < 2 || rawArgs.length > 3) throw new FormulaError("IF expects 2-3 arguments");
    return truthy(ev(rawArgs[0])) ? ev(rawArgs[1]) : rawArgs[2] ? ev(rawArgs[2]) : null;
  }
  const a = rawArgs.map(ev);
  const now = ctx.now ?? new Date();
  const todayIso = now.toISOString().slice(0, 10);
  switch (fn) {
    case "AND": return flat(a).every(truthy);
    case "OR": return flat(a).some(truthy);
    case "NOT": arity(fn, a, 1); return !truthy(a[0]);
    case "ISBLANK": arity(fn, a, 1); return a[0] === null || a[0] === "" || (Array.isArray(a[0]) && a[0].length === 0);
    case "SUM": return numbersOf(a).reduce((x, y) => x + y, 0);
    case "AVERAGE": { const n = numbersOf(a); return n.length ? n.reduce((x, y) => x + y, 0) / n.length : null; }
    case "MIN": { const n = numbersOf(a); return n.length ? Math.min(...n) : null; }
    case "MAX": { const n = numbersOf(a); return n.length ? Math.max(...n) : null; }
    case "COUNT": return numbersOf(a).length;
    case "ROUND": case "ROUNDUP": case "ROUNDDOWN": arity(fn, a, 1, 2); return roundTo(toNum(a[0]), a[1] === undefined ? 0 : toNum(a[1]), fn === "ROUND" ? "round" : fn === "ROUNDUP" ? "up" : "down");
    case "ABS": arity(fn, a, 1); return Math.abs(toNum(a[0]));
    case "SQRT": { arity(fn, a, 1); const n = toNum(a[0]); if (n < 0) throw new FormulaError("SQRT of a negative number"); return Math.sqrt(n); }
    case "POWER": arity(fn, a, 2); return toNum(a[0]) ** toNum(a[1]);
    case "MOD": { arity(fn, a, 2); const d = toNum(a[1]); if (d === 0) throw new FormulaError("Division by zero"); return ((toNum(a[0]) % d) + d) % d; }
    case "INT": arity(fn, a, 1); return Math.floor(toNum(a[0]));
    case "TODAY": arity(fn, a, 0); return { date: todayIso };
    case "NOW": arity(fn, a, 0); return now.toISOString().slice(0, 16).replace("T", " ");
    case "DATE": { arity(fn, a, 3); const d = new Date(Date.UTC(toNum(a[0]), toNum(a[1]) - 1, toNum(a[2]))); return { date: d.toISOString().slice(0, 10) }; }
    case "YEAR": arity(fn, a, 1); return Number(asDate(a[0]).slice(0, 4));
    case "MONTH": arity(fn, a, 1); return Number(asDate(a[0]).slice(5, 7));
    case "DAY": arity(fn, a, 1); return Number(asDate(a[0]).slice(8, 10));
    case "WEEKDAY": { arity(fn, a, 1); return ((new Date(`${asDate(a[0])}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; }
    case "DAYS": arity(fn, a, 2); return daysBetween(asDate(a[1]), asDate(a[0]));
    case "ADD_DAYS": arity(fn, a, 2); return { date: addDays(asDate(a[0]), Math.round(toNum(a[1]))) };
    case "FORMAT_DATE": {
      arity(fn, a, 1, 2);
      const d = asDate(a[0]);
      const fmt = a[1] === undefined ? "YYYY-MM-DD" : toText(a[1]);
      return fmt.replace(/YYYY/g, d.slice(0, 4)).replace(/YY/g, d.slice(2, 4)).replace(/MM/g, d.slice(5, 7)).replace(/DD/g, d.slice(8, 10));
    }
    case "CONCATENATE": return a.map(toText).join("");
    case "LEFT": arity(fn, a, 1, 2); return toText(a[0]).slice(0, a[1] === undefined ? 1 : Math.max(0, toNum(a[1])));
    case "RIGHT": { arity(fn, a, 1, 2); const s = toText(a[0]); const n = a[1] === undefined ? 1 : Math.max(0, toNum(a[1])); return n === 0 ? "" : s.slice(-n); }
    case "MID": arity(fn, a, 3); return toText(a[0]).substr(Math.max(0, toNum(a[1]) - 1), Math.max(0, toNum(a[2])));
    case "LEN": arity(fn, a, 1); return toText(a[0]).length;
    case "UPPER": arity(fn, a, 1); return toText(a[0]).toUpperCase();
    case "LOWER": arity(fn, a, 1); return toText(a[0]).toLowerCase();
    case "TRIM": arity(fn, a, 1); return toText(a[0]).trim().replace(/\s+/g, " ");
    case "SUBSTITUTE": arity(fn, a, 3); return toText(a[1]) === "" ? toText(a[0]) : toText(a[0]).split(toText(a[1])).join(toText(a[2]));
    case "REPLACE": { arity(fn, a, 4); const s = toText(a[0]); const st = toNum(a[1]) - 1; return s.slice(0, st) + toText(a[3]) + s.slice(st + toNum(a[2])); }
    case "SEARCH": { arity(fn, a, 2, 3); const i = toText(a[1]).toLowerCase().indexOf(toText(a[0]).toLowerCase(), a[2] === undefined ? 0 : toNum(a[2]) - 1); return i < 0 ? 0 : i + 1; }
    case "TEXT": arity(fn, a, 1, 2); return typeof a[0] === "number" && a[1] !== undefined ? a[0].toFixed(Math.max(0, Math.min(10, toNum(a[1])))) : toText(a[0]);
    case "VALUE": arity(fn, a, 1); return toNum(a[0]);
    default: throw new FormulaError(`Unknown function ${fn}`);
  }
}

export function evaluateFormula(ast: Ast, ctx: EvalCtx): Val {
  const ev = (n: Ast): Val => {
    switch (n.t) {
      case "num": case "str": case "bool": return n.v;
      case "ref": return ctx.ref(n.name);
      case "call": return callFn(n.fn, n.args, ev, ctx);
      case "un": return n.op === "-" ? -toNum(ev(n.e)) : toNum(ev(n.e));
      case "bin": {
        const l = ev(n.l);
        const r = ev(n.r);
        switch (n.op) {
          case "&": return toText(l) + toText(r);
          case "+":
            if (isDate(l) && !isDate(r)) return { date: addDays(l.date, Math.round(toNum(r))) };
            if (isDate(r) && !isDate(l)) return { date: addDays(r.date, Math.round(toNum(l))) };
            return toNum(l) + toNum(r);
          case "-":
            if (isDate(l) && isDate(r)) return daysBetween(r.date, l.date);
            if (isDate(l)) return { date: addDays(l.date, -Math.round(toNum(r))) };
            return toNum(l) - toNum(r);
          case "*": return toNum(l) * toNum(r);
          case "/": { const d = toNum(r); if (d === 0) throw new FormulaError("Division by zero", n.pos); return toNum(l) / d; }
          case "^": return toNum(l) ** toNum(r);
          default: return compare(n.op, l, r);
        }
      }
    }
  };
  return ev(ast);
}

export type FormulaResult = { value: number | string | boolean | null; text: string; kind: "number" | "text" | "date" | "boolean" | "empty"; error?: string };

/** Parse + evaluate and normalise to a storable result. Never throws. */
export function runFormula(src: string, ctx: EvalCtx): FormulaResult {
  try {
    const v = evaluateFormula(parseFormula(src), ctx);
    if (v === null || (Array.isArray(v) && v.length === 0)) return { value: null, text: "", kind: "empty" };
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return { value: null, text: "", kind: "empty", error: "Not a finite number" };
      const n = Math.round(v * 1e10) / 1e10;
      return { value: n, text: String(n), kind: "number" };
    }
    if (typeof v === "boolean") return { value: v, text: toText(v), kind: "boolean" };
    if (isDate(v)) return { value: v.date, text: v.date, kind: "date" };
    const t = toText(v);
    return t === "" ? { value: null, text: "", kind: "empty" } : { value: t, text: t, kind: "text" };
  } catch (e) {
    return { value: null, text: "", kind: "empty", error: e instanceof Error ? e.message : String(e) };
  }
}
