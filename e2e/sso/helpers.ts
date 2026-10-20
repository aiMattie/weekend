import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "../fixtures";
import { MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, startMockGoogle, type MockGoogle } from "./mock-google";

/** (Re)point the running app (E2E_RESET=1 server) at the mock IdP. */
export const pointAtMock = (request: APIRequestContext, mock: MockGoogle, appUrl: string) =>
  request.post("/api/test/google", { data: { clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET, oauthBase: mock.url, appUrl, resetRateLimits: true } });

/** Start the mock IdP and point the app at it. Returns null when the server refuses (no E2E_RESET). */
export async function useMockGoogle(request: APIRequestContext, appUrl: string): Promise<MockGoogle | null> {
  const mock = await startMockGoogle();
  const r = await pointAtMock(request, mock, appUrl);
  if (!r.ok()) { await mock.close(); return null; }
  return mock;
}
/** No credentials at all (even when the server has real ones in its environment). */
export const googleOff = (request: APIRequestContext) => request.post("/api/test/google", { data: { clientId: "", clientSecret: "" } });
export const googleReset = (request: APIRequestContext) => request.post("/api/test/google", { data: { reset: true } });

export async function putSso(request: APIRequestContext, body: Record<string, unknown>): Promise<void> {
  const r = await request.put("/api/v1/admin/sso", { data: body });
  expect(r.ok(), await r.text()).toBeTruthy();
}

/** Click "Inloggen met Google" on /login and wait until the app (or an error) is shown. */
export async function clickGoogle(page: Page): Promise<void> {
  await page.goto("/login");
  await expect(page.getByTestId("login-google")).toBeVisible();
  await page.getByTestId("login-google").click();
}

/** Vibe Toggle hides its input: click it through the DOM. */
export const toggle = (page: Page, testId: string) => page.getByTestId(testId).evaluate((el: HTMLElement) => el.click());
