# Handleiding Weekend

Handleiding voor gebruikers en beheerders van Weekend. Producttermen (Board, Group, Item, Update) blijven Engels; alles staat in korte stappen. Je leest dezelfde hoofdstukken in de app via het vraagteken rechtsboven (`/help`).

Begin bij [Aan de slag](00-aan-de-slag.md) als je nieuw bent. Wil je weten hoe je een team-werkwijze inricht, lees dan [Werkafspraken](14-werkafspraken.md).

## Inhoud

| Hoofdstuk | Waar gaat het over |
|---|---|
| [Aan de slag](00-aan-de-slag.md) | Inloggen, rondleiding van het scherm, snelstart met je eerste board, item, status en update, sneltoetsen |
| [Workspaces en boards](01-workspaces-en-boards.md) | Workspaces, folders en boards beheren; zoeken, filteren, sorteren, slepen, bulkacties, undo en het toetsenbord in de tabel |
| [Columns](02-columns.md) | Kolomtypes toevoegen en invullen, labels, kolommenu, boards koppelen, mirror en formules |
| [Views](03-views.md) | Kanban, Calendar, Timeline, Gantt, Workload, Cards, Chart, Map, Files gallery en Form |
| [Itempaneel, updates, Inbox en My work](04-itempaneel-en-updates.md) | Samenwerken in een item: updates, @vermeldingen, bestanden, activiteitenlogboek, Inbox en My work |
| [Automations, workflows en integraties](05-automations.md) | Recepten, eigen automations, logboek, workflows met goedkeuring, Integrations center en webhooks |
| [Dashboards](06-dashboards.md) | Dashboards met widgets over meerdere boards, filters, delen en TV-modus |
| [Forms, Docs en Whiteboards](07-forms-en-docs.md) | Formulieren voor aanvragen, documenten met blokken en het whiteboard |
| [Development](08-dev-sprints.md) | Sprints plannen, starten en afsluiten, burndown, epics, bugs, retrospectives, Git-koppeling en uren op taken |
| [Uren en Delivery](09-uren-en-delivery.md) | De workspace Delivery, uren schrijven in Urenregistratie, de klant-workspace en de checklist per klant |
| [MCP en API](10-mcp-en-api.md) | API-tokens, GraphQL-API, API-explorer, AI-assistenten verbinden via MCP en webhooks |
| [Import](11-import.md) | Gegevens uit monday.com overzetten met een dry-run, rapport en automatische synchronisatie |
| [Beheer, rechten en beveiliging](12-beheer-en-rechten.md) | Gebruikers, teams, gasten, rollen, rechten, beveiliging en auditlog |
| [AI: Sidekick, Weekend magic, agents en Notetaker](13-ai-sidekick-en-agents.md) | De AI-assistent, borden bouwen vanuit een beschrijving, AI-blokken, agents en gespreksverslagen |
| [Werkafspraken](14-werkafspraken.md) | Een voorbeeldwerkwijze voor een team als stappen in de app, plus de checklist per klant |
| [Veelgestelde vragen](15-veelgestelde-vragen.md) | Problemen oplossen, beperkingen, alle sneltoetsen en rollen |

## Voor beheerders en ontwikkelaars

- De hoofdstukken zijn Markdown-bestanden in `docs/handleiding/`; de schermafbeeldingen worden gegenereerd in `docs/handleiding/img/` (niet meegeleverd in de repository).
- `npm run manuals` maakt alle schermafbeeldingen opnieuw met Playwright (specs in `e2e/manuals/`).
- `npm run manuals:check` controleert dat alle links en afbeeldingen kloppen.
- `npm run manuals:pdf` maakt `docs/handleiding/handleiding.pdf` als Chrome of Chromium op de machine staat.
