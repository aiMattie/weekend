/**
 * Fixtures for the automations specs: same as ../fixtures but with generous timeouts, because the
 * Next dev server compiles every route on first use (minutes on a loaded machine).
 */
import { expect as baseExpect, test as base } from "@playwright/test";

export { collectConsoleErrors, login, resetDb } from "../fixtures";
export const expect = baseExpect.configure({ timeout: 60_000 });
export const test = base.extend({});
test.beforeEach(({}, testInfo) => { testInfo.setTimeout(900_000); });
test.use({ actionTimeout: 60_000, navigationTimeout: 300_000 });
