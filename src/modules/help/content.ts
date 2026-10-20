import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { renderMarkdown, stripInline, type Heading } from "./markdown";

/** The manual lives in docs/handleiding and is read at run time (no copy step, images are served by /help/img/[name]). */
export const MANUAL_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "docs", "handleiding");

export interface Chapter {
  slug: string;
  /** first H1 of the file */
  title: string;
  /** H2 and H3 headings, for the sidebar and the search box */
  headings: Heading[];
  html: string;
  /** plain intro (first paragraph) for the index page */
  summary: string;
}

export interface ChapterIndexEntry { slug: string; title: string; headings: { id: string; text: string; level: number }[] }

const CHAPTER_FILE = /^(\d\d)-.+\.md$/;

export function listChapterFiles(dir = MANUAL_DIR): string[] {
  try {
    return readdirSync(/*turbopackIgnore: true*/ dir).filter((f) => CHAPTER_FILE.test(f)).sort();
  } catch {
    return [];
  }
}

export function loadChapter(slug: string, dir = MANUAL_DIR): Chapter | null {
  if (!/^[a-z0-9-]+$/i.test(slug)) return null;
  const file = path.join(dir, `${slug}.md`);
  let src: string;
  try { src = readFileSync(/*turbopackIgnore: true*/ file, "utf8"); } catch { return null; }
  const r = renderMarkdown(src);
  const h1 = r.headings.find((h) => h.level === 1);
  const para = src.split("\n").find((l) => l.trim() && !l.startsWith("#") && !l.startsWith("<!--") && !l.startsWith(">") && !l.startsWith("!") && !l.startsWith("|") && !/^\s*([-*]|\d+\.)\s/.test(l));
  return {
    slug,
    title: h1 ? h1.text : slug,
    headings: r.headings.filter((h) => h.level === 2 || h.level === 3),
    html: r.html,
    summary: para ? stripInline(para).slice(0, 220) : "",
  };
}

export function loadIndex(dir = MANUAL_DIR): ChapterIndexEntry[] {
  return listChapterFiles(dir).map((f) => {
    const c = loadChapter(f.replace(/\.md$/, ""), dir);
    return c ? { slug: c.slug, title: c.title, headings: c.headings.map((h) => ({ id: h.id, text: h.text, level: h.level })) } : null;
  }).filter((c): c is ChapterIndexEntry => !!c);
}

export function loadReadme(dir = MANUAL_DIR): { html: string; title: string } {
  try {
    const src = readFileSync(/*turbopackIgnore: true*/ path.join(dir, "README.md"), "utf8");
    const r = renderMarkdown(src);
    return { html: r.html, title: r.headings.find((h) => h.level === 1)?.text ?? "Handleiding" };
  } catch {
    return { html: "<p>De handleiding is niet gevonden.</p>", title: "Handleiding" };
  }
}

/** Absolute path of a screenshot, or null. Only plain file names inside docs/handleiding/img are allowed. */
export function imagePath(name: string, dir = MANUAL_DIR): string | null {
  if (!/^[A-Za-z0-9._-]+\.(png|jpg|jpeg|gif|webp|svg)$/.test(name) || name.includes("..")) return null;
  const p = path.join(dir, "img", name);
  try { return statSync(/*turbopackIgnore: true*/ p).isFile() ? p : null; } catch { return null; }
}
