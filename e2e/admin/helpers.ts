import { expect as baseExpect, type Page } from "@playwright/test";

/** expect with a longer timeout: the dev server compiles on first use and the machine is shared. */
export const expect = baseExpect.configure({ timeout: 45_000 });

/** Navigate and wait until the (client) page is hydrated; the dev server can be slow on first compile. */
export async function go(page: Page, path: string): Promise<void> {
  await page.goto(path, { timeout: 180_000 });
  await baseExpect(page.getByTestId("admin-ready")).toBeAttached({ timeout: 180_000 });
}
