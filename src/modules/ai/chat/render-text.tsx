import type { ReactNode } from "react";

/** Tiny markdown subset for chat answers: paragraphs, "- " lists, **bold**. No HTML is ever injected. */
function inline(s: string, key: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={`${key}${i}`}>{part.slice(2, -2)}</strong> : part));
}

export function RenderText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => { if (list.length) { blocks.push(<ul key={`u${k}`}>{list.map((l, i) => <li key={i}>{inline(l, `l${k}${i}`)}</li>)}</ul>); list = []; } };
  text.split("\n").forEach((line, i) => {
    const m = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
    if (m) { list.push(m[1]); return; }
    flush(i);
    if (line.trim()) blocks.push(<p key={`p${i}`}>{inline(line.replace(/^#{1,4}\s+/, ""), `p${i}`)}</p>);
  });
  flush(text.length);
  return <>{blocks}</>;
}
