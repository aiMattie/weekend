import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { collectConsoleErrors, expect, login, resetDb, test } from "./fixtures";

/** The in-app handleiding at /help (docs/handleiding/*.md rendered with images, TOC and search). */
const DIR = path.join(process.cwd(), "docs", "handleiding");
const chapters = readdirSync(DIR).filter((f) => /^\d\d-.+\.md$/.test(f)).sort().map((f) => f.replace(/\.md$/, ""));
const titleOf = (slug: string) => /^#\s+(.+)$/m.exec(readFileSync(path.join(DIR, `${slug}.md`), "utf8"))![1].replace(/[`*]/g, "").trim();

test.describe("help: handleiding in the app", () => {
  test.setTimeout(240_000);
  test.beforeEach(async ({ request, page }) => {
    await resetDb(request);
    await login(page, "admin");
  });

  test("top bar help icon opens /help with the table of contents and every chapter listed", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");
    await expect(page.getByTestId("topbar")).toBeVisible();
    await page.getByTestId("topbar-help").click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByTestId("help-page")).toBeVisible();
    await expect(page.getByTestId("help-readme")).toContainText("Handleiding");
    await expect(page.getByTestId("help-chapters").locator("li")).toHaveCount(chapters.length);
    for (const slug of chapters) await expect(page.getByTestId(`help-chapter-${slug}`)).toHaveText(titleOf(slug));
    expect(errors).toEqual([]);
  });

  test("TOC navigation: chapter opens, heading links scroll, previous/next work, unknown chapter is a 404", async ({ page }) => {
    await page.goto("/help");
    await page.getByTestId(`help-chapter-${chapters[1]}`).click();
    await expect(page).toHaveURL(new RegExp(`/help/${chapters[1]}$`));
    await expect(page.getByTestId("help-chapter").locator("h1")).toHaveText(titleOf(chapters[1]));
    await expect(page.getByTestId(`help-chapter-${chapters[1]}`)).toHaveAttribute("aria-current", "page");
    // the sidebar lists the H2 headings of the open chapter; a click goes to the anchor
    const sub = page.getByTestId("help-toc").locator('a[href^="/help/' + chapters[1] + '#"]').first();
    const href = (await sub.getAttribute("href"))!;
    await sub.click();
    await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`));
    // previous / next
    await page.getByTestId("help-next").click();
    await expect(page).toHaveURL(new RegExp(`/help/${chapters[2]}$`));
    await page.getByTestId("help-prev").click();
    await expect(page).toHaveURL(new RegExp(`/help/${chapters[1]}$`));
    const res = await page.goto("/help/bestaat-niet");
    expect(res?.status()).toBe(404);
  });

  test("search filters chapters and headings, and shows a message without results", async ({ page }) => {
    await page.goto("/help");
    const search = page.getByTestId("help-search").locator("input");
    await search.fill("sprint");
    await expect(page.getByTestId("help-results")).toBeVisible();
    await expect(page.getByTestId("help-results").locator(`a[href="/help/08-dev-sprints"]`).first()).toBeVisible();
    await expect(page.getByTestId("help-chapters")).toHaveCount(0);
    expect(await page.getByTestId("help-results").locator("a").count()).toBeLessThan(chapters.length + 60);
    await search.fill("zzzqqqxxx");
    await expect(page.getByTestId("help-no-results")).toBeVisible();
    await search.fill("");
    await expect(page.getByTestId("help-chapters").locator("li")).toHaveCount(chapters.length);
    // a result links to the heading
    await search.fill("Complete sprint");
    const hit = page.getByTestId("help-result-heading").first();
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(page).toHaveURL(/\/help\/08-dev-sprints#/);
  });

  test("every chapter renders without errors and all its images load (screenshots come from npm run manuals)", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const failed: string[] = [];
    page.on("response", (r) => { if (r.url().includes("/help/img/") && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
    for (const slug of chapters) {
      await page.goto(`/help/${slug}`);
      await expect(page.getByTestId("help-chapter").locator("h1")).toBeVisible();
      const imgs = page.getByTestId("help-chapter").locator("img");
      const n = await imgs.count();
      for (let i = 0; i < n; i++) {
        await imgs.nth(i).scrollIntoViewIfNeeded();
        await expect.poll(() => imgs.nth(i).evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth), { message: `${slug}: image ${i} ${await imgs.nth(i).getAttribute("src")}` }).toBeGreaterThan(0);
      }
    }
    expect(failed).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("links between chapters resolve to existing chapters", async ({ page }) => {
    const bad: string[] = [];
    for (const slug of chapters) {
      await page.goto(`/help/${slug}`);
      const hrefs = await page.getByTestId("help-chapter").locator('a[href^="/help"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
      for (const href of new Set(hrefs)) {
        const [p, hash] = href.split("#");
        const r = await page.request.get(p);
        if (r.status() !== 200) bad.push(`${slug}: ${href} -> ${r.status()}`);
        else if (hash && !(await r.text()).includes(`id="${hash}"`)) bad.push(`${slug}: ${href} -> anker ontbreekt`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("images need a login", async ({ browser, baseURL }) => {
    const anon = await browser.newContext({ baseURL: baseURL!, locale: "nl-NL" });
    const r = await anon.request.get("/help/img/does-not-matter.png");
    expect(r.status()).toBe(401);
    await anon.close();
  });
});
