import path from "node:path";
import type { Locator, Page } from "@playwright/test";

/** Screenshots for docs/handleiding (npm run manuals). Written only when RUN_MANUALS=1. */
export const IMG = path.join(process.cwd(), "docs/handleiding/img");

export const shot = async (target: Page | Locator, name: string): Promise<void> => {
  if (!process.env.RUN_MANUALS) return;
  await target.screenshot({ path: path.join(IMG, `${name}.png`) });
};

/** Let animations and lazy content settle before a screenshot. */
export const settle = (page: Page, ms = 600) => page.waitForTimeout(ms);
