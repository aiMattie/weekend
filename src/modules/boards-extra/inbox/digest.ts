/** Pure builder of the daily digest mail (Dutch). */
import type { NotificationDto } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TYPE_LABEL: Record<string, string> = {
  mention: "Vermeldingen", reply: "Antwoorden", assigned: "Toegewezen aan jou", update: "Updates", system: "Systeem", automation: "Automations",
};

export function buildDigestMail(name: string, rows: NotificationDto[]): { subject: string; text: string; html: string } {
  const groups = new Map<string, NotificationDto[]>();
  for (const r of rows) (groups.get(r.type) ?? groups.set(r.type, []).get(r.type)!).push(r);
  const first = name.split(/\s+/)[0] || name;
  const subject = rows.length === 1 ? "1 ongelezen melding in je inbox" : `${rows.length} ongelezen meldingen in je inbox`;
  const textParts = [`Hoi ${first},`, "", `Dit heb je gemist (${rows.length}):`];
  const htmlParts = [`<p>Hoi ${esc(first)},</p>`, `<p>Dit heb je gemist (${rows.length}):</p>`];
  for (const [type, list] of groups) {
    const label = TYPE_LABEL[type] ?? type;
    textParts.push("", `${label} (${list.length})`);
    htmlParts.push(`<h3>${esc(label)} (${list.length})</h3><ul>`);
    for (const n of list) {
      textParts.push(`- ${n.title}${n.body ? `: ${n.body}` : ""}${n.link ? ` (${n.link})` : ""}`);
      htmlParts.push(`<li>${n.link ? `<a href="${esc(n.link)}">${esc(n.title)}</a>` : esc(n.title)}${n.body ? `<br/><span>${esc(n.body)}</span>` : ""}</li>`);
    }
    htmlParts.push("</ul>");
  }
  return { subject, text: textParts.join("\n"), html: htmlParts.join("") };
}
