/**
 * Builds docs/handleiding/handleiding.pdf from the chapters (README first). Needs a headless Chrome/Chromium
 * (CHROME_BIN, google-chrome, chromium). Skips silently when no browser is installed.
 * Usage: npm run manuals:pdf
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { escapeHtml, renderMarkdown } from "../src/modules/help/markdown";

const DIR = path.join(process.cwd(), "docs", "handleiding");
const OUT = path.join(DIR, "handleiding.pdf");

function findChrome(): string | null {
  const candidates = [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.log("manuals:pdf overgeslagen: geen headless Chrome of Chromium gevonden.");
  process.exit(0);
}

const chapters = readdirSync(DIR).filter((f) => /^\d\d-.+\.md$/.test(f)).sort();
const sections: string[] = [];
const toc: string[] = [];
chapters.forEach((f, i) => {
  const r = renderMarkdown(readFileSync(path.join(DIR, f), "utf8"));
  const slug = f.replace(/\.md$/, "");
  const title = r.headings.find((h) => h.level === 1)?.text ?? slug;
  toc.push(`<li><a href="#c-${slug}">${escapeHtml(title)}</a></li>`);
  let html = r.html
    // images: file URLs so Chrome loads them from disk
    .replace(/src="\/help\/img\/([^"]+)"/g, (_m, n: string) => `src="file://${path.join(DIR, "img", n)}"`)
    // chapter links become in-document links
    .replace(/href="\/help\/([a-z0-9-]+)(#[^"]*)?"/gi, (_m, s: string, h?: string) => `href="${h ?? `#c-${s}`}"`);
  // ids must stay unique across the whole document: prefix them per chapter
  html = html.replace(/ id="([^"]+)"/g, (_m, id: string) => ` id="${slug}--${id}"`).replace(/href="#([^"]+)"/g, (m, id: string) => (id.startsWith("c-") ? m : `href="#${slug}--${id}"`));
  sections.push(`<section class="chapter${i === 0 ? " first" : ""}" id="c-${slug}">${html}</section>`);
});

const css = `
@page { size: A4; margin: 18mm 16mm; }
body { font-family: Figtree, Roboto, "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #323338; }
h1 { font-size: 22pt; margin: 0 0 10pt; } h2 { font-size: 15pt; margin: 18pt 0 6pt; border-top: 1px solid #e6e9ef; padding-top: 6pt; } h3 { font-size: 12pt; margin: 14pt 0 4pt; }
section.chapter { break-before: page; } section.first { break-before: auto; }
img { max-width: 100%; border: 1px solid #e6e9ef; border-radius: 4px; margin: 4pt 0 8pt; break-inside: avoid; }
code { background: #f0f2f8; padding: 0 3px; border-radius: 3px; font-size: 9.5pt; } pre { background: #f6f7fb; padding: 8pt; border-radius: 4px; white-space: pre-wrap; break-inside: avoid; }
table { border-collapse: collapse; margin: 6pt 0 10pt; font-size: 9.5pt; width: 100%; } th, td { border-bottom: 1px solid #e6e9ef; padding: 4pt 6pt; text-align: left; vertical-align: top; } th { background: #fafbfd; }
blockquote { border-left: 3px solid #0073ea; margin: 6pt 0; padding: 2pt 10pt; background: #f6f7fb; } a { color: #0060b9; text-decoration: none; }
.cover { padding-top: 60mm; } .cover h1 { font-size: 34pt; } .toc li { margin: 3pt 0; }
`;
const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Handleiding Weekend</title><style>${css}</style></head><body>
<section class="cover"><h1>Handleiding Weekend</h1><p>Werken in Weekend voor het team van Example.</p><h2>Inhoud</h2><ol class="toc">${toc.join("")}</ol></section>
${sections.join("\n")}</body></html>`;

const tmp = mkdtempSync(path.join(tmpdir(), "manuals-pdf-"));
const htmlFile = path.join(tmp, "handleiding.html");
writeFileSync(htmlFile, html);
const r = spawnSync(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", `--print-to-pdf=${OUT}`, `file://${htmlFile}`], { encoding: "utf8", timeout: 120_000 });
rmSync(tmp, { recursive: true, force: true });
if (r.status !== 0 || !existsSync(OUT)) {
  console.log(`manuals:pdf overgeslagen: Chrome kon de PDF niet maken (${(r.stderr || "").trim().split("\n").pop() ?? "onbekende fout"}).`);
  process.exit(0);
}
console.log(`PDF geschreven: ${path.relative(process.cwd(), OUT)} (${chapters.length} hoofdstukken)`);

