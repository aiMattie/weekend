/** monday WorkDoc blocks -> Tiptap/ProseMirror JSON (the clone's WorkDocs format). Pure. */
import type { MDocBlock } from "./monday-types";

type PM = { type: string; attrs?: Record<string, unknown>; content?: PM[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] };
interface Delta { insert: string | Record<string, unknown>; attributes?: Record<string, unknown> }

function inline(deltas: Delta[]): PM[] {
  const out: PM[] = [];
  for (const d of deltas) {
    if (typeof d.insert !== "string") { out.push({ type: "text", text: "[bijlage]" }); continue; }
    for (const [i, part] of d.insert.split("\n").entries()) {
      if (i > 0) out.push({ type: "hardBreak" });
      if (!part) continue;
      const a = d.attributes ?? {};
      const marks: NonNullable<PM["marks"]> = [];
      if (a.bold) marks.push({ type: "bold" });
      if (a.italic) marks.push({ type: "italic" });
      if (a.underline) marks.push({ type: "underline" });
      if (a.strike) marks.push({ type: "strike" });
      if (a.code) marks.push({ type: "code" });
      if (typeof a.link === "string" && /^https?:/i.test(a.link)) marks.push({ type: "link", attrs: { href: a.link } });
      out.push({ type: "text", text: part, ...(marks.length ? { marks } : {}) });
    }
  }
  return out;
}

const parse = (content: string): { deltas: Delta[]; checked: boolean } => {
  try {
    const o = JSON.parse(content) as { deltaFormat?: Delta[]; checked?: boolean };
    return { deltas: o.deltaFormat ?? [], checked: !!o.checked };
  } catch { return { deltas: [], checked: false }; }
};

export function mondayBlocksToTiptap(blocks: MDocBlock[]): { type: "doc"; content: PM[] } {
  const sorted = [...blocks].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const content: PM[] = [];
  let list: PM | null = null;
  const push = (n: PM) => { list = null; content.push(n); };
  for (const b of sorted) {
    const { deltas, checked } = parse(b.content);
    const text = inline(deltas);
    const para = (): PM => ({ type: "paragraph", ...(text.length ? { content: text } : {}) });
    switch (b.type) {
      case "large_title": push({ type: "heading", attrs: { level: 1 }, content: text }); break;
      case "medium_title": push({ type: "heading", attrs: { level: 2 }, content: text }); break;
      case "small_title": push({ type: "heading", attrs: { level: 3 }, content: text }); break;
      case "bulleted_list": case "numbered_list": {
        const type = b.type === "bulleted_list" ? "bulletList" : "orderedList";
        if (!list || (list as PM).type !== type) { list = { type, content: [] }; content.push(list); }
        (list as PM).content!.push({ type: "listItem", content: [para()] });
        break;
      }
      case "check_list": push({ type: "paragraph", content: [{ type: "text", text: checked ? "☑ " : "☐ " }, ...text] }); break;
      case "quote": push({ type: "blockquote", content: [para()] }); break;
      case "code": push({ type: "codeBlock", content: [{ type: "text", text: deltas.map((d) => (typeof d.insert === "string" ? d.insert : "")).join("") || " " }] }); break;
      case "divider": push({ type: "horizontalRule" }); break;
      case "image": case "video": case "table": case "layout": case "notice_box": push({ type: "paragraph", content: [{ type: "text", text: `[${b.type} uit monday niet overgenomen]` }, ...text] }); break;
      default: push(para());
    }
  }
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}
