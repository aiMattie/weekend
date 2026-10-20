import path from "node:path";
import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";
import { addColumn, aiReset, makeBoard, useMockProvider } from "../ai/helpers";
import type { MockAnthropic } from "../ai/mock-anthropic";

/** Screenshots for docs/handleiding/13-ai-sidekick-en-agents.md (RUN_MANUALS=1 npm run manuals). Uses the local mock of the Anthropic API. */
const IMG = path.join(process.cwd(), "docs/handleiding/img");
const shot = (page: import("@playwright/test").Page, name: string) => page.screenshot({ path: path.join(IMG, `ai-${name}.png`) });

test.skip(!process.env.RUN_MANUALS, "manual screenshots only run with RUN_MANUALS=1");

let mock: MockAnthropic | null = null;
test.afterAll(async ({ request }) => { await aiReset(request).catch(() => undefined); await mock?.close(); });

test("handleiding ai: screenshots", async ({ page, request }) => {
  test.setTimeout(600_000);
  const errors = collectConsoleErrors(page);
  mock = await useMockProvider(request);
  test.skip(!mock, "needs E2E_RESET=1 on the server");
  const seed = await resetDb(request);
  await login(page, "admin");
  const ws = seed.workspaceIds;

  // Sidekick panel on a board
  const b = await makeBoard(page.request, ws["Delivery"], "Klantprojecten", ["Offerte versturen", "Contract controleren", "Kick-off plannen"]);
  await page.goto(`/boards/${b.id}`);
  await expect(page.getByTestId("board-page")).toBeVisible();
  await page.getByTestId("rail-sidekick-rail").click();
  await page.getByTestId("ai-input").fill("Wat staat er op dit board?");
  await page.getByTestId("ai-send").click();
  await expect(page.getByTestId("ai-msg-assistant").last()).toContainText("Contract controleren");
  await shot(page, "sidekick-panel");
  // confirmation card
  await page.getByTestId("ai-input").fill("maak item Offerte versturen naar Bravo");
  await page.getByTestId("ai-send").click();
  await expect(page.getByTestId("ai-action-card")).toBeVisible();
  await shot(page, "sidekick-confirm");
  await page.getByTestId("ai-confirm").click();
  await expect(page.getByTestId("ai-action-done")).toBeVisible();
  await page.getByTestId("sidekick-close").click();

  // Weekend magic
  await page.goto("/sidekick");
  await page.getByTestId("sk-magic").click();
  await page.getByTestId("magic-description").fill("Een recruitment pipeline van sollicitatie tot contract, met fases, recruiter en startdatum");
  await page.getByTestId("magic-generate").click();
  await expect(page.getByTestId("magic-preview")).toBeVisible();
  await shot(page, "magic-preview");
  await page.getByTestId("magic-create").click();
  await expect(page.getByTestId("magic-done")).toBeVisible();

  // AI block in the builder and AI autofill in the column menu
  const kb = await makeBoard(page.request, ws["Delivery"], "Klachten", ["App crasht", "Vraag over facturen"]);
  const klacht = await addColumn(page.request, kb.id, { title: "Klacht", type: "long_text" });
  const cat = await addColumn(page.request, kb.id, { title: "Categorie", type: "status", settings: { labels: [{ id: 0, index: 0, text: "Vraag", color: "#579bfc" }, { id: 1, index: 1, text: "Bug", color: "#df2f4a" }, { id: 2, index: 2, text: "Feature", color: "#00c875" }] } });
  void klacht;
  await page.goto(`/boards/${kb.id}`);
  await expect(page.getByTestId("board-page")).toBeVisible();
  await page.getByTestId("automate-button").click();
  await page.getByTestId("auto-tab-builder").click();
  await page.getByTestId("builder-trigger-block").selectOption("item_created");
  await page.getByTestId("builder-add-action").click();
  await page.getByTestId("builder-action-0-block").selectOption("ai_categorize");
  await page.getByTestId("builder-action-0-targetColumnId").selectOption({ label: "Categorie" });
  await page.getByTestId("builder-name").fill("Categoriseer klachten met AI");
  await shot(page, "block-builder");
  await page.keyboard.press("Escape");
  await page.goto(`/boards/${kb.id}`);
  const hdr = page.getByTestId(`col-header-${cat.key}`);
  await hdr.hover();
  await hdr.getByTestId("column-menu").click();
  await page.getByTestId("column-ai-autofill").click();
  await page.getByTestId("autofill-kind").selectOption("categorize");
  await page.getByTestId("autofill-run").click();
  await expect(page.getByTestId("autofill-result")).toBeVisible();
  await shot(page, "autofill");
  await page.getByTestId("autofill-close").click();

  // agents
  await page.goto("/agents?view=directory");
  await expect(page.getByTestId("agent-catalog")).toBeVisible();
  await shot(page, "agent-catalog");
  await page.getByTestId("catalog-use-lead_scorer").click();
  await page.getByTestId("install-board").selectOption(b.id);
  await page.getByTestId("install-submit").click();
  await expect(page.getByTestId("agent-builder")).toBeVisible();
  await page.getByTestId("agent-tab-knowledge").click();
  await expect(page.getByTestId("knowledge-row")).toBeVisible();
  await shot(page, "agent-builder");
  await page.getByTestId("agent-tab-test").click();
  await page.getByTestId("console-input").fill(`Beoordeel de leads op board ${b.id}`);
  await page.getByTestId("console-run").click();
  await expect(page.getByTestId("console-result")).toBeVisible();
  await page.getByTestId("agent-tab-runs").click();
  await expect(page.getByTestId("run-row").first()).toBeVisible();
  await page.getByTestId("run-row").first().click();
  await shot(page, "agent-runs");

  // notetaker
  await page.goto("/notetaker");
  await page.getByTestId("nt-title").fill("Kick-off Bravo");
  await page.getByTestId("nt-client").fill("Bravo");
  await page.getByTestId("nt-workspace").selectOption({ label: "Bravo" });
  await page.getByTestId("nt-transcript").fill("Aanwezig: Admin, Builder\nWe bespraken de migratie en de planning.\nBesluit: proefmigratie in november\nActie: Builder - Proefmigratie voorbereiden\nActie: Admin - Offerte fase 2 versturen");
  await page.getByTestId("nt-process").click();
  await expect(page.getByTestId("nt-detail")).toBeVisible();
  await shot(page, "notetaker");

  // admin
  await page.goto("/admin/ai");
  await expect(page.getByTestId("ai-admin-key")).toBeVisible();
  await expect(page.getByTestId("admin-ready")).toBeAttached(); // hydrated
  await shot(page, "admin");
  expect(errors, errors.join("\n")).toEqual([]);
});
