import { collectConsoleErrors, login, resetDb, test } from "../fixtures";
import { expect, sprintSection, viewTab, addKlanten, createDev, createTask, drag, setValues, warm, type DevIds } from "./helpers";

test.describe("sprint flow (Weekend dev)", () => {
  let ids: DevIds;
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("create sprint, plan tasks, start, move statuses, complete with carry-over, burndown and velocity", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const api = page.request;
    ids = await createDev(api);
    await warm(api, ids);
    await addKlanten(api, ids, ["Delta", "LMS"]);
    await createTask(api, ids, "Taak A login", { schatting: 5, klant: "Delta", prioriteit: "P1", type: "Feature" });
    const b = await createTask(api, ids, "Taak B rechten", { schatting: 3, klant: "Delta", prioriteit: "P2" });
    const c = await createTask(api, ids, "Taak C import", { schatting: 2, klant: "LMS", prioriteit: "P2" });
    await createTask(api, ids, "Taak D export", { schatting: 8, klant: "LMS", status: "Backlog" });

    // 1. two sprints through the UI
    await page.goto(`/boards/${ids.boards.sprints}`);
    await expect(page.getByTestId("planning-view")).toBeVisible();
    await page.getByTestId("create-sprint").click();
    await expect(page.getByTestId("sprint-section")).toHaveCount(1);
    await page.getByTestId("create-sprint").click();
    await expect(page.getByTestId("sprint-section")).toHaveCount(2);
    const s1 = page.locator("[data-testid=sprint-section][data-sprint-name='Sprint 1']");
    const s2 = page.locator("[data-testid=sprint-section][data-sprint-name='Sprint 2']");
    await expect(s1).toBeVisible();
    await expect(s2).toBeVisible();
    await expect(s1.getByTestId("sprint-state")).toHaveText("Gepland");

    // 2. backlog shows the four tasks; drag three into sprint 1
    await expect(page.getByTestId("dev-task")).toHaveCount(4);
    for (const name of ["Taak A login", "Taak B rechten", "Taak C import"]) {
      await drag(page, page.locator(`[data-testid=dev-task][data-task-name='${name}'] [data-testid=dev-task-handle]`), s1);
    }
    await expect(s1.getByTestId("sprint-counts")).toContainText("3 taken, 10u", { timeout: 20_000 });
    await expect(page.getByTestId("backlog-counts")).toContainText("1 taken, 8u");

    // 3. start sprint 1
    await s1.getByTestId("start-sprint").click();
    await expect(s1.getByTestId("sprint-state")).toHaveText("Actief");
    await expect(s2.getByTestId("start-sprint")).toBeVisible();

    // 4. move statuses: drag A to Done on the active sprint board, B to In progress through the API
    await viewTab(page, "dev_sprint_board").click();
    await expect(page.getByTestId("sprint-card")).toHaveCount(3);
    // swimlanes per client (default grouping), no epic sub-lanes because no task has an epic
    await expect(page.getByTestId("sprint-swimlane")).toHaveCount(2);
    await expect(page.getByTestId("sprint-swimlane-epic")).toHaveCount(0);
    const delta = page.locator("[data-testid=sprint-swimlane][data-title='Delta']");
    await expect(delta.getByTestId("sprint-card")).toHaveCount(2);
    await drag(page, delta.locator("[data-testid=sprint-card][data-task-name='Taak A login']"), delta.locator("[data-testid=sprint-lane][data-status='Done']"));
    await expect(page.locator("[data-testid=sprint-lane][data-status='Done'] [data-testid=sprint-card]")).toHaveCount(1, { timeout: 20_000 });
    await setValues(api, b, { status: "In progress" });
    await expect(page.locator("[data-testid=sprint-lane][data-status='In progress'] [data-testid=sprint-card]")).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByTestId("sprint-progress")).toContainText("1 van 3");

    // 5. complete sprint: unfinished work (B, C) goes to sprint 2
    await viewTab(page, "dev_planning").click();
    await s1.getByTestId("complete-sprint").click();
    await expect(page.getByTestId("complete-sprint-dialog")).toBeVisible();
    await expect(page.getByTestId("complete-summary")).toContainText("1 van 3 taken zijn afgerond, 2 taken zijn nog open");
    await page.getByTestId("carry-next-select").selectOption({ label: "Sprint 2" });
    await page.getByTestId("complete-sprint-confirm").click();
    await expect(page.getByTestId("complete-sprint-dialog")).toBeHidden();
    await expect(page.locator("[data-testid=sprint-section][data-sprint-name='Sprint 1']")).toHaveCount(0); // completed sprints leave the planning
    await expect(s2.getByTestId("sprint-counts")).toContainText("2 taken, 5u", { timeout: 20_000 });
    await expect(sprintSection(page, "Sprint 2").locator("[data-testid=dev-task]")).toHaveCount(2);

    // the Sprint column on the task board shows where the work is
    const cs = await (await api.get(`/api/v1/boards/${ids.boards.taken}/full`)).json();
    const sprintCol = cs.columns.find((x: { key: string }) => x.key === "sprint").id;
    const byName = (n: string) => cs.items.find((i: { name: string }) => i.name === n).values[sprintCol]?.name;
    expect(byName("Taak A login")).toBe("Sprint 1");
    expect(byName("Taak B rechten")).toBe("Sprint 2");
    expect(byName("Taak C import")).toBe("Sprint 2");
    expect(byName("Taak D export")).toBeUndefined();
    void c;

    // 6. dashboard: burndown + velocity of the completed sprint, per-klant filter
    await viewTab(page, "dev_dashboard").click();
    await expect(page.getByTestId("dashboard-view")).toBeVisible();
    await page.getByTestId("dash-sprint").selectOption({ label: "Sprint 1 (Afgerond)" });
    await expect(page.getByTestId("tile-tasks")).toHaveText("1 / 3");
    await expect(page.getByTestId("tile-points")).toHaveText("5 / 10u");
    await expect(page.locator("[data-testid=chart-burndown] .recharts-line-curve").first()).toBeVisible();
    await expect(page.locator("[data-testid=chart-velocity] .recharts-bar-rectangle").first()).toBeVisible();
    await expect(page.getByTestId("tile-velocity")).toHaveText("5u");
    await page.getByTestId("dash-klant").selectOption("Delta");
    await expect(page.getByTestId("tile-tasks")).toHaveText("1 / 2");
    await expect(page.getByTestId("tile-points")).toHaveText("5 / 8u");
    await page.getByTestId("dash-klant").selectOption("");
    await page.getByTestId("dash-unit").selectOption("count");
    await expect(page.getByTestId("tile-velocity")).toHaveText("1");
    await expect(page.getByTestId("standup-text")).toContainText("Daily standup");

    // 7. API: velocity + summary
    const vel = await (await api.get(`/api/v1/dev/boards/${ids.boards.sprints}/velocity`)).json();
    expect(vel.sprints).toHaveLength(1);
    expect(vel.sprints[0]).toMatchObject({ name: "Sprint 1", committed: 10, completed: 5, carried: 5 });
    expect(errors).toEqual([]);
  });

  test("complete sprint can send unfinished work back to the backlog", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, "admin");
    const api = page.request;
    ids = await createDev(api);
    await warm(api, ids);
    const a = await createTask(api, ids, "Alleen taak", { schatting: 4 });
    const sp = await (await api.post(`/api/v1/dev/boards/${ids.boards.sprints}/sprints`, { data: {} })).json();
    expect((await api.put(`/api/v1/dev/items/${a}/sprint`, { data: { sprintId: sp.id } })).ok()).toBeTruthy();
    expect((await api.post(`/api/v1/dev/sprints/${sp.id}/start`)).ok()).toBeTruthy();
    // a second start is refused while a sprint is active
    const sp2 = await (await api.post(`/api/v1/dev/boards/${ids.boards.sprints}/sprints`, { data: {} })).json();
    expect((await api.post(`/api/v1/dev/sprints/${sp2.id}/start`)).status()).toBe(409);

    await page.goto(`/boards/${ids.boards.sprints}`);
    await page.locator(`[data-sprint-id='${sp.id}'] [data-testid=complete-sprint]`).click();
    await page.getByTestId("carry-backlog").check();
    await page.getByTestId("complete-sprint-confirm").click();
    await expect(page.getByTestId("complete-sprint-dialog")).toBeHidden();
    await expect(page.getByTestId("backlog-counts")).toContainText("1 taken, 4u", { timeout: 20_000 });
    const backlogTask = page.locator("[data-testid=backlog-section] ~ [data-testid=dev-task]");
    void backlogTask;
    await expect(page.locator("[data-testid=dev-task][data-task-name='Alleen taak']")).toBeVisible();
  });
});
