import { describe, expect, it } from "vitest";
import { docToMarkdown, docToText, ensureBlockIds, extractMentions, markdownToDoc, topLevelBlockIds } from "@/modules/boards-extra/docs/serialize";
import type { PMDoc } from "@/modules/boards-extra/docs/types";

const MD = `# Titel

Een **vette** en *schuine* regel met \`code\` en [link](https://example.com).

- punt een
- punt twee
  - genest

1. eerste
2. tweede

- [ ] todo
- [x] klaar

> citaat

\`\`\`ts
const a = 1;
\`\`\`

---

| A | B |
| --- | --- |
| 1 | 2 |
`;

describe("doc serialization", () => {
  it("parses markdown into block nodes", () => {
    const doc = markdownToDoc(MD);
    const types = doc.content!.map((n) => n.type);
    expect(types).toEqual(["heading", "paragraph", "bulletList", "orderedList", "taskList", "blockquote", "codeBlock", "horizontalRule", "table"]);
    expect(doc.content![0].attrs?.level).toBe(1);
    const nested = doc.content![2].content![1].content!.find((c) => c.type === "bulletList");
    expect(nested?.content).toHaveLength(1);
    const tasks = doc.content![4].content!;
    expect(tasks.map((t) => t.attrs?.checked)).toEqual([false, true]);
    const bold = doc.content![1].content!.find((n) => n.marks?.some((m) => m.type === "bold"));
    expect(bold?.text).toBe("vette");
  });

  it("roundtrips markdown -> doc -> markdown", () => {
    const once = docToMarkdown(markdownToDoc(MD));
    const twice = docToMarkdown(markdownToDoc(once));
    expect(twice).toBe(once);
    expect(once).toContain("# Titel");
    expect(once).toContain("**vette**");
    expect(once).toContain("- [x] klaar");
    expect(once).toContain("| A | B |");
    expect(once).toContain("  - genest");
  });

  it("serializes mentions, embeds and files", () => {
    const doc: PMDoc = { type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "Hoi " }, { type: "mention", attrs: { id: "42", label: "Builder" } }] },
      { type: "embed", attrs: { kind: "item", id: "9", boardId: "3", label: "Klant X" } },
      { type: "fileAttachment", attrs: { name: "a.pdf", url: "/f/a.pdf" } },
    ] };
    expect(docToMarkdown(doc)).toContain("Hoi @Builder");
    expect(docToMarkdown(doc, { mentions: "link" })).toContain("[@Builder](mention:42)");
    expect(docToMarkdown(doc)).toContain("[Item: Klant X](/boards/3?item=9)");
    expect(docToText(doc)).toBe("Hoi @Builder\nKlant X\na.pdf");
    // mention link syntax parses back to a mention node
    const back = markdownToDoc(docToMarkdown(doc, { mentions: "link" }));
    expect(extractMentions(back)).toEqual(["42"]);
  });

  it("extracts text and mentions", () => {
    const doc = markdownToDoc("# H\n\nTekst met [@Admin](mention:7) en [@Admin](mention:7) en [@Planner](mention:8)\n\n- a\n- b");
    expect(extractMentions(doc).sort()).toEqual(["7", "8"]);
    expect(docToText(doc)).toBe("H\nTekst met @Admin en @Admin en @Planner\na\nb");
  });

  it("ensureBlockIds assigns unique ids and keeps existing ones", () => {
    let n = 0;
    const doc = markdownToDoc("a\n\nb\n\nc");
    doc.content![0] = { ...doc.content![0], attrs: { blockId: "keep" } };
    doc.content![1] = { ...doc.content![1], attrs: { blockId: "keep" } }; // duplicate
    const out = ensureBlockIds(doc, () => `g${++n}`);
    expect(topLevelBlockIds(out)).toEqual(["keep", "g1", "g2"]);
    expect(ensureBlockIds(out).content!.map((x) => x.attrs?.blockId)).toEqual(["keep", "g1", "g2"]);
    expect(doc.content![0].attrs?.blockId).toBe("keep"); // input untouched
  });

  it("handles empty input", () => {
    expect(markdownToDoc("").content).toEqual([{ type: "paragraph" }]);
    expect(docToText(markdownToDoc(""))).toBe("");
  });
});
