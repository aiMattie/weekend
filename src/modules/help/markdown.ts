/**
 * Tiny Markdown renderer for the handleiding (docs/handleiding/*.md). No dependencies, no raw HTML:
 * everything is escaped, so the output is safe to put in dangerouslySetInnerHTML.
 * Supported: headings (with ids), paragraphs, ordered/unordered/nested lists (with continuation blocks),
 * tables, fenced code, blockquotes, horizontal rules, HTML comments (dropped), and inline code, bold,
 * italic, links, images. Relative links to `NN-naam.md` and `img/x.png` are rewritten to /help routes.
 */

export interface Heading { level: number; text: string; id: string }
export interface RenderResult { html: string; headings: Heading[]; links: string[]; images: string[] }

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain text of an inline markdown fragment (for headings, search and ids). */
export function stripInline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
}

export function slugify(s: string): string {
  return stripInline(s)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "sectie";
}

export type LinkTarget =
  | { kind: "external"; href: string }
  | { kind: "chapter"; slug: string; hash: string }
  | { kind: "image"; file: string }
  | { kind: "anchor"; hash: string }
  | { kind: "other"; href: string };

/** Classify a link/image target found in the markdown. */
export function classifyTarget(href: string): LinkTarget {
  if (/^(https?:|mailto:)/i.test(href)) return { kind: "external", href };
  if (href.startsWith("#")) return { kind: "anchor", hash: href.slice(1) };
  const [pathPart, hash = ""] = href.split("#");
  const img = pathPart.match(/^(?:\.\/)?img\/([^/]+)$/);
  if (img) return { kind: "image", file: img[1] };
  const md = pathPart.match(/^(?:\.\/)?([^/]+)\.md$/);
  if (md) return { kind: "chapter", slug: md[1], hash };
  return { kind: "other", href };
}

function inline(text: string, out: { links: string[]; images: string[] }): string {
  const codes: string[] = [];
  let s = text.replace(/`([^`]+)`/g, (_m, c: string) => { codes.push(`<code>${escapeHtml(c)}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  s = escapeHtml(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, src: string) => {
    const t = classifyTarget(src.replace(/&amp;/g, "&"));
    out.images.push(src);
    const url = t.kind === "image" ? `/help/img/${t.file}` : src;
    return `<img src="${url}" alt="${alt}" loading="lazy" />`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const raw = href.replace(/&amp;/g, "&");
    out.links.push(raw);
    const t = classifyTarget(raw);
    if (t.kind === "chapter") return `<a href="/help${t.slug.toLowerCase() === "readme" ? "" : `/${t.slug}`}${t.hash ? `#${t.hash}` : ""}">${label}</a>`;
    if (t.kind === "anchor") return `<a href="#${t.hash}">${label}</a>`;
    if (t.kind === "external") return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    return `<a href="${href}">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\*)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]);
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const isBlank = (l: string) => l.trim() === "";
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

interface Ctx { headings: Heading[]; ids: Map<string, number>; links: string[]; images: string[] }

function uniqueId(ctx: Ctx, text: string): string {
  const base = slugify(text);
  const n = ctx.ids.get(base) ?? 0;
  ctx.ids.set(base, n + 1);
  return n === 0 ? base : `${base}-${n + 1}`;
}

function blocks(lines: string[], ctx: Ctx): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    // HTML comment (single or multi line)
    if (line.trim().startsWith("<!--")) {
      while (i < lines.length && !lines[i].includes("-->")) i++;
      i++;
      continue;
    }
    const fence = line.match(/^(\s*)(```|~~~)\s*([\w-]*)/);
    if (fence) {
      const indent = fence[1].length;
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[2])) { body.push(lines[i].slice(Math.min(indent, lines[i].length - lines[i].trimStart().length))); i++; }
      i++;
      out.push(`<pre><code${fence[3] ? ` class="lang-${escapeHtml(fence[3])}"` : ""}>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const level = h[1].length;
      const text = stripInline(h[2]);
      const id = uniqueId(ctx, text);
      ctx.headings.push({ level, text, id });
      out.push(`<h${level} id="${id}">${inline(h[2], ctx)}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { out.push("<hr />"); i++; continue; }
    if (line.trimStart().startsWith(">")) {
      const q: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) { q.push(lines[i].trimStart().replace(/^>\s?/, "")); i++; }
      out.push(`<blockquote>${blocks(q, ctx)}</blockquote>`);
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && !isBlank(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c, ctx)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, ci) => `<td>${inline(r[ci] ?? "", ctx)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (LIST_RE.test(line)) {
      const start = i;
      const baseIndent = (line.match(/^(\s*)/) ?? ["", ""])[1].length;
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (isBlank(l)) {
          // a blank line continues the list only when the next non-blank line is indented or another item at base level
          let j = i + 1;
          while (j < lines.length && isBlank(lines[j])) j++;
          if (j < lines.length && (lines[j].match(/^(\s*)/) ?? ["", ""])[1].length > baseIndent) { i = j; continue; }
          if (j < lines.length && LIST_RE.test(lines[j]) && (lines[j].match(/^(\s*)/) ?? ["", ""])[1].length === baseIndent) { i = j; continue; }
          break;
        }
        const ind = (l.match(/^(\s*)/) ?? ["", ""])[1].length;
        if (ind > baseIndent || (LIST_RE.test(l) && ind === baseIndent)) { i++; continue; }
        break;
      }
      out.push(renderList(lines.slice(start, i), baseIndent, ctx));
      continue;
    }
    // paragraph
    const p: string[] = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(#{1,6})\s/.test(lines[i]) && !lines[i].trim().startsWith("```") && !lines[i].trim().startsWith("<!--") && !lines[i].trimStart().startsWith(">") && !LIST_RE.test(lines[i])) {
      if (lines[i].includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) break;
      p.push(lines[i].trim());
      i++;
    }
    if (p.length === 0) { p.push(lines[i].trim()); i++; }
    out.push(`<p>${inline(p.join(" "), ctx)}</p>`);
  }
  return out.join("\n");
}

function renderList(lines: string[], baseIndent: number, ctx: Ctx): string {
  const first = lines[0].match(LIST_RE)!;
  const ordered = /\d/.test(first[2]);
  const items: string[][] = [];
  for (const l of lines) {
    const m = l.match(LIST_RE);
    const ind = (l.match(/^(\s*)/) ?? ["", ""])[1].length;
    if (m && ind === baseIndent) {
      const markerWidth = m[2].length + 1;
      items.push([" ".repeat(baseIndent + markerWidth) + m[3]]);
    } else if (items.length) {
      items[items.length - 1].push(l);
    }
  }
  const lis = items.map((it) => {
    // de-indent continuation lines relative to the item's content column
    const contentCol = (it[0].match(/^(\s*)/) ?? ["", ""])[1].length;
    const inner = it.map((l) => (isBlank(l) ? "" : l.slice(Math.min(contentCol, (l.match(/^(\s*)/) ?? ["", ""])[1].length))));
    const html = blocks(inner, ctx);
    const simple = html.match(/^<p>([\s\S]*?)<\/p>(?=$|\n<(?:ul|ol|pre|p|div)\b)/);
    return `<li>${simple ? html.replace(/^<p>([\s\S]*?)<\/p>/, "$1") : html}</li>`;
  });
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${lis.join("")}</${tag}>`;
}

/** Render markdown to safe HTML plus headings, link targets and image targets (as written in the source). */
export function renderMarkdown(source: string): RenderResult {
  const ctx: Ctx = { headings: [], ids: new Map(), links: [], images: [] };
  const html = blocks(source.replace(/\r\n/g, "\n").split("\n"), ctx);
  return { html, headings: ctx.headings, links: ctx.links, images: ctx.images };
}
