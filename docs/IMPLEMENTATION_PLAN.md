# Implementatieplan: Weekend

Datum: 2026-10-06. Status: wordt uitgevoerd door een team van agents (zie §9).
Bron: `docs/FEATURES.md` (featurelijst).

## 1. Doel

Weekend: een zelfgehost work OS met boards, views, automations en dashboards, inclusief een dev-module (sprints, backlog, burndown, "Complete sprint"). Daarbovenop: een eigen MCP-server, een GraphQL-API en een importer vanuit monday.com.

Succescriteria:
1. Een vertrouwde, complete interface: navigatie, boardlayout, groepen, statuskleuren, itempaneel, views, automations, dashboards.
2. Sjablonen staan klaar: workspaces Delivery, Development en een klant-workspace-sjabloon, met de borden Klanten, Projecten & Fases, Urenregistratie, Sprints, Taken, Epics, Bugs, Retrospectives.
3. Alle featuregroepen uit `docs/FEATURES.md` met fase P0 en P1 werken. P2 werkt waar dit plan het noemt.
4. De e2e-suite (Playwright) draait groen en dekt elke featuregroep.
5. Handleidingen in het Nederlands, met schermafbeeldingen die automatisch door Playwright worden gemaakt.

Buiten scope: hosting/tunnel, betalingen/facturering van seats, native mobiele apps, echte SAML-koppeling (alleen stub en instellingenscherm).

## 2. Ontwerpprincipes

- **UI-bibliotheek: `@vibe/core` (+ `@vibe/icons`)**. Het open-source Vibe design system (Figtree-lettertype, tokens, componenten zoals Button, Avatar, Dropdown, Menu, Tooltip, Dialog, Tabs, Chips, Toggle, Search, Tipseen). Geen eigen vervangers bouwen voor wat Vibe al heeft. Tailwind alleen voor layout-hulpklassen.
- **Layout:** witte topbalk (logo, zoeken, inbox, uitnodigen, help, avatar), smalle app-rail links, zijbalk met workspace-keuze, favorieten en bordenlijst; hoofdvlak met bordtitel, beschrijving, view-tabs, toolbar (New item, Search, Person, Filter, Sort, Hide, Group by, ⋯).
- **Table view:** gekleurde groepskoppen met inklapbare pijl en gekleurde linkerrand, kolomkoppen met menu, volle-cel statuskleuren, "+ Add item" rij, samenvattingsrij onderaan, subitems uitklapbaar, chat-bubbel met aantal updates, personen als ronde avatars.
- **Itempaneel (rechts):** tabs Updates / Files / Activity Log, schrijfveld met @mentions, likes en antwoorden.
- **Statuskleuren:** Done `#00c875`, Working on it `#fdab3d`, Stuck `#df2f4a`, grijs `#c4c4c4`, plus de overige Vibe-kleuren uit `@vibe/core`. Primair blauw `#0073ea`.
- **Gedrag:** inline bewerken, sleepbare rijen en groepen, toetsenbordbediening, undo/redo (Ctrl+Z), realtime updates tussen gebruikers.

## 3. Technische keuzes

| Onderwerp | Keuze | Reden |
|---|---|---|
| Framework | Next.js 16, App Router, React 19, TypeScript strict | Staat al; lees `node_modules/next/dist/docs/` voor wijzigingen |
| UI | `@vibe/core`, `@vibe/icons`, CSS modules | Zie §2 |
| Database | SQLite (`better-sqlite3`) met Drizzle ORM, bestand in `data/` (volume) | Docker-netwerkpool van deze host is vol, dus geen extra Postgres-container. Eén-bestand-backup. Drizzle-schema blijft nette migraties houden |
| Auth | E-mail + wachtwoord (`node:crypto` scrypt), sessiecookie met `jose`; API-tokens voor API/MCP | Geen externe afhankelijkheden |
| Realtime | Server-Sent Events per board | Eenvoudig, werkt achter Next |
| Validatie | `zod` op alle grenzen | Projectregel |
| Rich text | Tiptap voor updates en WorkDocs | Blokken-editor, @mentions |
| Drag & drop | `@dnd-kit` | Rijen, groepen, kanban, kolommen |
| Charts | `recharts` | Dashboards en chart-view |
| Gantt/Timeline | Eigen SVG/CSS-component | Beheersbaar, geen zware licentie |
| MCP | `@modelcontextprotocol/sdk`, Streamable HTTP op `/api/mcp` | Eén toolset voor AI-clients |
| GraphQL | `graphql-yoga` op `/api/graphql`, schema met boards, items, columns, groups, updates, users, workspaces, folders, docs, webhooks, mutations `create_item`, `change_column_value`, `change_multiple_column_values`, enz.) | Eén API voor scripts en integraties |
| Tests | Playwright (`@playwright/test`), Vitest voor services | Project-eis |
| Dev-server | Host (`npm run dev`). Docker alleen als de netwerkpool is opgelost | Zie `CLAUDE.md` |

**Datamodel (kern):** `users`, `teams`, `team_members`, `accounts`, `workspaces`, `workspace_members`, `folders`, `boards` (kind: `board` | `dev_sprints` | `doc` | `dashboard`), `board_members`, `groups`, `columns` (type + `settings` JSON, bv. statuslabels met kleur en index), `items` (met `parent_item_id` voor subitems, `group_id`, `position`, `values` JSON per kolom-id), `updates`, `update_likes`, `assets`, `activity_log`, `notifications`, `views` (type + settings + filters), `dashboards`, `widgets`, `docs` (blokken-JSON), `forms`, `form_questions`, `form_submissions`, `automations` (trigger/conditie/actie JSON), `automation_runs`, `webhooks`, `api_tokens`, `sprints`, `sprint_items`, `time_entries`, `import_jobs`, `audit_log`. Alle schema's in `src/db/schema/<module>.ts`, één bestand per module, geëxporteerd via `src/db/schema/index.ts`.

**Computed kolommen** (mirror, formula, progress, auto number, item id, creation log, last updated) worden bij lezen berekend in `src/server/columns/computed/`, niet opgeslagen.

## 4. Architectuur en mapindeling

```
src/
  app/
    (auth)/login, (app)/…          # UI-routes
    api/v1/…                       # REST
    api/graphql/                   # GraphQL
    api/mcp/                       # MCP (Streamable HTTP)
    api/events/[boardId]/          # SSE
  components/                      # gedeelde UI (shell, sidebar, topbar, item-panel)
  modules/<module>/                # UI + logica per module (zie §5), eigenaar = één agent
  server/
    services/<module>.ts           # ENIGE plek voor businesslogica (UI, REST, GraphQL en MCP roepen dit aan)
    columns/<type>.ts              # per kolomtype: validate, serialize, format, filter, cell, editor (registry)
    views/registry.ts              # view-registry
    automations/blocks/            # trigger- en actieblokken (registry)
    mcp/tools/<module>.ts          # MCP-tools per module (registry)
  db/ (schema, migrations, seed)
  lib/ (auth, events, id, permissions, zod-schemas)
docs/ (FEATURES, IMPLEMENTATION_PLAN, ARCHITECTURE, handleiding/, decisions/)
e2e/ (Playwright)
scripts/ (import-monday, seed)
```

Regels die iedereen volgt:
1. **Businesslogica alleen in `src/server/services/`**, met zod-invoer. UI, REST, GraphQL en MCP zijn dunne lagen erboven.
2. **Registries zijn uitbreidpunten**: kolomtypes, views, widgets, automation-blokken, MCP-tools, zijbalk-items. Een module voegt een eigen bestand toe en één regel in de index. Lees de indexfile vlak vóór het bewerken (andere agents werken tegelijk).
3. **Eigendom van bestanden:** wijzig alleen bestanden van je eigen module. Gedeelde bestanden (`src/db/schema/index.ts`, registries, `src/components/shell/*`) alleen additief wijzigen. Schemawijzigingen als nieuw migratiebestand.
4. **Geen `npm run build` of `rm -rf .next` in de gedeelde map.** Controleer met `npx tsc --noEmit` en `npm run lint`. Voor een dev-server: eigen poort (3100 + volgnummer), `NEXT_DIST_DIR=.next-<naam>` en `DATABASE_URL=file:data/<naam>.db`.
5. **Geheimen:** nooit in code of logs. `MONDAY_API_KEY` alleen via `process.env` in `scripts/` en nooit naar de browser.
6. **Bestandsgrootte:** onder 500 regels per bestand.
7. **Nederlandse UI-teksten** met i18n-sleutels in `src/lib/i18n/{nl,en}.ts` (standaard `nl`, maar de producttermen "Board", "Group", "Item", "Update" blijven Engels).
8. **Elke feature krijgt een Playwright-test** in `e2e/<module>/` en een stuk handleiding, zie §7 en §8.

## 5. Modules, eigenaar en inhoud

| # | Module (map) | Inhoud | Fase |
|---|---|---|---|
| F | `foundation` | Dependencies, DB + Drizzle + migraties, seed (voorbeeld-users/teams/workspaces), auth, permissies-skelet, services voor workspaces/folders/boards/groups/columns/items/updates, SSE, app-shell (topbar, rail, zijbalk, bordpagina met tabs en toolbar), basis Table view, i18n, `docs/ARCHITECTURE.md`, e2e-harness (login-fixture, DB-reset) | P0 |
| C | `columns` | Alle kolomtypes uit §2 van `FEATURES.md`: cel, editor, validatie, filter, sortering, samenvatting; status/dropdown-labelbeheer; computed (mirror, formula, progress, auto number); kolom-menu en Column center | P0/P1 |
| T | `table-ux` | Toolbar (zoeken, Person, Filter, Sort, Hide, Group by), drag & drop, subitems, itempaneel (Updates/Files/Activity), @mentions, bulk-acties, undo/redo, toetsenbord, bordinstellingen, sjablonen, archief/prullenbak | P0/P1 |
| V | `views` | Kanban, Calendar, Timeline, Gantt (met dependencies), Workload, Cards, Chart, Map, Files, Form-view, viewbeheer en opgeslagen filters | P1 |
| D | `dev` | Weekend dev: sprintborden, backlog, epics, bugs, retrospectives, "Complete sprint", burndown, velocity, sprintdashboard, Git-koppeling (webhook GitHub/Bitbucket), dev-sjabloon met vaste statussen | P1 |
| A | `automations` | Engine, recepten-centrum, custom builder, triggers/acties/condities, scheduler, button-kolom, notificaties-actie, webhooks, workflow-builder (licht), integratiecentrum (Slack/GitHub/Teams als webhook-adapters) | P1/P2 |
| B | `boards-extra` | Dashboards + widgets, WorkForms, WorkDocs (Tiptap), Whiteboard (licht), My Work, Inbox/notificaties | P1 |
| P | `platform` | GraphQL-API, REST, webhooks, API-tokens-UI, rate limits, MCP-server met alle toolgroepen uit `FEATURES.md` §12, `.mcp.json` voorbeeld | P1 |
| M | `migration` | `scripts/import-monday.ts` (monday.com-importer → Weekend, idempotent op monday.com-id, dry-run), sjablonen Delivery/Development/Klant-workspace | P1 |
| G | `admin` | Rollen en permissies (account/workspace/board/kolom), gasten, teams, accountbeheer, auditlog, SSO-instellingenscherm (stub), profiel, globale zoekfunctie | P1/P3 |
| AI | `ai` | Sidekick-paneel en AI-blokken via de Claude API (`claude-sonnet-5-5`), agents-overzicht, notetaker-bord | P2 |
| Q | `e2e` en `manuals` | Playwright-suite per module, handleidingen met automatische screenshots, visuele regressie | P1 |

## 6. Volgorde en golven

**Golf 1 (kritiek pad):** agent `foundation`. Levert schema, services, shell, registries en de e2e-harness. Alle andere agents wachten hierop.
**Golf 2 (parallel):** `columns`, `table-ux`, `views`, `dev`, `automations`, `boards-extra`, `platform`, `migration`, `admin`. Elke agent bouwt zijn module met tests en conceptdocumentatie.
**Golf 3:** `ai`, `e2e-manuals` (volledige suite en handleidingen), `qa` (integratie: alle tests draaien, bugs fixen).
**Golf 4 (ik):** eindcontrole: `tsc`, `lint`, `build`, volledige Playwright-run, afwijkingenlijst, overdracht.

## 7. Teststrategie (e2e)

- Playwright in `e2e/`, `playwright.config.ts` met `webServer` (`next dev` op 3058, eigen testdatabase `data/test.db`).
- Fixture `login(as: 'admin' | 'dev1' | ...)` en `resetDb()` (seed in <2 s). Tests zijn onafhankelijk.
- Per module minimaal: happy path per featuregroep, rechten (iemand zonder toegang ziet het niet), realtime (twee browsercontexten), foutpaden.
- Vaste kernscenario's (de "Gebruikersreis"): inloggen → workspace Delivery → bord Klanten → item aanmaken → status wijzigen → subitem → update met @mention → view wisselen → filter opslaan → dashboard → automation "status = Done → verplaats naar groep" → formulier invullen → sprint starten en afsluiten ("Complete sprint") → uren schrijven en optellen via mirror/formule → MCP-aanroep `create_item` → import-dry-run.
- Console- en netwerkfouten laten de test falen. Visuele controle via screenshots (`toHaveScreenshot` voor shell en table-view).
- Servicelaag: Vitest met in-memory SQLite.
- Definition of done per module: `tsc`, `lint`, Vitest en module-e2e groen.

## 8. Handleidingen

- Map `docs/handleiding/`, in het Nederlands, met Engelse producttermen: `00-aan-de-slag.md`, `01-workspaces-en-boards.md`, `02-columns.md`, `03-views.md`, `04-itempaneel-en-updates.md`, `05-automations.md`, `06-dashboards.md`, `07-forms-en-docs.md`, `08-dev-sprints.md`, `09-uren-en-delivery.md`, `10-mcp-en-api.md`, `11-import.md`, `12-beheer-en-rechten.md`.
- Screenshots worden gemaakt door Playwright-specs in `e2e/manuals/` (`npm run manuals` schrijft naar `docs/handleiding/img/`), zodat ze niet verouderen.
- Elke module-agent levert een tekstconcept met stappen; de `manuals`-agent maakt het af, controleert elk stappenplan tegen de echte app en voegt de screenshots toe.
- In de app: route `/help` rendert dezelfde markdown.

## 9. Agents en samenwerking

Alle agents zijn benoemd (zie `/CLAUDE.md`). Ze lezen eerst `docs/IMPLEMENTATION_PLAN.md`, `docs/FEATURES.md` en (na golf 1) `docs/ARCHITECTURE.md`. Ze melden klaar-status met `SendMessage` aan `lead` met: wat werkt, wat niet, geplande afwijkingen, testresultaat.

Prompts per agent bevatten: scope (§5), eigen mappen, de regels uit §4, acceptatiecriteria uit §1 en §7, en de opdracht om een eigen dev-server op een eigen poort te gebruiken.

## 10. Risico's

| Risico | Maatregel |
|---|---|
| Veel agents schrijven tegelijk in dezelfde map | Eigendomsregels (§4), registries, aparte poorten en databases, geen gedeelde `.next` |
| Schemawijzigingen botsen | Eén schemabestand per module, alleen additieve migraties |
| Inconsistente look | `@vibe/core` als basis, design-checklist (§2), screenshotcontrole door `qa` |
| Importer raakt de bron-account op monday.com | De monday.com-importer is alleen-lezen (alleen queries). Schrijven naar monday.com gebeurt nooit |
| Docker-netwerkpool vol | Geen extra services nodig (SQLite). Opruimen van netwerken vraagt toestemming van de gebruiker |
| Scope is enorm | Strikte fasering P0 → P1 → P2. P3 alleen stubs |

## 11. Beslissingen die ik heb genomen (corrigeer gerust)

1. SQLite in plaats van Postgres, vanwege de volle Docker-netwerkpool.
2. `@vibe/core` als UI-basis, voor een complete set componenten.
3. Sprints per team.
4. De monday.com-importer is read-only richting monday.com.
5. Geen git-repo aangemaakt en niets gecommit.
