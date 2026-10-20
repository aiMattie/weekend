/**
 * Pure helpers for doc block JSON (Tiptap/ProseMirror) <-> Markdown / text. No React, no db.
 * Node types in use: paragraph, heading, bulletList, orderedList, listItem, taskList, taskItem,
 * blockquote, codeBlock, horizontalRule, table(+Row/Header/Cell), image, embed, fileAttachment,
 * mention, hardBreak. Marks: bold, italic, strike, underline, code, link.
 */
import type { PMDoc, PMMark, PMNode } from "./types";

/* ------------------------------------------------------------------ inline: markdown -> nodes */

const withMarks = (text: string, marks: PMMark[]): PMNode => ({ type: "text", text, ...(marks.length ? { marks } : {}) });

const INLINE: { re: RegExp; make: (m: RegExpExecArray, marks: PMMark[]) => PMNode[] }[] = [
  { re: /`([^`]+)`/, make: (m, marks) => [withMarks(m[1], [...marks, { type: "code" }])] },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    make: (m, marks) => {
      if (m[2].startsWith("mention:")) return [{ type: "mention", attrs: { id: m[2].slice(8), label: m[1].replace(/^@/, "") } }];
      return parseInline(m[1], [...marks, { type: "link", attrs: { href: m[2] } }]);
    },
  },
  { re: /\*\*(.+?)\*\*/, make: (m, marks) => parseInline(m[1], [...marks, { type: "bold" }]) },
  { re: /~~(.+?)~~/, make: (m, marks) => parseInline(m[1], [...marks, { type: "strike" }]) },
  { re: /(?<![*\w])\*(?!\s)([^*]+?)(?<!\s)\*(?!\*)/, make: (m, marks) => parseInline(m[1], [...marks, { type: "italic" }]) },
  { re: /(?<![\w])_(?!\s)([^_]+?)(?<!\s)_(?![\w])/, make: (m, marks) => parseInline(m[1], [...marks, { type: "italic" }]) },
];

export function parseInline(src: string, marks: PMMark[] = []): PMNode[] {
  if (!src) return [];
  let best: { idx: number; len: number; nodes: PMNode[] } | null = null;
  for (const rule of INLINE) {
    const m = rule.re.exec(src);
    if (m && (best === null || m.index < best.idx)) best = { idx: m.index, len: m[0].length, nodes: rule.make(m, marks) };
  }
  if (!best) return [withMarks(src, marks)];
  const out: PMNode[] = [];
  if (best.idx > 0) out.push(withMarks(src.slice(0, best.idx), marks));
  out.push(...best.nodes);
  out.push(...parseInline(src.slice(best.idx + best.len), marks));
  return out;
}

const para = (text: string): PMNode => {
  const parts = text.split("\n");
  const content: PMNode[] = [];
  parts.forEach((p, i) => {
    if (i > 0) content.push({ type: "hardBreak" });
    content.push(...parseInline(p.trim()));
  });
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
};

/* ------------------------------------------------------------------ blocks: markdown -> doc */

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HR_RE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const IMG_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/;

const splitRow = (line: string): string[] => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const indentOf = (s: string) => s.match(/^\s*/)![0].replace(/\t/g, "  ").length;

function parseList(lines: string[], start: number): { node: PMNode; next: number } {
  const first = LIST_RE.exec(lines[start])!;
  const baseIndent = indentOf(first[1]);
  const ordered = /\d/.test(first[2]);
  const isTask = /^\[( |x|X)\]\s/.test(first[3]);
  const items: PMNode[] = [];
  let i = start;
  while (i < lines.length) {
    const m = LIST_RE.exec(lines[i]);
    if (!m || indentOf(m[1]) !== baseIndent) break;
    if (/\d/.test(m[2]) !== ordered) break;
    let text = m[3];
    let checked = false;
    if (isTask) {
      const t = /^\[( |x|X)\]\s(.*)$/.exec(text);
      if (t) { checked = t[1] !== " "; text = t[2]; }
    }
    i++;
    const content: PMNode[] = [para(text)];
    while (i < lines.length) {
      const nm = LIST_RE.exec(lines[i]);
      if (nm && indentOf(nm[1]) > baseIndent) {
        const sub = parseList(lines, i);
        content.push(sub.node);
        i = sub.next;
      } else break;
    }
    items.push(isTask ? { type: "taskItem", attrs: { checked }, content } : { type: "listItem", content });
  }
  return { node: { type: isTask ? "taskList" : ordered ? "orderedList" : "bulletList", content: items }, next: i };
}

export function markdownToBlocks(md: string): PMNode[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: PMNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = /^\s*```(\S*)\s*$/.exec(line);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push({ type: "codeBlock", attrs: fence[1] ? { language: fence[1] } : {}, content: code.length ? [{ type: "text", text: code.join("\n") }] : [] });
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) { out.push({ type: "heading", attrs: { level: Math.min(h[1].length, 3) }, content: parseInline(h[2]) }); i++; continue; }
    if (HR_RE.test(line)) { out.push({ type: "horizontalRule" }); i++; continue; }
    const img = IMG_RE.exec(line.trim());
    if (img) { out.push({ type: "image", attrs: { src: img[2], alt: img[1] } }); i++; continue; }
    if (line.trim().startsWith("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const rows: PMNode[] = [{ type: "tableRow", content: splitRow(line).map((c) => ({ type: "tableHeader", content: [para(c)] })) }];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push({ type: "tableRow", content: splitRow(lines[i]).map((c) => ({ type: "tableCell", content: [para(c)] })) });
        i++;
      }
      out.push({ type: "table", content: rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push({ type: "blockquote", content: markdownToBlocks(q.join("\n")) });
      continue;
    }
    if (LIST_RE.test(line)) {
      const r = parseList(lines, i);
      out.push(r.node);
      i = r.next;
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*>)/.test(lines[i]) && !HR_RE.test(lines[i]) && !LIST_RE.test(lines[i]) && !IMG_RE.test(lines[i].trim())) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    out.push(para(buf.join("\n")));
  }
  return out;
}

export function markdownToDoc(md: string): PMDoc {
  const content = markdownToBlocks(md);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/* ------------------------------------------------------------------ doc -> markdown */

function inlineMd(nodes: PMNode[] | undefined, mentions: "plain" | "link"): string {
  return (nodes ?? []).map((n) => {
    if (n.type === "hardBreak") return "  \n";
    if (n.type === "mention") {
      const label = String(n.attrs?.label ?? n.attrs?.id ?? "");
      return mentions === "link" ? `[@${label}](mention:${n.attrs?.id})` : `@${label}`;
    }
    if (n.type !== "text") return inlineMd(n.content, mentions);
    let s = n.text ?? "";
    const marks = n.marks ?? [];
    const has = (t: string) => marks.some((m) => m.type === t);
    if (has("code")) s = `\`${s}\``;
    if (has("bold")) s = `**${s}**`;
    if (has("italic")) s = `*${s}*`;
    if (has("strike")) s = `~~${s}~~`;
    const link = marks.find((m) => m.type === "link");
    if (link) s = `[${s}](${String(link.attrs?.href ?? "")})`;
    return s;
  }).join("");
}

function listMd(node: PMNode, depth: number, mentions: "plain" | "link"): string[] {
  const out: string[] = [];
  const pad = "  ".repeat(depth);
  (node.content ?? []).forEach((li, idx) => {
    const kids = li.content ?? [];
    const first = kids.find((k) => k.type === "paragraph");
    const prefix = node.type === "orderedList" ? `${idx + 1}. ` : node.type === "taskList" ? `- [${li.attrs?.checked ? "x" : " "}] ` : "- ";
    out.push(`${pad}${prefix}${inlineMd(first?.content, mentions)}`);
    for (const k of kids) {
      if (k === first) continue;
      if (["bulletList", "orderedList", "taskList"].includes(k.type)) out.push(...listMd(k, depth + 1, mentions));
      else { const t = blockMd(k, mentions); if (t) out.push(`${pad}  ${t.replace(/\n/g, `\n${pad}  `)}`); }
    }
  });
  return out;
}

function blockMd(n: PMNode, mentions: "plain" | "link"): string {
  switch (n.type) {
    case "paragraph": return inlineMd(n.content, mentions);
    case "heading": return `${"#".repeat(Number(n.attrs?.level ?? 1))} ${inlineMd(n.content, mentions)}`;
    case "bulletList": case "orderedList": case "taskList": return listMd(n, 0, mentions).join("\n");
    case "blockquote": return (n.content ?? []).map((c) => blockMd(c, mentions)).join("\n\n").split("\n").map((l) => `> ${l}`.trimEnd()).join("\n");
    case "codeBlock": return `\`\`\`${n.attrs?.language ?? ""}\n${(n.content ?? []).map((c) => c.text ?? "").join("")}\n\`\`\``;
    case "horizontalRule": return "---";
    case "image": return `![${n.attrs?.alt ?? ""}](${n.attrs?.src ?? ""})`;
    case "embed": {
      const kind = n.attrs?.kind === "item" ? "Item" : "Board";
      const href = n.attrs?.kind === "item" ? `/boards/${n.attrs?.boardId}?item=${n.attrs?.id}` : `/boards/${n.attrs?.id}`;
      return `[${kind}: ${n.attrs?.label ?? n.attrs?.id}](${href})`;
    }
    case "fileAttachment": return `[${n.attrs?.name ?? "bestand"}](${n.attrs?.url ?? ""})`;
    case "table": {
      const rows = (n.content ?? []).map((r) => (r.content ?? []).map((c) => (c.content ?? []).map((p) => inlineMd(p.content, mentions)).join(" ").replace(/\|/g, "\\|")));
      if (!rows.length) return "";
      const w = Math.max(...rows.map((r) => r.length));
      const fmt = (r: string[]) => `| ${Array.from({ length: w }, (_, i) => r[i] ?? "").join(" | ")} |`;
      return [fmt(rows[0]), `|${" --- |".repeat(w)}`, ...rows.slice(1).map(fmt)].join("\n");
    }
    default: return inlineMd(n.content, mentions);
  }
}

export function docToMarkdown(doc: PMDoc | null | undefined, opts: { mentions?: "plain" | "link" } = {}): string {
  const mentions = opts.mentions ?? "plain";
  return (doc?.content ?? []).map((n) => blockMd(n, mentions)).filter((s, i, a) => s !== "" || (i > 0 && a[i - 1] !== "")).join("\n\n").trim() + "\n";
}

/* ------------------------------------------------------------------ text / mentions / block ids */

const INLINE_HOLDERS = new Set(["paragraph", "heading", "codeBlock"]);

function textOf(n: PMNode): string {
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return "\n";
  if (n.type === "mention") return `@${n.attrs?.label ?? n.attrs?.id ?? ""}`;
  if (n.type === "embed") return String(n.attrs?.label ?? "");
  if (n.type === "fileAttachment") return String(n.attrs?.name ?? "");
  const kids = (n.content ?? []).map(textOf);
  if (INLINE_HOLDERS.has(n.type)) return kids.join("");
  if (n.type === "tableRow") return kids.join("\t");
  return kids.filter(Boolean).join("\n");
}

export function docToText(doc: PMDoc | null | undefined): string {
  return (doc?.content ?? []).map(textOf).filter(Boolean).join("\n").trim();
}

export function extractMentions(doc: PMDoc | null | undefined): string[] {
  const ids = new Set<string>();
  const walk = (n: PMNode) => {
    if (n.type === "mention" && n.attrs?.id) ids.add(String(n.attrs.id));
    n.content?.forEach(walk);
  };
  (doc?.content ?? []).forEach(walk);
  return [...ids];
}

let counter = 0;
export const newBlockId = (): string => `b${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Give every top-level block a unique `blockId` attribute (keeps existing unique ids). Pure. */
export function ensureBlockIds(doc: PMDoc, gen: () => string = newBlockId): PMDoc {
  const seen = new Set<string>();
  const content = (doc.content ?? []).map((n) => {
    const cur = typeof n.attrs?.blockId === "string" ? (n.attrs.blockId as string) : null;
    const id = cur && !seen.has(cur) ? cur : gen();
    seen.add(id);
    return { ...n, attrs: { ...(n.attrs ?? {}), blockId: id } };
  });
  return { ...doc, content };
}

export const topLevelBlockIds = (doc: PMDoc): string[] => (doc.content ?? []).map((n) => String(n.attrs?.blockId ?? "")).filter(Boolean);
