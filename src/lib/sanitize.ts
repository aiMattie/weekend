/**
 * Tiny allow-list HTML sanitiser for update bodies (Tiptap output). No dependencies.
 * Keeps basic formatting, links and @mention spans; drops everything else (scripts, styles,
 * event handlers, unknown tags) while keeping their text.
 */
const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "blockquote", "code", "pre", "span", "h1", "h2", "h3", "hr"]);
const VOID = new Set(["br", "hr"]);
const ALLOWED_ATTRS: Record<string, string[]> = { a: ["href", "target", "rel"], span: ["data-type", "data-id", "data-label", "class"] };

const escapeAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function sanitizeHtml(input: string): string {
  const out: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\s*\/?>|<!--[\s\S]*?-->|([^<]+)|</g;
  let m: RegExpExecArray | null;
  const stack: string[] = [];
  let skipUntil: string | null = null;
  while ((m = re.exec(input))) {
    const [full, tagRaw, attrRaw, text] = m;
    if (text !== undefined) {
      if (!skipUntil) out.push(text.replace(/</g, "&lt;"));
      continue;
    }
    if (!tagRaw) {
      if (!skipUntil) out.push("&lt;");
      continue;
    }
    const tag = tagRaw.toLowerCase();
    const closing = full.startsWith("</");
    if (skipUntil) {
      if (closing && tag === skipUntil) skipUntil = null;
      continue;
    }
    if (tag === "script" || tag === "style" || tag === "iframe" || tag === "object") {
      if (!closing && !full.endsWith("/>")) skipUntil = tag;
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) continue;
    if (closing) {
      const idx = stack.lastIndexOf(tag);
      if (idx >= 0) {
        while (stack.length > idx) out.push(`</${stack.pop()}>`);
      }
      continue;
    }
    const attrs: string[] = [];
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(attrRaw ?? ""))) {
      const name = a[1].toLowerCase();
      const val = a[2] ?? a[3] ?? a[4] ?? "";
      if (!(ALLOWED_ATTRS[tag] ?? []).includes(name)) continue;
      if (name === "href" && !/^(https?:|mailto:|\/)/i.test(val.trim())) continue;
      attrs.push(`${name}="${escapeAttr(val)}"`);
    }
    if (tag === "a") attrs.push('rel="noopener noreferrer"');
    out.push(`<${tag}${attrs.length ? " " + attrs.join(" ") : ""}${VOID.has(tag) ? " /" : ""}>`);
    if (!VOID.has(tag)) stack.push(tag);
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join("");
}

export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|li|h[1-3]|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** User ids mentioned via `<span data-type="mention" data-id="123">`. */
export function extractMentions(html: string): string[] {
  const ids = new Set<string>();
  for (const m of html.matchAll(/data-type="mention"[^>]*data-id="(\d+)"|data-id="(\d+)"[^>]*data-type="mention"/g)) ids.add(m[1] ?? m[2]);
  return [...ids];
}
