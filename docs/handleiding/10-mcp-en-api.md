# MCP en API

Claude koppel je zonder token via **Mijn profiel > Claude koppelen** (zie hoofdstuk 4). Met een persoonlijk API-token koppel je scripts en andere AI-assistenten aan deze omgeving. Er zijn twee ingangen:

- **GraphQL-API** op `/api/graphql` (ook bereikbaar op `/api/v2`): de GraphQL-API van Weekend voor scripts en integraties.
- **MCP-server** op `/api/mcp`: meer dan 100 tools voor AI-assistenten.

Alles wat een token doet, gebeurt met jouw rechten: wat jij niet mag zien of wijzigen, kan het token ook niet.

## 1. Een API-token aanmaken

1. Open het **Admin center** (of de link **API en MCP** in de zijbalk als je geen beheerder bent) en kies **API en MCP**. Je komt op het tabblad **API-tokens**.
2. Klik op **Token aanmaken**.
3. Geef het token een **naam** die zegt waarvoor het dient, bijvoorbeeld `rapportage-script` of `Claude Code`.
4. Kies de **rechten**:
   - **Lezen**: alleen opvragen (queries, `get_*`, `list_*`, `search`).
   - **Schrijven**: ook aanmaken, wijzigen en verwijderen. Een token met alleen Lezen krijgt bij een mutation de fout `UserUnauthorizedException`.
5. Kies bij **Workspaces** of het token alles mag zien wat jij ziet, of alleen geselecteerde workspaces. Boards buiten die workspaces bestaan dan niet voor het token.
6. Vul eventueel een **dagbudget** (complexiteitspunten per dag) en een **vervaldatum** in. Leeg laten betekent de standaard van de server en nooit verlopen.
7. Klik op **Token aanmaken**.
8. **Kopieer het token direct** met de knop **Kopieer token**. Het begint met `wkd_` en wordt maar één keer getoond. In de database staat alleen een hash. Ben je het kwijt, trek het dan in en maak een nieuw token.
9. Klik op **Klaar**. In de lijst zie je het begin van het token, de rechten, de workspaces, wanneer het voor het laatst gebruikt is en hoeveel budget vandaag is verbruikt.

### Een token intrekken

1. Ga naar het tabblad **API-tokens**.
2. Klik bij het token op **Intrekken** en bevestig.
3. Het token werkt direct niet meer (HTTP 401). Het blijft in de lijst staan met de status **Ingetrokken**.

Beheerders zetten bovenaan de lijst **Tokens van iedereen tonen** aan om tokens van collega's te zien en in te trekken.

## 2. De GraphQL-API gebruiken

1. Zet de URL op `https://<jouw-omgeving>/api/graphql` (lokaal: `http://localhost:3058/api/graphql`).
2. Stuur het token mee in de header `Authorization`. Beide vormen werken: het kale token of `Bearer <token>`.
3. Optioneel: de header `API-Version` (bijvoorbeeld `2025-10`). Die wordt losjes gevolgd.

Voorbeeld:

```bash
curl -s http://localhost:3058/api/graphql \
  -H "Authorization: $WEEKEND_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ boards(limit: 5) { id name items_page(limit: 3) { cursor items { id name column_values { id text } } } } }"}'
```

Wat ondersteund wordt:

- **Queries**: `me`, `users`, `teams`, `workspaces`, `folders`, `boards`, `items`, `items_page_by_column_values`, `next_items_page`, `updates`, `assets`, `docs`, `webhooks`, `complexity`, en op een board `columns`, `groups`, `items_page`, `activity_logs`, `views`.
- **Paginering** met `items_page(limit, cursor, query_params)`. De `cursor` uit het antwoord geef je aan `next_items_page`. Is de cursor `null`, dan ben je klaar. Een cursor is 60 minuten geldig.
- **Filteren en sorteren** met `query_params: { rules: [{ column_id, compare_value, operator }], operator: and|or, order_by: [{ column_id, direction }] }`. Operatoren: `any_of`, `not_any_of`, `is_empty`, `is_not_empty`, `greater_than`, `lower_than`, `between`, `contains_text`, `starts_with`, `ends_with`, `within_the_next`, `within_the_last` en meer.
- **Mutations**: boards, groepen, kolommen (`create_column`, `create_status_column`, `create_dropdown_column`), items, subitems, kolomwaarden (`change_column_value`, `change_simple_column_value`, `change_multiple_column_values`), verplaatsen, dupliceren, archiveren, verwijderen, updates (met likes), workspaces, folders, webhooks, notificaties, docs en bestanden (`add_file_to_column`, multipart).
- **Kolomwaarden** als JSON, bijvoorbeeld `{"label":"Done"}` voor status, `{"date":"2026-10-12"}` voor datum en `{"personsAndTeams":[{"id":123,"kind":"person"}]}` voor personen. Met `create_labels_if_missing: true` worden onbekende status- en dropdownlabels aangemaakt.
- **Schema** als SDL op `/api/graphql/get_schema` en via introspectie.

### Limieten en foutmeldingen

- Elke query heeft een **complexiteit** (objecten tellen mee, lijsten vermenigvuldigen met hun `limit`). Vraag hem op met `complexity { query before after reset_in_x_seconds }`. De antwoordheaders `X-Complexity-Query` en `X-Daily-Budget-Remaining` tonen hetzelfde.
- Een te zware query geeft `ComplexityException`. Per minuut en per dag geldt een budget per token. Is dat op, dan krijg je HTTP 429 met de code `COMPLEXITY_BUDGET_EXHAUSTED` of `DAILY_LIMIT_EXCEEDED` en een `Retry-After`-header.
- Fouten staan in `errors[].extensions.code`, onder meer `InvalidBoardIdException`, `InvalidItemIdException`, `InvalidColumnIdException`, `ColumnValueException`, `UserUnauthorizedException`.
- Beheerders stellen de limieten in met de omgevingsvariabelen `API_DAILY_BUDGET`, `API_MINUTE_BUDGET`, `API_MAX_COMPLEXITY`, `API_REQUESTS_PER_MINUTE` en `API_MAX_DEPTH`.

## 3. De API-explorer

1. Open **API en MCP** en kies het tabblad **API-explorer**.
2. Kies een **voorbeeld** of typ zelf een query. Variabelen zet je als JSON in het veld eronder.
3. Klik op **Uitvoeren** (of druk op Ctrl+Enter). Rechts staat het antwoord, met de status, de complexiteit en het resterende dagbudget.
4. Onder de editor staat de lijst met alle queries en mutations. Klik op een naam om een startpunt in te vullen.

De explorer voert de query uit als jijzelf, met dezelfde limieten als een token.

## 4. Claude Code en andere AI-assistenten verbinden (MCP)

### Claude koppelen zonder token (aanbevolen)

Claude (claude.ai, Claude Desktop, de mobiele Claude-app en Claude Code) verbindt via OAuth: je logt één keer in en geeft toestemming. De stappen staan ook in de app onder **Mijn profiel > Claude koppelen**, met de juiste URL om te kopiëren.

**claude.ai, Claude Desktop en de Claude-app**

1. Open **Mijn profiel** (rechtsboven op je avatar) en kopieer bij **Claude koppelen** de **connector-URL**: `https://weekend.example.com/api/mcp`.
2. Open claude.ai en ga naar **Instellingen > Connectors**.
3. Klik op **Aangepaste connector toevoegen**, geef hem de naam `weekend` en plak de URL.
4. Klik op **Verbinden**. Je komt op deze omgeving terecht; log in als dat gevraagd wordt (wachtwoord of Google).
5. Op de toestemmingspagina kies je de rechten:
   - **Lezen** staat altijd aan.
   - **Schrijven** (aanmaken, wijzigen, verwijderen namens jou) kun je uitvinken.
   - Bij **Workspaces** kies je eventueel één workspace; standaard ziet Claude alles wat jij ziet.
6. Klik op **Toestaan**. Je gaat terug naar Claude en de connector staat op verbonden.
7. De connector werkt nu ook in Claude Desktop en de mobiele app. Zet hem per gesprek aan via het menu **Connectors**.

**Claude Code**

1. Voer uit: `claude mcp add --transport http weekend https://weekend.example.com/api/mcp`
2. Start Claude Code, typ `/mcp`, kies `weekend` en daarna **Authenticate**. Je browser opent dezelfde toestemmingspagina.

**Toegang intrekken**: **Mijn profiel > Gekoppelde apps > Intrekken**. Claude verliest direct de toegang. Beheerders zien hun gekoppelde apps ook op het tabblad **MCP** van **API en MCP**.

Claude werkt altijd met jouw rechten. Schrijvende acties komen in het auditlog, net als bij een token. Verwijderen en archiveren zijn als *destructief* gemarkeerd, zodat Claude eerst om bevestiging vraagt.

**Wensen of bugs voor deze app** kun je direct aan Claude doorgeven: *"Meld als bug dat ..."*. Claude gebruikt dan de tool `request_change` en zet een item op het board **Taken** in de workspace **Development**.

### Koppelen met een API-token

Voor scripts en clients zonder OAuth-ondersteuning:

1. Maak een token aan met **Lezen** en **Schrijven** (zie hoofdstuk 1). Wil je een assistent alleen laten meekijken, kies dan alleen **Lezen**. Beperk eventueel de **workspaces**.
2. Open het tabblad **MCP**. Daar staan de URL en kant-en-klare configuratie.
3. Zet het token in een omgevingsvariabele, bijvoorbeeld `export WEEKEND_TOKEN=wkd_...`.
4. **Claude Code**, optie A, met een commando:

   ```bash
   claude mcp add --transport http weekend http://localhost:3058/api/mcp \
     --header "Authorization: Bearer $WEEKEND_TOKEN"
   ```

   Optie B: kopieer `.mcp.json.example` uit de projectmap naar `.mcp.json` en pas de URL aan.
5. Start Claude Code opnieuw (of typ `/mcp`) en controleer dat `weekend` verbonden is.
6. Test met de vraag: *"Wie ben ik in Weekend en welke workspaces zie ik?"* De assistent gebruikt dan de tool `get_user_context`.
7. Voor andere clients: kies het transport **Streamable HTTP**, URL `https://<jouw-omgeving>/api/mcp` en de header `Authorization: Bearer <token>`.

### Wat de MCP-server biedt

- **Tools**: boards en items (`create_board`, `get_board_info`, `get_board_items_page`, `get_board_activity`, `board_insights`, `create_group`, `create_column`, `get_column_type_info`, `create_item`, `change_item_column_values`), workspaces en folders, docs, dashboards en widgets, views, forms, gebruikers en teams, updates en notificaties, `search`, bestanden (upload-URL en afronden), automations en workflows, agents, notetaker-meetings, sprints (Weekend dev), API-tools (`all_weekend_api`, `get_graphql_schema`, `get_type_details`) en UI-componenten (`show_table`, `show_chart`, `show_battery`, `show_assign`). Tools hebben zowel `snake_case`- als `camelCase`-parameters. Het tabblad MCP toont de volledige lijst, met per tool of hij leest of schrijft.
- **Resources**: elk board dat het token ziet is een resource (`weekend://boards/<id>`).
- **Prompts**: `weekly_status`, `sprint_report` en `board_overview`.
- **Veiligheid**: elk token heeft eigen rechten (Lezen/Schrijven) en kan tot workspaces beperkt worden. Schrijvende aanroepen komen in het **auditlog** van het Admin center, en op het tabblad **Aanroepen** zie je de laatste aanroepen met resultaat en duur.

### Bestanden uploaden via MCP

1. Vraag met `get_asset_upload_url` een tijdelijke uploadlink aan (voor een item of update).
2. Stuur de bytes met een `PUT` naar die link, met het bestandstype als `Content-Type`.
3. Rond af met `finalize_asset_upload`. Het bestand staat dan bij het item.

## 5. Webhooks beheren

1. Open het tabblad **Webhooks** (alleen voor beheerders).
2. Klik op **Webhook toevoegen**, kies een board (of het hele account), vul de URL in en kies de events (bijvoorbeeld `create_item`, `change_column_value`).
3. Bewaar het **geheim** van de webhook. Alle aanroepen zijn ondertekend met `X-Webhook-Signature`.
4. Per webhook zie je de afleverlog en kun je een mislukte aflevering opnieuw proberen.

Dezelfde webhooks maak je met de GraphQL-mutation `create_webhook(board_id, url, event, config)` en verwijder je met `delete_webhook(id)`.

## 6. Controle en veiligheid

1. Het tabblad **Aanroepen** toont je recente API- en MCP-aanroepen.
2. Beheerders vinden in het **Auditlog** (categorie API en Beveiliging) wanneer tokens zijn aangemaakt of ingetrokken en welke schrijvende MCP- en GraphQL-aanroepen zijn gedaan.
3. Trek een token direct in als het is gelekt. Zet het token nooit in code die je deelt; gebruik een omgevingsvariabele.
4. Vergrendelt een beheerder het account (paniekknop), dan werken alle tokens niet meer tot het account weer open is.

Beperkingen: alleen de hierboven genoemde queries en mutations bestaan; het schema op `/api/graphql/get_schema` is leidend. Een token is persoonlijk en werkt met jouw rechten; er is geen OAuth-flow voor apps van derden.
