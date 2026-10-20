import type { Page } from "@playwright/test";

/** Manual screenshots are only written when RUN_MANUALS=1 (so normal test runs do not touch docs/). */
export async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}): Promise<void> {
  if (!process.env.RUN_MANUALS) return;
  await page.screenshot({ path: `docs/handleiding/img/migration-${name}.png`, fullPage: opts.fullPage ?? false });
}
