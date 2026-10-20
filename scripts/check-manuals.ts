/**
 * Validates docs/handleiding: every relative link (chapter + #anchor), every image reference,
 * the README table of contents and leftover draft text. Usage: npm run manuals:check
 * Exit code 1 when something is wrong.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { classifyTarget, renderMarkdown } from "../src/modules/help/markdown";

const DIR = path.join(process.cwd(), "docs", "handleiding");
const files = readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
const chapters = files.filter((f) => /^\d\d-.+\.md$/.test(f));
const problems: string[] = [];
const warnings: string[] = [];
const problem = (file: string, msg: string) => problems.push(`${file}: ${msg}`);

const parsed = new Map<string, ReturnType<typeof renderMarkdown>>();
for (const f of files) parsed.set(f, renderMarkdown(readFileSync(path.join(DIR, f), "utf8")));

const used = new Set<string>();
let linkCount = 0;
let imageCount = 0;

for (const f of files) {
  const r = parsed.get(f)!;
  const src = readFileSync(path.join(DIR, f), "utf8");
  for (const img of r.images) {
    imageCount++;
    const t = classifyTarget(img);
    if (t.kind !== "image") { problem(f, `afbeelding ${img} moet img/<naam> zijn`); continue; }
    used.add(t.file);
    if (!existsSync(path.join(DIR, "img", t.file))) problem(f, `afbeelding ontbreekt: img/${t.file}`);
  }
  for (const href of r.links) {
    linkCount++;
    const t = classifyTarget(href);
    if (t.kind === "external") continue;
    if (t.kind === "anchor") {
      if (!r.headings.some((h) => h.id === t.hash)) problem(f, `anker #${t.hash} bestaat niet in dit hoofdstuk`);
    } else if (t.kind === "chapter") {
      const target = `${t.slug}.md`;
      const tr = parsed.get(target);
      if (!tr) problem(f, `link naar onbekend hoofdstuk ${target}`);
      else if (t.hash && !tr.headings.some((h) => h.id === t.hash)) problem(f, `link ${href}: anker #${t.hash} bestaat niet in ${target}`);
    } else {
      problem(f, `onbekende relatieve link: ${href}`);
    }
  }
  const drafts = [/Concept van de agent/i, /\bTODO\b/, /\blorem\b/i, /\(Screenshot:/, /^> Screenshots:/m, /<!-- (SECTIE|TOOLBAR|GRID)/, /\bTBD\b/];
  for (const re of drafts) if (re.test(src)) problem(f, `conceptrestant gevonden: ${re}`);
  if (/^\d\d-/.test(f) && !r.headings.some((h) => h.level === 1)) problem(f, "geen H1-titel");
}

const readme = readFileSync(path.join(DIR, "README.md"), "utf8");
for (const c of chapters) if (!readme.includes(`(${c})`)) problem("README.md", `hoofdstuk ${c} staat niet in de inhoudsopgave`);

const unused = readdirSync(path.join(DIR, "img")).filter((n) => /\.(png|jpe?g|gif|webp|svg)$/.test(n) && !used.has(n));
if (unused.length) warnings.push(`ongebruikte afbeeldingen: ${unused.join(", ")}`);

console.log(`Hoofdstukken: ${chapters.length}, links: ${linkCount}, afbeeldingen: ${imageCount} (${used.size} uniek)`);
for (const w of warnings) console.log(`waarschuwing: ${w}`);
if (problems.length) {
  console.error(`\n${problems.length} probleem(en):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("check-manuals: OK");
