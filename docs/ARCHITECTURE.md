# Architectuur en uitbreidpunten

Dit is het document dat elke module-agent leest voordat hij code schrijft. Bron van waarheid voor stack, datamodel en regels blijft `docs/IMPLEMENTATION_PLAN.md`; dit document beschrijft **hoe de basis (module F, foundation) in elkaar zit** en **waar je aanhaakt**.

## 1. Draaien, poorten, omgeving

| Wat | Commando / waarde |
|---|---|
| Dev-server (host) | `npm run dev` (poort 3000) of `npx next dev -p <poort>` |
| Eigen dev-server per agent | `NEXT_DIST_DIR=.next-<naam> DATABASE_URL=file:data/<naam>.db npx next dev -p 31xx` |
| Database migreren / seeden / resetten | `npm run db:migrate`, `npm run db:seed`, `npm run db:reset` (reset = alles leeg + seed). `db:seed` laadt de testfixture (rolnamen, `admin@example.com`); gebruikers starten leeg met `npm run setup` |
| Migratie genereren | `npm run db:generate -- <module> --name <wat>` (zie 3.4) |
| Typecheck, lint | `npm run typecheck` (= `tsc --noEmit`), `npm run lint` |
| Servicetests (Vitest, in-memory SQLite) | `npm test` |
| E2E (Playwright) | `E2E_PORT=31xx npm run test:e2e` |
| Handleiding-screenshots | `npm run manuals` (specs in `e2e/manuals/`) |

Inloggen in de seed: `<key>@example.com` (admin, owner, pm1, pm2, dev1, dev2, develop, consultant1, consultant2, developer3), wachtwoord `SEED_PASSWORD` (standaard `Welkom123!`). Admin en Max zijn account-admin. De AI-agents Scout en Aide kunnen niet inloggen.

Omgevingsvariabelen (zie `.env.example`, geheimen nooit loggen of committen):

| Variabele | Doel |
|---|---|
| `DATABASE_URL` | `file:data/app.db` (standaard), `:memory:` in Vitest. `data/` staat in `.gitignore` en is een docker-volume |
| `SESSION_SECRET` | ondertekent de sessiecookie (jose HS256). Wordt bij setup in `.env` gegenereerd |
| `SEED_PASSWORD` | wachtwoord van alle geseede gebruikers |
| `NEXT_DIST_DIR` | eigen `.next`-map per dev-server (`next.config.ts`), nooit delen |
| `E2E_PORT`, `E2E_RESET` | testharness (zie 9). `E2E_RESET=1` zet `POST /api/test/reset` aan |
| `MONDAY_API_KEY` | alleen voor `scripts/` (importer), nooit in de browser |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`, `GOOGLE_ALLOWED_DOMAINS` | Google SSO (module sso: `src/server/sso/*`, `services/google-sso.ts` + `sso-settings.ts`, tabel `user_identities`, `/admin/sso`). Zonder client id/secret geen Google-knop. Redirect-URI `${APP_URL}/api/auth/google/callback`. Herstel: `npm run auth:break-glass -- <email>`. Test-hooks `GOOGLE_OAUTH_BASE` e.d. en `POST /api/test/google` alleen met `E2E_RESET=1` |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` | Microsoft SSO (Entra ID, `src/server/sso/microsoft.ts`; gedeelde flow `src/server/sso/flow-routes.ts`, zelfde beleid en `user_identities` met provider `microsoft`). Redirect-URI `${APP_URL}/api/auth/microsoft/callback`. Tenant standaard `organizations`; een eigen tenant-ID is het veiligst. Test-hooks `MICROSOFT_OAUTH_BASE`/`MICROSOFT_ISSUER_BASE` alleen met `E2E_RESET=1` |

Poorten: 3058 is de host-poort van het project (docker-compose, `HOST_PORT`). E2E gebruikt standaard 3058 met `data/test.db` en `.next-e2e`; bij een andere `E2E_PORT` wordt dat `data/test-<poort>.db` en `.next-e2e-<poort>`. Agents gebruiken 3100 + volgnummer.

## 2. Mapindeling en eigendom

```
src/
  app/
    (auth)/login/            login-pagina (foundation)
    (app)/                   alles achter de login; layout = AppShell. Eigen routes: src/app/(app)/<route>/page.tsx
    api/v1/**                REST: dunne routes over services (api() uit src/server/http.ts)
    api/auth/*  api/events/[boardId]  api/test/reset
    proxy.ts is src/proxy.ts (Next 16 heet middleware nu "proxy")
  components/
    shell/                   topbar, rail, zijbalk, nav-registry.ts, user-context
    board/                   BoardPage, toolbar, tabs, tabel (table/), use-board (state + SSE)
    columns/                 CLIENT kolomregistry (Cell/Editor per type)
    views/                   CLIENT viewregistry (component per viewtype)
    item-panel/              rechter itempaneel
  modules/<module>/          UI + logica van een module (eigenaar = een agent)
  server/
    services/<module>.ts     ENIGE plek voor businesslogica
    columns/                 SERVER kolomregistry (validate/serialize/format/filter) + types
    views/registry.ts        SERVER viewregistry (metadata, default settings)
    automations/blocks/      registry van trigger-, conditie- en actieblokken
    mcp/tools/registry.ts    registry van MCP-tools
    http.ts                  api() helper voor routes
  db/schema/<module>.ts      een schemabestand per module, geexporteerd via schema/index.ts
  db/migrations/<module>/    migraties per module (eigen journal)
  lib/                       auth/, permissions, events, id, position, i18n/, zod-schemas, view-state ...
```

Regels (uit `IMPLEMENTATION_PLAN.md` §4, hier de praktische vertaling):

1. **Businesslogica alleen in `src/server/services/`**, met zod-invoer. Route handlers, GraphQL, MCP, automations en server components roepen services aan; ze praten nooit rechtstreeks met de database (alleen read-models zoals `getBoardFull` staan ook in services).
2. **Eigen bestanden eigen module.** Gedeelde bestanden (`schema/index.ts`, registries, `nav-registry.ts`, `i18n/*.ts`) alleen **additief** wijzigen (een import plus een regel) en het bestand vlak voor het bewerken opnieuw lezen: andere agents werken tegelijk.
3. Bestanden onder 500 regels. Geen `npm run build` of `rm -rf .next` in de gedeelde map. Geen docker, geen git.
4. Nederlandse UI-teksten via i18n-sleutels (zie 8).

## 3. Datamodel en database

### 3.1 Conventies

- **Ids** zijn numeriek ogende strings (`"2000000417"`), uit een persistente reeks (`id_sequence`, `newId()` in `src/lib/id.ts`). Dat maakt GraphQL eenvoudig. Schema-helper: `idPk()`.
- **Tijdstippen** zijn ISO-strings (UTC). **Ordening** via `position REAL` (`src/lib/position.ts`, `computePosition` in services): invoegen tussen twee buren = gemiddelde; ondersteunt `beforeId`, `afterId`, `top`, `position`.
- **JSON-kolommen**: `json<T>("naam")` uit `src/db/schema/_helpers.ts`.
- **Soft delete**: `state = active | archived | deleted` op boards, groups, items, workspaces. Lijsten filteren op `active`.
- **Kolomwaarden** staan in `items.values` (JSON), **gekeyed op `columns.id`**. Elke kolom heeft ook een leesbare `key` (`status`, `people`, `status_2`), uniek per board en scope. Services accepteren overal id **of** key (`resolveColumn`). De GraphQL/MCP-laag gebruikt `key` als "column id".
- **Subitems** zijn gewone `items` met `parent_item_id` en dezelfde `group_id`/`board_id` als de ouder. Ze hebben eigen kolommen: `columns.scope = 'subitem'` (Name, People, Status, Date, aangemaakt bij het eerste subitem).
- **Opgeslagen waardevormen**: status `{ index }` (index = `label.id`), people `{ personsAndTeams: [{ id, kind }] }`, date `{ date, time? }`, dropdown `{ ids: [] }`, checkbox `{ checked }`, link `{ url, text? }`, long_text `{ text }`, numbers een getal, text een string.
- Statuslabels: `settings.labels = [{ id, text, color, index, isDone }]` (kleur als `#rrggbb`).

### 3.2 Tabellen

Core (`src/db/schema/core.ts`, eigenaar foundation): `accounts, users, teams, team_members, workspaces, workspace_members, folders, boards, board_members, groups, columns, items, updates, update_likes, assets, activity_log, notifications, views, favorites`.

Lege placeholders voor andere modules (jouw bestand, jouw tabellen): `dashboards, forms, docs, automations, webhooks, api-tokens, sprints, time-entries, import-jobs, audit-log`. Verwijs naar core-tabellen met `import { boards, items, users } from "./core"` (relatieve imports in `src/db/`, drizzle-kit kent geen `@/`-alias).

### 3.3 Verbinding en migraties

`src/db/client.ts` opent de SQLite-database (WAL, foreign keys, busy timeout), past bij de eerste toegang alle migraties toe (`src/db/migrate.ts`) en cachet de verbinding op `globalThis`. In code: `import { db } from "@/db/client"` (een proxy naar de live verbinding; synchrone better-sqlite3-API: `.get()`, `.all()`, `.run()`, `db.transaction(tx => ...)`).

### 3.4 Een schemabestand of tabel toevoegen

1. Schrijf je tabellen in `src/db/schema/<jouw-module>.ts` (het placeholderbestand bestaat al en wordt al door `schema/index.ts` geexporteerd).
2. `npm run db:generate -- <jouw-module> --name <wat>`. Elke module heeft een **eigen migratiemap en journal** (`src/db/migrations/<module>/`), dus twee agents die tegelijk migraties maken botsen niet. Core wordt altijd eerst toegepast, daarna de rest alfabetisch.
3. `npm run db:migrate` (of start de server: migraties worden automatisch toegepast). Test met `npm test` (Vitest past ze ook toe).
4. Een kolom aan een **core-tabel** toevoegen: alleen additief, in `core.ts`, met `npm run db:generate -- core --name <wat>`; overleg met de lead.

Voorbeeld (`src/db/schema/sprints.ts`):

```ts
import { index, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idPk, json } from "./_helpers";
import { boards } from "./core";

export const sprints = sqliteTable("sprints", {
  id: idPk(),
  boardId: text("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startsOn: text("starts_on"),
  settings: json<Record<string, unknown>>("settings").notNull().default({}),
  position: real("position").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index("sprints_board_idx").on(t.boardId)]);
```

## 4. Services

Een service is een module met functies `(actor, input) => resultaat`. Patroon (zie `src/server/services/items.ts`):

```ts
export function archive(actor: Actor, itemId: string): Item {
  const cur = getItemRow(itemId);                           // 404 als hij niet bestaat
  requireBoard(actor, cur.boardId, "board:edit_items");     // 403 als het niet mag
  const row = db.update(items).set({ state: "archived" }).where(eq(items.id, itemId)).returning().get();
  record(actor, { type: "item.archived", boardId: cur.boardId, itemId },   // bus-event + activity_log in een
         { event: "archive_item", data: { name: cur.name } });
  return row;
}
```

- **Invoer valideren met zod** (`parse(schema, input)` uit `_shared.ts`, geeft `ValidationError` -> HTTP 400). Id's via `idSchema` uit `src/lib/zod-schemas.ts`.
- **Rechten**: `assertCan(actor, "board:edit_items", { boardId })` / `requireBoard(...)`. Actors komen uit `getActor(req)` (sessie of Bearer), `userToActor(user)` of `systemActor(accountId, source)` (automations/import/seed, omzeilt rechten).
- **Fouten**: `NotFoundError`, `ForbiddenError`, `ValidationError`, `ConflictError` uit `src/lib/errors.ts`; `api()` vertaalt ze naar JSON `{ error: { code, message, details } }`.
- **`record(actor, event, log)`** schrijft de `activity_log`-rij **en** zendt het event op de bus. Elke mutatie gebruikt dit, dan blijven SSE, automations en webhooks in sync. Geef `null` als log voor events zonder activiteitsregel.
- Beschikbare services (`import { items, boards } from "@/server/services"`): `workspaces, folders, boards, groups, columns, items, updates, users, views, activity` plus `getBoardFull` en `getNavData`. `items` heeft `list/get/create/update/move/duplicate/archive/remove/restore/listSubitems/changeColumnValue/changeMultipleColumnValues`.
- Nieuwe service? Maak `src/server/services/<module>.ts`, volg het patroon en exporteer hem in `index.ts` (een regel).

### Rechten (`src/lib/permissions.ts`)

`can(actor, action, { workspaceId?, boardId? })` en `assertCan`. Acties: `account:manage`, `workspace:{create,view,update,delete,manage_members,create_board}`, `board:{view,comment,edit_items,edit_structure,delete,manage_members}`. Accountrol `admin | member | guest | viewer`, workspacerol `owner | member | viewer`, boardrol `owner | editor | viewer`. Open workspaces zijn zichtbaar voor alle niet-gasten, gesloten alleen voor leden; publieke boards volgen hun workspace, private boards vragen een board-lidmaatschap; gasten zien alleen boards waar ze lid van zijn. De `admin`-module mag de regels aanscherpen in `decide()`; dat blijft het enige beslispunt.

### Events en realtime

`src/lib/events.ts`: getypeerde bus (`emit`, `subscribe`, `subscribeToBoard`, `subscribeToType`). Een nieuw event: voeg het additief toe aan de `AppEvent`-union en zend het via `record()`. `GET /api/events/[boardId]` is de SSE-stroom (rechten gecontroleerd). De client (`use-board-events`) vernieuwt `GET /api/v1/boards/:id/full` (debounced).

## 5. REST (`src/app/api/v1/**`)

Een route is een paar regels:

```ts
import { api } from "@/server/http";
import { items } from "@/server/services";
type P = { id: string };
export const GET = api<P>(({ actor, params }) => items.get(actor, params.id));
export const PATCH = api<P>(async ({ actor, params, body }) => items.update(actor, params.id, await body()));
```

`api()` doet authenticatie (Bearer of sessie), parst de body, mapt fouten en geeft JSON terug (`undefined` -> 204). Bestaande routes: workspaces, folders, boards (+ `/full`, `/duplicate`, `/archive`, `/move`, `/favorite`, `/members`, `/groups`, `/columns`, `/views`, `/activity`), groups, columns, items (+ `/move`, `/duplicate`, `/archive`, `/restore`, `/values`, `/values/:columnId`, `/subitems`, `/updates`, `/activity`), updates (+ `/like`, `/pin`), views, users (+ `/me`), teams, nav. Nieuwe routes alleen voor je eigen entiteiten; wijzig nooit het gedrag van bestaande routes.

### Auth

E-mail + wachtwoord (scrypt, `src/lib/auth/password.ts`), sessiecookie `weekend_session` (JWT via jose, 14 dagen), `src/proxy.ts` stuurt anonieme bezoekers naar `/login` (API: 401). `getCurrentUser()` / `requireUser()` voor server components, `getActor(req?)` voor routes. **API-tokens**: registreer een resolver met `setBearerResolver()` (`src/lib/auth/bearer.ts`) via een importregel in `src/lib/auth/bearer-resolvers.ts`; de `platform`-agent koppelt dat aan de `api_tokens`-tabel. `Authorization: Bearer <token>` wordt dan door `getActor` en de proxy geaccepteerd.

## 6. Registries: uitbreidpunten met uitgewerkt voorbeeld

Elke registry is een array met een regel per type en een marker `// <- add new ... above this line`. Een module voegt een eigen bestand toe en **een import plus een regel**.

### 6.1 Kolomtype toevoegen (voorbeeld: `rating`)

Een kolomtype bestaat uit **twee bestanden**, omdat de logica ook op de server draait en de UI alleen in de browser (React-componenten en hooks mogen niet in een server-bundel).

**Server** `src/server/columns/rating.ts` (puur, geen React, geen db):

```ts
import { ValidationError } from "../../lib/errors";
import { NUMBER_OPS, testNumber } from "./ops";
import type { ColumnLogic } from "./types";

export type RatingValue = { rating: number };

export const ratingColumn: ColumnLogic<RatingValue> = {
  type: "rating",                         // = columns.type
  label: "Rating",
  category: "numbers",
  icon: "Favorite",                       // naam uit @vibe/icons
  defaultSettings: () => ({ max: 5 }),
  validate(input, column) {               // gebruikers-/API-invoer -> opgeslagen waarde (null wist)
    if (input === null || input === undefined || input === "") return null;
    const n = Number(typeof input === "object" ? (input as { rating?: unknown }).rating : input);
    const max = Number(column.settings.max ?? 5);
    if (!Number.isInteger(n) || n < 0 || n > max) throw new ValidationError(`Rating must be 0-${max}`);
    return n === 0 ? null : { rating: n };
  },
  serialize: (v) => v,                    // opgeslagen -> API (`value`)
  format: (v) => (v ? String(v.rating) : ""),   // tekst voor zoeken, export, activity log
  filter: { operators: NUMBER_OPS, test: (v, op, operand) => testNumber(v?.rating ?? null, op, operand) },
  sortKey: (v) => v?.rating ?? null,      // optioneel
  summarize: (vals) => { const n = vals.filter(Boolean) as RatingValue[]; return n.length ? { text: (n.reduce((a, b) => a + b.rating, 0) / n.length).toFixed(1) } : null; },
};
```

Registreer: in `src/server/columns/registry.ts` een import en `ratingColumn,` in `definitions`. Onbekende types vallen terug op `fallback.ts` (waarde als JSON), dus een type zonder implementatie breekt nooit. Computed types (mirror, formula, progress, auto number...) komen in `src/server/columns/computed/` en zijn `readOnly: true`.

**Client** `src/components/columns/rating.tsx`:

```tsx
"use client";
import type { ColumnUi } from "./types";

export const ratingUi: ColumnUi<{ rating: number }> = {
  align: "center",
  defaultWidth: 120,
  Cell: ({ value, onChange, readOnly, column }) => (
    <div>{[1, 2, 3, 4, 5].map((n) => (
      <button key={n} disabled={readOnly} onClick={(e) => { e.stopPropagation(); onChange(n === value?.rating ? null : n); }}>
        {n <= (value?.rating ?? 0) ? "★" : "☆"}
      </button>))}
    </div>
  ),
  // Editor?: ComponentType<EditorProps>  voor popover/inline bewerken (zie status.tsx, text.tsx)
};
```

Registreer in `src/components/columns/registry.ts` (import + `rating: ratingUi,`). Cells en editors sturen **ruwe invoer** (wat `validate` accepteert); de server valideert. Vergeet de i18n-sleutel `column.type.rating` niet (nl + en). Referentie-implementaties: `src/server/columns/{text,long_text,numbers,status,date,people,checkbox,dropdown,link}.ts` en `src/components/columns/*.tsx`. Test met een Vitest-bestand in `tests/columns/`.

### 6.2 View toevoegen (kanban, calendar, ...)

1. Server: `src/server/views/kanban.ts` exporteert een `ViewTypeDefinition` (`type`, `label`, `icon`, `description`, `defaultSettings()`); import + regel in `src/server/views/registry.ts`. Dit voedt het `+`-menu in de view-tabs en `views.create`.
2. Client: `src/components/views/kanban-view.tsx` met een component dat `ViewProps` krijgt (`board`, `view`, `viewState`, `actions`, `onOpenItem`, ...) en import + regel in `src/components/views/registry.tsx`.
3. Pas `viewState` (zoeken, persoon, filters, sortering) toe met `buildRenderGroups` / `itemMatches` uit `src/lib/view-state.ts`, dan werkt de toolbar in jouw view. Wijzigingen via `actions` (optimistisch + REST) en `setViewState`. Viewinstellingen opslaan: `PATCH /api/v1/views/:id` (`settings`, `filters`, `sort`).

### 6.3 Widget toevoegen (dashboards, module B)

Het dashboard-registry hoort bij de `boards-extra`-agent: `src/modules/dashboards/widgets/registry.ts` met per widget `{ type, label, defaultSettings, configSchema (zod), Component, query(actor, settings) }`. Zelfde patroon als 6.1/6.2: eigen bestand per widget plus een regel in de registry; data altijd via services. Tabellen in `src/db/schema/dashboards.ts`.

### 6.4 Automation-blok toevoegen

`src/server/automations/blocks/<id>.ts` exporteert een `AutomationBlock` (`kind: "trigger" | "condition" | "action"`, `configSchema`, `matches/evaluate/run`); import + regel in `src/server/automations/blocks/registry.ts`. Een actie voert werk uit **via services** met een `systemActor(accountId, "automation")` en nooit rechtstreeks op de database. Triggers luisteren op het event-type uit `src/lib/events.ts`.

### 6.5 MCP-tool toevoegen

`src/server/mcp/tools/<module>.ts` exporteert `McpToolDefinition[]` (`name`, `description`, zod `inputSchema`, `handler(actor, input)` die services aanroept); spread in `src/server/mcp/tools/registry.ts`. De MCP-route (platform) exposeert alles uit de registry.

- **Annotations**: `tools/list` geeft per tool `annotations` (`title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint: false`) via `toolAnnotations()` in `src/server/mcp/util.ts`. Standaard geraden uit de naam (`get_/list_/read_...` = read-only, `delete_/remove_/archive_/purge_` = destructive, `update_/change_/move_/set_` = idempotent); overschrijf met `readOnly`, `destructive`, `idempotent` en `title` op de definitie.
- **Scope**: `guardInputScope` checkt alleen top-level ids (`board_id`, `item_id`, ...). Ids die genest zitten (bulk-`updates`) of via een ander object lopen (update, group zonder board, doc) checkt de handler zelf met `assertItemInScope`/`assertBoardInScope`/`assertWorkspaceInScope`.
- **Modules**: `platform-boards` (CRUD), `platform-data` (bulk items, subitems, groups, `update_column`, `get_full_board_data`, updates bewerken/verwijderen, `undo_action`), `platform-more` (teams, docs, dashboards, tijdregistratie), `dev-requests`.
- **`request_change` / `list_change_requests`** (`dev-requests.ts`): Claude-gebruikers dienen een feature/bug/chore voor deze app in. Item op het bord uit env `CHANGE_REQUEST_BOARD_ID`, anders het Weekend dev-takenbord (`Taken` in workspace `Development`); type/prioriteit worden op de kolommen `type`/`prioriteit` gezet als ze bestaan, de omschrijving wordt de eerste update. Status `Backlog` = nieuw, **`Ready` = goedgekeurd, mag door een geautomatiseerde Claude-routine opgepakt worden** (daarna `In progress` -> `Review`, `Blocked` bij vragen). Testen: `tests/mcp/`.

### 6.6 Navigatie-item (rail / zijbalk)

`src/components/shell/nav-registry.ts`: voeg een `NavItem` toe (`id, labelKey, icon, href, section: "rail" | "sidebar-top", order`) en maak de pagina `src/app/(app)/<route>/page.tsx` (die valt vanzelf onder de `AppShell`).

### 6.7 Itempaneel-tab en board-acties

- Itempaneel: `src/components/item-panel/` (tabs Updates / Files / Activity Log; het item staat in de URL als `?item=<id>`, dus links werken). Nieuwe tab = `<naam>-tab.tsx` met een component dat `PanelTabProps` krijgt (`board`, `item`, `canEdit`, `canComment`, `refreshKey`) plus een regel in `PANEL_TABS` in `item-panel/tabs.ts`.
- Boardstate op de client: `src/components/board/use-board.ts` (`useBoard`) bewaart de `BoardFull`-snapshot, biedt optimistische `BoardActions` (createItem, setValue, moveItem, createGroup, createColumn, createView ...) over de REST-API en ververst via SSE. Nieuwe acties daar additief toevoegen; views krijgen ze als `actions` in `ViewProps`.
- Toolbar-popovers (Filter, Sort, Hide, Group by) staan in `src/components/board/toolbar-popovers.tsx`; `table-ux` breidt ze daar uit.

## 7. UI-richtlijnen en Vibe-valkuilen

- UI-bibliotheek is `@vibe/core` + `@vibe/icons` (Vibe design system, versie 4: controleer props in `node_modules/@vibe/*/dist/**/*.d.ts`, bijvoorbeeld `aria-label` en `ModalFooter primaryButton={{ text, onClick }}`). Eigen stijl via CSS modules (`*.module.css`) en de variabelen uit `src/app/globals.css` (`--app-*`) en Vibe-tokens (`--primary-color` ...). Tailwind alleen voor layouthulp.
- Alles met hooks of Vibe-componenten is een client component (`"use client"`). Vibe injecteert zijn CSS bij het laden van het component (kort ongestijld flitsje bij SSR is normaal).
- **Vibe `Modal` crasht tijdens SSR** (`document is not defined`): render hem alleen als hij open is (`NamePrompt` doet dat). Vibe `Dropdown` geeft een hydratiefout als hij server-side rendert: mount hem client-side (`useIsClient()` uit `src/lib/use-persistent-state.ts`).
- Vibe logt in dev "Accessing element.ref was removed in React 19" (library-ruis). Filter die in console-checks van e2e-tests (zie `collectConsoleErrors` in `e2e/fixtures.ts`).
- `next.config.ts`: `cacheComponents` staat uit (alles is request-time achter een login); de Tailwind-loader draait alleen voor bestanden die `@import "tailwindcss"` bevatten, anders worden CSS modules stuk gemaakt; `better-sqlite3` staat in `serverExternalPackages`; `distDir` komt uit `NEXT_DIST_DIR`.
- Vermijd JSX binnen `try/catch` in server components (lint-regel): bereken de data in een helper en render daarna.
- `next dev` voegt zelf `<distDir>/types/**` toe aan `tsconfig.json`. Staan er stale dist-mappen van andere agents in `include`, haal die dan weg; `npm run typecheck` moet schoon blijven.

## 8. i18n

`src/lib/i18n/nl.ts` (standaard) en `en.ts` (zelfde sleutels, getypeerd via `MessageKey`). Platte sleutels met een prefix per module (`shell.*`, `board.*`, `table.*`, `panel.*`, `column.*`, `filter.*`, `auth.*`). Client: `const t = useT()` (`@/lib/i18n/client`, provider staat in de `AppShell`); server: `translate(locale, key, vars)`. Voeg je eigen prefixblok onderaan toe in beide bestanden. Producttermen (Board, Group, Item, Update, Workspace) blijven Engels.

## 9. Tests

- **Vitest** (`npm test`, `tests/**/*.test.ts`): `tests/helpers.ts` geeft per test een verse in-memory database met seed en kant-en-klare actors (`admin`, `member`, `viewer`, `guest`, `sys`, `boardId`). Gebruik `freshCtx()` in `beforeEach` en test services rechtstreeks. Voorbeelden: `tests/services/items.test.ts`, `tests/services/permissions.test.ts`, `tests/columns/logic.test.ts`.
- **Playwright** (`npm run test:e2e`, specs in `e2e/<module>/*.spec.ts`): `playwright.config.ts` start `next dev` op `E2E_PORT` met eigen database en dist-map. `e2e/fixtures.ts`: `resetDb(request)` (leeg + seed, ~1 s, via `POST /api/test/reset`), `login(page, "admin")` (via API, snel), `loginViaUi`, `openBoard(page, "Klanten")`, `newUserPage(browser, baseURL, "pm1")` voor realtime-tests met twee contexten, `collectConsoleErrors(page)`. Elke feature krijgt een spec; console-fouten laten de test falen. Referentie: `e2e/smoke.spec.ts`.
- Vaste `data-testid`s voor de tabel: `board-page`, `board-title`, `item-row` (+ `data-item-id`, `data-item-name`), `cell-<kolomkey>`, `add-item`, `add-item-input`, `new-item-button`, `status-option`, `item-panel`, `tab-updates|files|activity`, `update-editor`, `update-submit`, `update-card`, `summary-row`, `toolbar-*`.

## 10. Handleidingen

Markdown in `docs/handleiding/NN-naam.md` (Nederlands, Engelse producttermen). Screenshots maakt een spec in `e2e/manuals/<naam>.spec.ts` (draait met `npm run manuals`, schrijft naar `docs/handleiding/img/`). Zie `IMPLEMENTATION_PLAN.md` §8.

## 11. AI-module (Sidekick, magic, AI-blokken, agents, Notetaker)

Eigenaar: `ai`. Alle LLM-verkeer gaat door **een** laag; zonder `ANTHROPIC_API_KEY` is AI uit en tonen alle schermen "AI niet geconfigureerd" (Notetaker, Daily Briefer, Sprint Reporter en Hours Checker werken dan nog deterministisch).

| Onderdeel | Plek |
|---|---|
| LLM-client (`@anthropic-ai/sdk`, mockbaar, JSON-helper) | `src/server/ai/llm.ts`. Env: `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `AI_MODEL` (standaard `claude-sonnet-5-5`). Tests injecteren een client met `setLlmClient()`; e2e wijst de server via `POST /api/test/ai` (alleen `E2E_RESET=1`) naar een lokale mock |
| Gemeterde aanroep, credits, noodstop, instellingen | `src/server/services/ai-core.ts` (`callLlm`/`callJson` zijn de enige ingang; 1 credit = 1000 gewogen tokens, output x5; limieten per gebruiker en account per maand; `ai_settings`, `ai_usage`) |
| Tools voor Sidekick en agents (roepen dezelfde services aan) | `src/server/ai/tools.ts`. Resultaten gaan als `<tool_data>` terug naar het model (data, nooit instructies) |
| Sidekick (SSE, gesprekken, bevestigingskaarten) | `services/ai-sidekick.ts`, `POST /api/v1/ai/chat`; schrijfacties worden pas bij `POST /api/v1/ai/actions/:id/confirm` uitgevoerd, als de gebruiker |
| Weekend magic | `services/ai-magic.ts` (preview, daarna `create` via boards/columns/groups/items) |
| AI-blokken en autofill | `services/ai-blocks.ts` + automation-acties `ai_*` in `src/server/automations/blocks/ai.ts`; kolommenu-item "AI autofill" |
| Natuurlijke taal -> automation/workflow | `services/ai-automations.ts` (`ai.nl.*`), valt terug op `automations.planFromText` |
| Agents | tabellen `agents, agent_triggers, agent_skills, agent_knowledge, agent_runs` (`src/db/schema/ai.ts`), `services/agents.ts`, runner `src/server/ai/agent-runner.ts`, events/schema `agent-engine.ts`, sjablonen `agent-templates.ts`, native agents `agent-native.ts` |
| Agent-actor | `Actor.agent = { id, grants }`; `decide()` roept `src/lib/agent-permissions.ts` aan: alleen toegekende boards, schrijven = items/waarden/updates, nooit structuur of beheer |
| Notetaker | `services/notetaker.ts`, tabel `meetings`, pagina `/notetaker`; verslag als doc in de klant-workspace, taken pas na bevestigen |
| UI | `src/modules/ai/*` (Sidekick-paneel via rail-event `weekend:sidekick-toggle`, `/sidekick`, `/agents`, `/agents/:id`, `/notetaker`, `/admin/ai`); rail-items in `components/shell/nav-items/ai.ts` (`NavItem.action` = window-event i.p.v. link) |
| MCP | `manage_agent*`, `agent_catalog`, `get_notetaker_meetings` in `src/server/mcp/tools/platform-extra.ts` |

Tests: `tests/ai/*` (Vitest, `ScriptedLlm` in `tests/ai/mock-llm.ts`), `e2e/ai/` (Playwright tegen `e2e/ai/mock-anthropic.ts`).

## 12. OAuth voor de MCP-server (Claude-connectors)

Eigenaar: `oauth`. Laat claude.ai (web, Desktop, mobiel) en Claude Code verbinden met `/api/mcp` zonder geplakt token.

| Onderdeel | Plek |
|---|---|
| Tabellen `oauth_clients, oauth_grants, oauth_codes, oauth_tokens` (codes/tokens alleen als sha256) | `src/db/schema/oauth.ts`, migraties `src/db/migrations/oauth/` |
| Alle logica: DCR, authorize-validatie, consent (`approve`), token-endpoint (code + PKCE S256, roterende refresh tokens, hergebruik = grant ingetrokken), revoke, Bearer-resolutie, Gekoppelde apps | `src/server/services/oauth.ts` |
| Discovery | `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource[/api/mcp]`; de 401 van `/api/mcp` wijst ernaar via `WWW-Authenticate: resource_metadata=` |
| Endpoints | `POST /api/oauth/register` (rate limit per IP), `POST /api/oauth/token`, `POST /api/oauth/revoke`, consentpagina `/oauth/authorize` + `POST /api/oauth/authorize` (sessie + Origin-check) |
| Bearer | `src/server/oauth/token-resolver.ts` (geregistreerd in `bearer-resolvers.ts`). Access tokens (`mno_at_`, 1 uur) geven een Actor met `actor.token = { id: grantId, scopes, workspaceIds }`, dus scopes, workspace-beperking, rate limits en audit werken als bij API-tokens |
| UI | Beheer > API > tabblad MCP: connector-instructies + Gekoppelde apps (`src/modules/oauth/connected-apps.tsx`, `GET/DELETE /api/v1/oauth-grants`) |
| Env | Issuer = `PUBLIC_URL`, anders `APP_URL`. `OAUTH_REDIRECT_HOSTS` (standaard `claude.ai,claude.com`; loopback altijd toegestaan), `OAUTH_REGISTER_PER_HOUR` |

Tests: `tests/oauth/oauth.test.ts`.

## 13. Wispr Flow-meetings (module wispr)

De app is een **MCP-client** van de Wispr Flow remote MCP-server (`https://api.wisprflow.ai/connect/mcp`, env `WISPR_MCP_URL`). Elke gebruiker koppelt zijn eigen Wispr-account op `/meetings` (rail-item "Meetings").

| Onderdeel | Plek |
|---|---|
| OAuth 2.1-client (discovery, dynamic client registration, PKCE, refresh, `resource`) + streamable-HTTP MCP-sessie | `src/server/wispr/client.ts` (netwerk vervangbaar met `setWisprFetch()` in tests) |
| Wispr-output -> eigen vormen (tolerant voor veldnamen) | `src/server/wispr/normalize.ts` |
| Service: koppelen, `sync` (search_meetings), detail (get_meeting), `setPersonal`, `save` | `src/server/services/wispr.ts`, tabellen `wispr_connections` (tokens gesealed) en `wispr_meetings` |
| Routes | `/api/v1/wispr` (status, DELETE = ontkoppelen), `/connect`, `/callback` (redirect-URI `${APP_URL}/api/v1/wispr/callback`), `/sync`, `/meetings`, `/meetings/:id`, `/meetings/:id/save`, `/meetings/:id/personal` |

Opslaan maakt een Notetaker-meeting (notities + Wispr-samenvatting + transcript), het gespreksverslag als doc in de gekozen workspace en, als er een item gekozen is, een update op dat item. Niets gaat automatisch: persoonlijke meetings blijven in Wispr. Wispr-meetings zijn privé per gebruiker (ook voor admins). Vervolg (Google Calendar-koppeling, auto-sync, Gmail, Slack) staat als tickets op het Taken-board (epic "Meeting- en communicatie-integraties").

## 14. Beslissingen

Ontwerpkeuzes met context, alternatieven en bronnen staan in `docs/decisions/NNNN-<onderwerp>.md`. Nieuwe keuze: volgend nummer, zelfde opbouw (vraag, besluit, waarom, gevolgen, bronnen).

- [0001: Klant > opdracht (epic) > taak in Weekend dev](decisions/0001-klant-opdracht-epic.md): de klant van een taak komt van zijn epic; het sprintbord groepeert per klant en epic.
- [0002: Levenscyclus van epics](decisions/0002-epic-levenscyclus.md): de epic-status volgt de taken (Gepland/Actief/Afgerond), Geparkeerd blijft handmatig; afgeronde en geparkeerde epics zijn standaard verborgen.
- [0003: Sprint-historie per taak](decisions/0003-sprint-historie.md): `sprint_items` houdt elke sprint van een taak bij ; tab "Sprints" in het item-paneel en teller ↻n.
