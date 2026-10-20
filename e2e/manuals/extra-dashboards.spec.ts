/** Screenshots for docs/handleiding/06-dashboards.md. Run: npm run manuals */
import path from "node:path";
import { expect, login, resetDb, test } from "../fixtures";

const IMG = path.join(process.cwd(), "docs/handleiding/img");
const shot = (name: string) => path.join(IMG, `extra-dashboard-${name}.png`);

test.describe("manual: dashboards", () => {
  test.skip(!process.env.RUN_MANUALS, "manual screenshots only run with RUN_MANUALS=1");
  test.setTimeout(180_000);
  test.beforeEach(async ({ request }) => { await resetDb(request); });

  test("dashboards", async ({ page }) => {
    await login(page, "admin");
    const req = page.context().request;
    const ws = ((await (await req.get("/api/v1/workspaces")).json()) as { id: string; name: string }[]).find((w) => w.name === "Delivery")!;
    const ids: string[] = [];
    for (const [name, rows] of [["Klanten Q4", [["Delta", "Done", 12], ["Alpha", "Working on it", 8]]], ["Projecten Q4", [["Website", "Stuck", 30], ["Portaal", "Done", 22], ["App", "Working on it", 14]]]] as const) {
      const b = (await (await req.post("/api/v1/boards", { data: { workspaceId: ws.id, name } })).json()) as { id: string };
      ids.push(b.id);
      await req.post(`/api/v1/boards/${b.id}/columns`, { data: { title: "Uren", type: "numbers" } });
      for (const [n, status, hours] of rows) await req.post("/api/v1/items", { data: { boardId: b.id, name: n, values: { status, numbers: hours } } });
    }
    await page.goto("/dashboards");
    await expect(async () => {
      await page.getByTestId("new-dashboard").click();
      await expect(page.getByTestId("dashboard-name-input")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 60_000 });
    await page.locator(`input[data-testid="dashboard-name-input"], [data-testid="dashboard-name-input"] input`).first().fill("Delivery overzicht");
    await page.getByTestId("pick-board-Klanten Q4").check();
    await page.getByTestId("pick-board-Projecten Q4").check();
    await page.screenshot({ path: shot("boards-kiezen") });
    await page.getByRole("button", { name: "Dashboard maken" }).click();
    await expect(page.getByTestId("dashboard-page")).toBeVisible();

    await page.getByTestId("add-widget").click();
    await expect(page.getByTestId("widget-gallery")).toBeVisible();
    await page.screenshot({ path: shot("widget-galerij") });
    await page.getByTestId("gallery-chart").click();
    await expect(page.getByTestId("widget-preview").getByTestId("chart-widget")).toBeVisible();
    await page.screenshot({ path: shot("chart-instellingen") });
    await page.getByTestId("widget-save").click();

    const d = (await (await req.get("/api/v1/dashboards")).json()) as { id: string }[];
    const dash = d[0].id;
    const numCol = (await (await req.get(`/api/v1/dashboards/${dash}/columns`)).json()) as { columns: { id: string; title: string }[] };
    const uren = numCol.columns.find((c) => c.title === "Uren")!.id;
    await req.post(`/api/v1/dashboards/${dash}/widgets`, { data: { type: "numbers", title: "Totaal uren", settings: { metrics: [{ label: "Totaal uren", aggregation: "sum", columnId: uren }] } } });
    await req.post(`/api/v1/dashboards/${dash}/widgets`, { data: { type: "battery", title: "Voortgang" } });
    await req.post(`/api/v1/dashboards/${dash}/widgets`, { data: { type: "workload" } });
    await page.reload();
    await expect(page.getByTestId("widget")).toHaveCount(4);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot("overzicht") });
  });
});
