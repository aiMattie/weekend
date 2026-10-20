import { boardIdByName, collectConsoleErrors, login, newUserPage, resetDb, test } from "../fixtures";
import { expect, go } from "./helpers";

test.beforeEach(async ({ request }, info) => { info.setTimeout(300_000); await resetDb(request); });

test("deleting a board writes an audit entry that shows up in the admin center", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await login(page, "admin");
  const created = await page.request.post("/api/v1/boards", { data: { workspaceId: (await (await page.request.get("/api/v1/workspaces")).json())[0].id, name: "Wegwerpbord" } });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  expect((await page.request.delete(`/api/v1/boards/${id}`)).status()).toBe(204);

  await go(page, "/admin/audit");
  const row = page.getByTestId("audit-row").filter({ hasText: "board.deleted" }).filter({ hasText: "Wegwerpbord" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Admin User");

  // search + category filter
  await page.getByTestId("audit-search").fill("Wegwerpbord");
  await page.getByTestId("audit-apply").click();
  await expect(page.getByTestId("audit-row")).toHaveCount(1);
  await go(page, "/admin/audit?category=auth");
  await expect(page.getByTestId("audit-row").filter({ hasText: "board.deleted" })).toHaveCount(0);

  // JSON API (SIEM) and CSV export
  const json = await (await page.request.get("/api/v1/audit-log?event=board.deleted&limit=10")).json();
  expect(json.rows[0]).toMatchObject({ event: "board.deleted", targetName: "Wegwerpbord", targetId: id });
  const csv = await page.request.get("/api/v1/audit-log/export?event=board.deleted");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Wegwerpbord");
  expect(errors, errors.join("\n")).toEqual([]);
});

test("logins and permission changes are logged; members cannot read the log", async ({ page, browser, baseURL }) => {
  await login(page, "admin");
  const dev1 = await newUserPage(browser, baseURL, "dev1");
  expect((await dev1.page.request.get("/api/v1/audit-log")).status()).toBe(403);
  const klanten = await boardIdByName(page.context().request, "Klanten");
  await page.request.patch(`/api/v1/admin/permissions/boards/${klanten}`, { data: { level: "view_only" } });
  const rows = (await (await page.request.get("/api/v1/audit-log?limit=100")).json()).rows as { event: string; actorName: string }[];
  expect(rows.map((r) => r.event)).toEqual(expect.arrayContaining(["user.login", "permission.board_changed"]));
  expect(rows.filter((r) => r.event === "user.login").map((r) => r.actorName)).toEqual(expect.arrayContaining(["Admin User", "Builder"]));
  await dev1.context.close();
});
