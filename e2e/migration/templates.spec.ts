import { collectConsoleErrors, expect, login, openBoard, resetDb, test } from "../fixtures";
import type { APIRequestContext } from "@playwright/test";
import { shot } from "./shots";

type Board = { id: string; name: string; workspaceId: string };
const boards = async (r: APIRequestContext): Promise<Board[]> => (await r.get("/api/v1/boards")).json();
const post = async (r: APIRequestContext, url: string, data: unknown) => { const res = await r.post(url, { data }); expect(res.ok(), `${url} ${res.status()}`).toBeTruthy(); return res.json(); };

test.describe("templates (workspace structure + client workspace)", () => {
  test.describe.configure({ timeout: 240_000 });
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("admin builds the workspace structure and a client workspace from the UI", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    await page.goto("/admin/import");
    await expect(page.getByTestId("template-panel")).toBeVisible();
    await page.getByTestId("template-all").click();
    await expect(page.getByTestId("template-result")).toContainText("Sjablonen staan klaar", { timeout: 90_000 });
    const req = page.context().request;
    let all = await boards(req);
    for (const n of ["Klanten", "Projecten & Fases", "Urenregistratie", "Klant overstap checklist", "Taken", "Epics", "Sprints"]) expect(all.map((b) => b.name), n).toContain(n);

    await page.getByTestId("template-klant").fill("E2E Klant BV");
    await page.getByTestId("template-client").click();
    await expect(page.getByTestId("template-result")).toContainText("Klant-workspace is aangemaakt", { timeout: 60_000 });
    all = await boards(req);
    const client = all.filter((b) => b.workspaceId === all.find((x) => x.name === "Kickoff & Roadmap" && x.workspaceId !== all.find((y) => y.name === "Klanten")!.workspaceId)!.workspaceId);
    expect(client.length).toBeGreaterThanOrEqual(6);
    // again: no duplicates
    await page.getByTestId("template-client").click();
    await expect(page.getByTestId("template-result")).toContainText("bestond al", { timeout: 60_000 });
    expect((await boards(req)).length).toBe(all.length);
    await shot(page, "sjablonen");

    // the klant workspace is reachable and its boards open
    const kickoff = all.filter((b) => b.name === "Kickoff & Roadmap");
    await page.goto(`/boards/${kickoff[kickoff.length - 1].id}`);
    await expect(page.getByTestId("board-page")).toBeVisible();
    await expect(page.getByTestId("board-title")).toContainText("Kickoff & Roadmap");
    await shot(page, "klant-workspace");
    expect(errors).toEqual([]);
  });

  test("hours roll up per fase through connect boards, mirror and formula", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, "admin");
    const req = page.context().request;
    await post(req, "/api/v1/admin/templates", { action: "all" });
    const byName = async (n: string) => (await boards(req)).find((b) => b.name === n)!.id;
    const [klanten, fases, uren] = [await byName("Klanten"), await byName("Projecten & Fases"), await byName("Urenregistratie")];
    const klant = await post(req, "/api/v1/items", { boardId: klanten, name: "Roll-up Klant" });
    const fase = await post(req, "/api/v1/items", { boardId: fases, name: "Roll-up Fase", values: { klant: [klant.id], uren_dev: 100, uren_pm: 0 } });
    await post(req, "/api/v1/items", { boardId: uren, name: "Dag 1", values: { klant: [klant.id], fase: [fase.id], uren_dev: 30 } });
    await post(req, "/api/v1/items", { boardId: uren, name: "Dag 2", values: { klant: [klant.id], fase: [fase.id], uren_dev: 52 } });

    await openBoard(page, "Projecten & Fases");
    const row = page.locator('[data-testid="item-row"][data-item-name="Roll-up Fase"]');
    await expect(row).toBeVisible();
    await expect(row.getByTestId("cell-uren_dev_besteed")).toContainText("82");
    await expect(row.getByTestId("cell-restant_dev")).toContainText("18");
    await expect(row.getByTestId("cell-budget_pct")).toContainText("82");
    await expect(row.getByTestId("cell-budget_waarschuwing")).toContainText("80%");
    await shot(page, "uren-rollup");
    expect(errors).toEqual([]);
  });
});
