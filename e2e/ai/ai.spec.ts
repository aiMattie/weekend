import { collectConsoleErrors, expect, login, resetDb, test } from "../fixtures";
import { aiOff, aiReset, addColumn, makeBoard, useMockProvider } from "./helpers";
import type { MockAnthropic } from "./mock-anthropic";

/** AI module e2e against a local mock of the Anthropic API (never the real one). */
let mock: MockAnthropic | null = null;
let ws: Record<string, string> = {};

test.beforeAll(async ({ request }) => {
  mock = await useMockProvider(request);
  test.skip(!mock, "needs a server started with E2E_RESET=1 (playwright.config.ts does that)");
});
test.afterAll(async ({ request }) => { await aiReset(request).catch(() => undefined); await mock?.close(); });
test.beforeEach(async ({ request }) => {
  if (!mock) return;
  await aiReset(request);
  await request.post("/api/test/ai", { data: { baseUrl: mock.url, apiKey: "mock-key" } });
  ws = (await resetDb(request)).workspaceIds;
});

test("Sidekick panel from the rail: ask about the board, answer streams in with the board data", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await login(page, "admin");
  const b = await makeBoard(page.request, ws["Delivery"], "Sidekick testbord", ["Offerte versturen", "Contract controleren"]);
  await page.goto(`/boards/${b.id}`);
  await expect(page.getByTestId("board-page")).toBeVisible();
  await page.getByTestId("rail-sidekick-rail").click();
  await expect(page.getByTestId("sidekick-panel")).toBeVisible();
  await expect(page.getByTestId("sidekick-context")).toHaveAttribute("data-kind", "board");
  await page.getByTestId("ai-input").fill("Wat staat er op dit board?");
  await page.getByTestId("ai-send").click();
  await expect(page.getByTestId("ai-tool-note").first()).toContainText("get_board");
  const answer = page.getByTestId("ai-msg-assistant").last();
  await expect(answer).toContainText("Sidekick testbord");
  await expect(answer).toContainText("Offerte versturen");
  await expect(answer).toContainText("Contract controleren");
  await expect(page.getByTestId("ai-credits")).toContainText("credits");
  // the panel closes again and history is kept per user
  await page.getByTestId("sidekick-close").click();
  await expect(page.getByTestId("sidekick-panel")).toHaveCount(0);
  const convs = await (await page.request.get("/api/v1/ai/conversations")).json();
  expect(convs).toHaveLength(1);
  // with an item open, the item is the context
  await page.goto(`/boards/${b.id}?item=${b.itemIds[0]}`);
  await expect(page.getByTestId("item-panel")).toBeVisible();
  await page.getByTestId("rail-sidekick-rail").click();
  await expect(page.getByTestId("sidekick-context")).toHaveAttribute("data-kind", "item");
  expect(errors).toEqual([]);
});

test("Sidekick proposes a write as a card, nothing happens until confirmed", async ({ page }) => {
  await login(page, "admin");
  const b = await makeBoard(page.request, ws["Delivery"], "Sidekick schrijven", ["Bestaand item"]);
  await page.goto(`/boards/${b.id}`);
  await page.getByTestId("board-ai").click(); // the board header button opens Sidekick with this board as context
  await expect(page.getByTestId("sidekick-context")).toHaveAttribute("data-kind", "board");
  await page.getByTestId("ai-input").fill("maak item Nieuw via Sidekick");
  await page.getByTestId("ai-send").click();
  const card = page.getByTestId("ai-action-card");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("ai-action-summary")).toContainText("Nieuw via Sidekick");
  const before = await (await page.request.get(`/api/v1/items?boardId=${b.id}`)).json();
  expect(before.map((i: { name: string }) => i.name)).not.toContain("Nieuw via Sidekick");
  await page.getByTestId("ai-confirm").click();
  await expect(page.getByTestId("ai-action-done")).toBeVisible();
  const after = await (await page.request.get(`/api/v1/items?boardId=${b.id}`)).json();
  expect(after.map((i: { name: string }) => i.name)).toContain("Nieuw via Sidekick");
  // activity shows it came from the user's own account, flagged as AI
  const item = after.find((i: { name: string }) => i.name === "Nieuw via Sidekick");
  const act = await (await page.request.get(`/api/v1/items/${item.id}/activity`)).json();
  expect(JSON.stringify(act)).toContain('"source":"ai"');
});

test("Weekend magic: describe a process, preview, confirm, board exists with columns and groups", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/sidekick");
  await expect(page.getByTestId("sidekick-page")).toBeVisible();
  await page.getByTestId("sk-magic").click();
  await page.getByTestId("magic-description").fill("Een recruitment pipeline van sollicitatie tot contract");
  await page.getByTestId("magic-generate").click();
  await expect(page.getByTestId("magic-preview")).toBeVisible();
  await expect(page.getByTestId("magic-col")).toHaveCount(3);
  await expect(page.getByTestId("magic-group")).toHaveCount(2);
  const before = (await (await page.request.get("/api/v1/boards")).json()) as { name: string }[];
  expect(before.map((x) => x.name)).not.toContain("Recruitment pipeline");
  await page.getByTestId("magic-create").click();
  await expect(page.getByTestId("magic-done")).toBeVisible();
  await page.getByTestId("magic-open-board").click();
  await expect(page.getByTestId("board-title")).toContainText("Recruitment pipeline");
  await expect(page.getByText("Anna de Vries")).toBeVisible();
  await expect(page.getByText("Afgerond", { exact: true }).first()).toBeVisible();
});

test("Agents: ready-made catalogue, install, manual run in the test console, run history", async ({ page }) => {
  await login(page, "admin");
  const b = await makeBoard(page.request, ws["Delivery"], "Leads", ["Lead Example"]);
  await page.goto("/agents?view=directory");
  await expect(page.getByTestId("agent-catalog")).toBeVisible();
  for (const key of ["lead_scorer", "ticket_assignment", "risk_analyzer", "meeting_summarizer", "daily_briefer", "sprint_reporter", "hours_checker"]) await expect(page.getByTestId(`catalog-${key}`)).toBeVisible();
  await page.getByTestId("catalog-use-lead_scorer").click();
  await page.getByTestId("install-board").selectOption(b.id);
  await page.getByTestId("install-submit").click();
  await expect(page.getByTestId("agent-builder")).toBeVisible();
  await expect(page.getByTestId("agent-title")).toContainText("Lead Scorer");
  await expect(page.getByTestId("agent-status")).toContainText("Concept");
  // knowledge was granted on the chosen board, write access
  await page.getByTestId("agent-tab-knowledge").click();
  await expect(page.getByTestId("knowledge-row")).toContainText("Leads");
  await expect(page.getByTestId("knowledge-row")).toContainText("Lezen en schrijven");
  await page.getByTestId("agent-tab-triggers").click();
  await expect(page.getByTestId("trigger-row")).toHaveCount(2);
  // test console: point the run at the item
  await page.getByTestId("agent-tab-test").click();
  await page.getByTestId("console-input").fill(`Beoordeel de leads op board ${b.id}`);
  const itemId = b.itemIds[0];
  const agentId = (await page.getByTestId("agent-builder").getAttribute("data-agent-id"))!;
  const run = await page.request.post(`/api/v1/ai/agents/${agentId}/run`, { data: { itemId, boardId: b.id, input: "api run" } });
  expect(run.ok()).toBeTruthy();
  await page.getByTestId("console-run").click();
  await expect(page.getByTestId("console-result")).toBeVisible();
  await expect(page.getByTestId("console-status")).toContainText("Gelukt");
  await expect(page.getByTestId("console-output")).toContainText("Klaar");
  await expect(page.getByTestId("console-toolcall").first()).toContainText("get_board");
  // run history lists both runs
  await page.getByTestId("agent-tab-runs").click();
  await expect(page.getByTestId("run-row")).toHaveCount(2);
  await page.getByTestId("run-row").first().click();
  await expect(page.getByTestId("run-detail")).toBeVisible();
  // the agent wrote as its own identity on the item (create_update from the API run)
  const ups = await (await page.request.get(`/api/v1/items/${itemId}/updates`)).json();
  expect(JSON.stringify(ups)).toContain("Score: 80/100");
  // visible in "My agents" with its last run
  await page.goto("/agents?view=mine");
  await expect(page.getByTestId("agent-tile")).toContainText("Lead Scorer");
});

test("Agent builder: permission limit shows up as a denied tool call, kill switch stops runs", async ({ page }) => {
  await login(page, "admin");
  const other = await makeBoard(page.request, ws["Delivery"], "Niet toegestaan", ["Geheim item"]);
  const agent = await (await page.request.post("/api/v1/ai/agents", { data: { name: "Beperkte agent", instructions: "lees" } })).json();
  const run1 = await (await page.request.post(`/api/v1/ai/agents/${agent.id}/run`, { data: { boardId: other.id } })).json();
  expect(run1.status).toBe("success");
  expect(run1.toolCalls[0]).toMatchObject({ name: "get_board", error: true }); // no knowledge granted: denied like a 403
  const kill = await page.request.patch("/api/v1/ai/settings", { data: { agentsEnabled: false } });
  expect(kill.ok()).toBeTruthy();
  const run2 = await (await page.request.post(`/api/v1/ai/agents/${agent.id}/run`, { data: { boardId: other.id } })).json();
  expect(run2.status).toBe("skipped");
  await page.goto("/agents?view=mine");
  await expect(page.getByTestId("agents-killed")).toBeVisible();
});

test("Notetaker: transcript to summary, decisions and action items, report doc and confirmed tasks", async ({ page }) => {
  await login(page, "admin");
  const taken = await makeBoard(page.request, ws["Delivery"], "Taken", []);
  await page.goto("/notetaker");
  await expect(page.getByTestId("notetaker-page")).toBeVisible();
  await page.getByTestId("nt-title").fill("Kick-off Bravo");
  await page.getByTestId("nt-client").fill("Bravo");
  await page.getByTestId("nt-workspace").selectOption({ label: "Bravo" });
  await page.getByTestId("nt-transcript").fill("Aanwezig: Admin, Builder\nWe bespraken de migratie en de planning.\nBesluit: proefmigratie in november\nActie: Builder - Proefmigratie voorbereiden\nActie: Admin - Offerte fase 2 versturen");
  await page.getByTestId("nt-process").click();
  await expect(page.getByTestId("nt-detail")).toBeVisible();
  await expect(page.getByTestId("nt-method")).toContainText("AI");
  await expect(page.getByTestId("nt-summary")).toContainText("Mock-samenvatting");
  await expect(page.getByTestId("nt-decisions")).toContainText("proefmigratie in november");
  await expect(page.getByTestId("nt-action")).toHaveCount(2);
  // report as a doc in the klant workspace
  await page.getByTestId("nt-report").click();
  await expect(page.getByTestId("nt-msg")).toBeVisible();
  // tasks only after the confirm step
  expect((await (await page.request.get(`/api/v1/items?boardId=${taken.id}`)).json())).toHaveLength(0);
  await page.getByTestId("nt-task-board").selectOption(taken.id);
  await page.getByTestId("nt-create-tasks").click();
  await expect(page.getByTestId("nt-msg")).toContainText("2 taken");
  const tasks = (await (await page.request.get(`/api/v1/items?boardId=${taken.id}`)).json()) as { name: string }[];
  expect(tasks.map((t) => t.name).sort()).toEqual(["Offerte fase 2 versturen", "Proefmigratie voorbereiden"]);
  await expect(page.getByTestId("nt-action").first()).toHaveAttribute("data-status", "created");
  await page.getByTestId("nt-open-doc").click();
  await expect(page).toHaveURL(/\/docs\//);
});

test("AI block in an automation categorizes new items, and AI autofill in the column menu fills a column", async ({ page }) => {
  await login(page, "admin");
  const b = await makeBoard(page.request, ws["Delivery"], "Klachten", []);
  const klacht = await addColumn(page.request, b.id, { title: "Klacht", type: "long_text" });
  const cat = await addColumn(page.request, b.id, { title: "Categorie", type: "status", settings: { labels: [{ id: 0, index: 0, text: "Vraag", color: "#579bfc" }, { id: 1, index: 1, text: "Bug", color: "#df2f4a" }, { id: 2, index: 2, text: "Feature", color: "#00c875" }] } });
  const auto = await page.request.post("/api/v1/automations", { data: { boardId: b.id, name: "Categoriseer klachten", trigger: { type: "item_created", config: {} }, steps: [{ type: "action", block: "ai_categorize", config: { sourceColumnId: klacht.id, targetColumnId: cat.id } }] } });
  expect(auto.ok(), await auto.text()).toBeTruthy();
  const item = await (await page.request.post("/api/v1/items", { data: { boardId: b.id, groupId: b.groupId, name: "App crasht", values: { [klacht.id]: { text: "De app crasht bij het opslaan" } } } })).json();
  await expect.poll(async () => (await (await page.request.get(`/api/v1/items/${item.id}`)).json()).values[cat.id]?.index, { timeout: 20_000 }).toBe(1);
  const runs = await (await page.request.get(`/api/v1/automations/runs?boardId=${b.id}`)).json();
  expect(JSON.stringify(runs)).toContain("categorize");

  // column menu: AI autofill fills the cells that are still empty
  const second = await (await page.request.post("/api/v1/items", { data: { boardId: b.id, groupId: b.groupId, name: "Vraag over facturen" } })).json();
  await page.goto(`/boards/${b.id}`);
  await expect(page.getByTestId("board-page")).toBeVisible();
  const hdr = page.getByTestId(`col-header-${cat.key}`);
  await hdr.hover();
  await hdr.getByTestId("column-menu").click();
  await page.getByTestId("column-ai-autofill").click();
  await expect(page.getByTestId("autofill-dialog")).toBeVisible();
  await page.getByTestId("autofill-kind").selectOption("categorize");
  await page.getByTestId("autofill-run").click();
  await expect(page.getByTestId("autofill-result")).toContainText("1 ingevuld");
  await expect.poll(async () => (await (await page.request.get(`/api/v1/items/${second.id}`)).json()).values[cat.id]?.index).toBe(0);
  await page.getByTestId("autofill-close").click();
});

test("graceful 'AI niet geconfigureerd' state in Sidekick, magic, agents and notetaker; admin page never shows a key", async ({ page }) => {
  const request = page.request;
  await aiOff(request);
  await login(page, "admin");
  await page.goto("/sidekick");
  await expect(page.getByTestId("ai-not-configured")).toContainText("AI niet geconfigureerd");
  await expect(page.getByTestId("ai-input")).toBeDisabled();
  await page.getByTestId("sk-magic").click();
  await expect(page.getByTestId("magic-not-configured")).toBeVisible();
  await expect(page.getByTestId("magic-generate")).toBeDisabled();
  await page.goto("/agents");
  await expect(page.getByTestId("ai-not-configured")).toBeVisible();
  await page.goto("/notetaker");
  await expect(page.getByTestId("ai-not-configured")).toBeVisible();
  // Notetaker still works without AI (deterministic extraction)
  await page.getByTestId("nt-title").fill("Zonder AI");
  await page.getByTestId("nt-transcript").fill("We spraken kort.\nBesluit: doorgaan\nActie: Builder - Plan maken");
  await page.getByTestId("nt-process").click();
  await expect(page.getByTestId("nt-method")).toContainText("Zonder AI");
  await expect(page.getByTestId("nt-decisions")).toContainText("doorgaan");
  await expect(page.getByTestId("nt-action")).toHaveCount(1);
  await page.goto("/admin/ai");
  await expect(page.getByTestId("ai-admin-key")).toContainText("Niet ingesteld");
  const html = await page.content();
  expect(html).not.toMatch(/sk-ant-|mock-key/);
  const st = await (await request.get("/api/v1/ai/status")).json();
  expect(JSON.stringify(st)).not.toMatch(/apiKey|sk-/);
  // the REST chat endpoint answers with a clear error instead of a stream
  const chat = await request.post("/api/v1/ai/chat", { data: { message: "hoi" } });
  expect(chat.status()).toBe(503);
});

test("Admin > AI: limits, kill switch and usage", async ({ page }) => {
  const request = page.request;
  await login(page, "admin");
  // some usage first
  const b = await makeBoard(request, ws["Delivery"], "Gebruik", ["X"]);
  void b;
  await page.goto("/sidekick");
  await page.getByTestId("ai-input").fill("hallo");
  await page.getByTestId("ai-send").click();
  await expect(page.getByTestId("ai-msg-assistant").last()).toContainText("Sidekick");
  await page.goto("/admin/ai");
  await expect(page.getByTestId("ai-admin-key")).toContainText("Ingesteld");
  await expect(page.getByTestId("ai-admin-usage-total")).toContainText("1 aanroepen");
  await page.getByTestId("ai-admin-user-limit").fill("5");
  await page.getByTestId("ai-admin-save").click();
  await expect(page.getByTestId("ai-admin-saved")).toBeVisible();
  await page.getByTestId("ai-admin-kill").click();
  await expect(page.getByTestId("ai-admin-resume")).toBeVisible();
  const s = await (await request.get("/api/v1/ai/settings")).json();
  expect(s.settings).toMatchObject({ userMonthlyCredits: 5, agentsEnabled: false });
  // audit entries
  const audit = await (await request.get("/api/v1/audit-log?limit=20")).json();
  expect(JSON.stringify(audit)).toContain("ai.agents_killed");
  // credit limit reached: Sidekick says so
  await page.getByTestId("ai-admin-user-limit").fill("0");
  await page.getByTestId("ai-admin-save").click();
  await expect(page.getByTestId("ai-admin-saved")).toBeVisible();
  await page.goto("/sidekick");
  await expect(page.getByTestId("ai-credits-out")).toBeVisible();
});
