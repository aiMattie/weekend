/** Atlassian Document Format (Jira v3 descriptions/comments) -> small HTML subset accepted by sanitizeHtml. */
interface AdfNode { type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: AdfNode[] }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function marks(text: string, node: AdfNode): string {
  let out = esc(text);
  for (const m of node.marks ?? []) {
    if (m.type === "strong") out = `<strong>${out}</strong>`;
    else if (m.type === "em") out = `<em>${out}</em>`;
    else if (m.type === "code") out = `<code>${out}</code>`;
    else if (m.type === "strike") out = `<s>${out}</s>`;
    else if (m.type === "underline") out = `<u>${out}</u>`;
    else if (m.type === "link" && typeof m.attrs?.href === "string" && /^https?:/i.test(m.attrs.href)) out = `<a href="${esc(m.attrs.href)}">${out}</a>`;
  }
  return out;
}

function children(n: AdfNode): string { return (n.content ?? []).map(render).join(""); }

function render(n: AdfNode): string {
  switch (n.type) {
    case "doc": return children(n);
    case "paragraph": return `<p>${children(n)}</p>`;
    case "heading": return `<h${Math.min(3, Number(n.attrs?.level ?? 2))}>${children(n)}</h${Math.min(3, Number(n.attrs?.level ?? 2))}>`;
    case "text": return marks(n.text ?? "", n);
    case "hardBreak": return "<br>";
    case "bulletList": return `<ul>${children(n)}</ul>`;
    case "orderedList": return `<ol>${children(n)}</ol>`;
    case "listItem": return `<li>${(n.content ?? []).map((c) => (c.type === "paragraph" ? children(c) : render(c))).join("")}</li>`;
    case "blockquote": return `<blockquote>${children(n)}</blockquote>`;
    case "codeBlock": return `<pre><code>${esc((n.content ?? []).map((c) => c.text ?? "").join(""))}</code></pre>`;
    case "rule": return "<hr>";
    case "mention": return `<strong>${esc(String(n.attrs?.text ?? "@iemand"))}</strong>`;
    case "emoji": return esc(String(n.attrs?.text ?? n.attrs?.shortName ?? ""));
    case "inlineCard": case "blockCard": { const u = String(n.attrs?.url ?? ""); return /^https?:/i.test(u) ? `<a href="${esc(u)}">${esc(u)}</a>` : ""; }
    case "mediaSingle": case "mediaGroup": return "<p><em>[bijlage in Jira]</em></p>";
    case "panel": case "expand": case "nestedExpand": return `<blockquote>${children(n)}</blockquote>`;
    case "table": return (n.content ?? []).map((row) => `<p>${(row.content ?? []).map((cell) => (cell.content ?? []).map((c) => (c.content ?? []).map(render).join("")).join(" ")).join(" | ")}</p>`).join("");
    default: return children(n);
  }
}

/** Jira description/comment body (ADF object, or an already plain string) to HTML. */
export function adfToHtml(body: unknown): string {
  if (body === null || body === undefined || body === "") return "";
  if (typeof body === "string") return `<p>${esc(body)}</p>`;
  return render(body as AdfNode);
}
