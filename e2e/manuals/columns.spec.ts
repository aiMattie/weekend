import { collectConsoleErrors, expect, login, openBoard, resetDb, test } from "../fixtures";
import { addColumnViaCenter, cellOf, gotoBoard, makeBoard } from "../columns/helpers";
import { settle, shot } from "./shots";

/** Screenshots for docs/handleiding/02-columns.md (npm run manuals). */
test.skip(!process.env.RUN_MANUALS, "manual screenshots only run with RUN_MANUALS=1");
test.use({ actionTimeout: 20_000, navigationTimeout: 60_000 }); // fail fast: a hanging step must not block the shared e2e lock

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test("handleiding columns: screenshots", async ({ page, request }) => {
  test.setTimeout(600_000);
  const errors = collectConsoleErrors(page);
  await resetDb(request);
  await login(page, "admin");
  const req = page.context().request;

  // Column center on Klanten
  await openBoard(page, "Klanten");
  await page.getByTestId("add-column").first().click();
  await expect(page.getByTestId("column-center")).toBeVisible();
  await settle(page, 400);
  await shot(page, "columns-column-center");
  await page.keyboard.press("Escape");

  // Connect boards item picker (Klanten <-> Projecten & Fases)
  const header = page.getByTestId("col-header-projecten_fases").first();
  await header.hover();
  await header.getByTestId("column-menu").click();
  await page.getByTestId("column-settings-open").click();
  await page.getByTestId("relation-board-Projecten & Fases").check();
  await page.getByTestId("relation-pairing").selectOption({ label: 'Koppel aan bestaande kolom "Klant"' });
  await page.getByRole("button", { name: "Opslaan" }).click();
  await expect(page.getByTestId("column-settings")).toHaveCount(0);
  const row = (name: string) => page.locator(`[data-testid="item-row"][data-item-name="${name}"]`);
  await row("Delta").getByTestId("cell-projecten_fases").click();
  await expect(page.getByTestId("item-picker")).toBeVisible();
  await page.getByTestId("item-picker-search").fill("Delta");
  await page.locator('[data-testid="item-picker-option"][data-item-name="Delta - Fase 1: MVP"]').click();
  await page.getByTestId("item-picker-search").fill("");
  await settle(page, 400);
  await shot(page, "columns-connect-boards");
  await page.getByTestId("item-picker-search").fill("LMS");
  await page.locator('[data-testid="item-picker-option"][data-item-name="LMS - Doorontwikkeling"]').click();
  await page.keyboard.press("Escape");

  // Mirror with a sum
  await page.getByTestId("add-column").first().click();
  await page.getByTestId("add-column-mirror").click();
  await page.getByTestId("column-title-input").fill("Uren dev");
  await page.getByTestId("mirror-relation").selectOption({ label: "Projecten & fases" });
  await page.getByTestId("mirror-target").selectOption({ label: "Uren begroot dev" });
  await page.getByTestId("mirror-aggregate").selectOption("sum");
  await page.getByRole("button", { name: "Kolom maken" }).click();
  await expect(row("Delta").getByTestId("cell-mirror").getByTestId("mirror-cell")).toHaveText("520u");
  await settle(page);
  await shot(page, "columns-mirror");

  // Several value types on a fresh board
  const { boardId } = await makeBoard(req, "Kolomtypes", ["Eerste item", "Tweede item"]);
  await gotoBoard(page, boardId);
  await addColumnViaCenter(page, "timeline");
  await cellOf(page, "timeline").click();
  await page.getByTestId("timeline-from").fill("2026-10-05");
  await page.getByTestId("timeline-to").fill("2026-10-09");
  await page.getByTestId("timeline-save").click();
  await addColumnViaCenter(page, "rating");
  await cellOf(page, "rating").getByTestId("rating-4").click();
  await addColumnViaCenter(page, "tags");
  await cellOf(page, "tags").click();
  await page.getByTestId("tags-search").fill("Urgent");
  await page.getByTestId("tags-search").press("Enter");
  await page.keyboard.press("Escape");
  await addColumnViaCenter(page, "country");
  await cellOf(page, "country").click();
  await page.getByTestId("country-search").fill("Nederland");
  await page.getByTestId("country-option-NL").click();
  await addColumnViaCenter(page, "vote");
  await cellOf(page, "vote").getByTestId("vote-button").click();
  await page.keyboard.press("Escape");
  await page.getByTestId("sidebar-collapse").click(); // more room for the columns
  await settle(page);
  await shot(page, "columns-waarden");

  // Files cell
  await addColumnViaCenter(page, "file");
  await cellOf(page, "file").click();
  await expect(page.getByTestId("file-editor")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles([
    { name: "notities.txt", mimeType: "text/plain", buffer: Buffer.from("hallo wereld") },
    { name: "logo.png", mimeType: "image/png", buffer: PNG },
  ]);
  await expect(page.getByTestId("file-row")).toHaveCount(2);
  await settle(page, 400);
  await shot(page, "columns-bestanden");
  await page.keyboard.press("Escape");

  // Label editor
  const status = await addColumnViaCenter(page, "status");
  await status.hover();
  await status.getByTestId("column-menu").click();
  await page.getByTestId("column-edit-labels").click();
  await expect(page.getByTestId("label-editor")).toBeVisible();
  await page.getByTestId("label-row").first().getByTestId("label-color-btn").click();
  await settle(page, 400);
  await shot(page, "columns-labels");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Annuleren" }).click({ timeout: 2000 }).catch(() => undefined);

  // Formula
  await page.goto(`/boards/${boardId}`);
  for (const [title, key] of [["Uren", "uren"], ["Tarief", "tarief"]]) await req.post(`/api/v1/boards/${boardId}/columns`, { data: { title, type: "numbers", key } });
  await page.reload();
  await expect(page.getByTestId("board-page")).toBeVisible();
  await page.getByTestId("add-column").first().click();
  await page.getByTestId("add-column-formula").click();
  await page.getByTestId("column-title-input").fill("Bedrag");
  await page.getByTestId("formula-input").fill("{Uren} * {Tarief}");
  await settle(page, 400);
  await shot(page, "columns-formule");
  await page.getByRole("button", { name: "Kolom maken" }).click();

  // Column menu on the numbers column
  const uren = page.getByTestId("col-header-uren");
  await uren.hover();
  await uren.getByTestId("column-menu").click();
  await settle(page, 400);
  await shot(page, "columns-kolommenu");
  expect(errors).toEqual([]);
});
