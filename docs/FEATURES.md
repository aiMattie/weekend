# Weekend featurelijst (roadmap)

Doel: een compleet work OS, plus eigen uitbreidingen zoals een MCP-server. Opgesteld op 2026-10-06.

**Legenda**
- Fase `P0` = kern (MVP), `P1` = volwassen werkbeheer, `P2` = producten en AI, `P3` = enterprise en ecosysteem.
- `[ ]` = nog niet gebouwd.
- `†` = nog niet uitgewerkt. Controleer vóór het bouwen.

---

## 1. Structuur en datamodel (P0)

- [ ] Account met gebruikers en teams
- [ ] Workspaces (open en gesloten)
- [ ] Folders in workspaces
- [ ] Boards (main, shareable, private)
- [ ] Groups binnen een board (kleur, inklappen, verplaatsen)
- [ ] Items en subitems
- [ ] Updates (comments en replies per item), met @mentions
- [ ] Item-detailpaneel met tabs (updates, files, activity log)
- [ ] Activity log per board en item
- [ ] Board templates en workspace templates
- [ ] Items dupliceren, verplaatsen, archiveren en verwijderen (met prullenbak)
- [ ] Zoeken over boards, docs, forms en folders
- [ ] Favorieten, recent bezocht en inbox
- [ ] Tags

## 2. Column types (P0 / P1)

**Schrijfbaar**
- [ ] Name (P0)
- [ ] Status (P0)
- [ ] Text (P0)
- [ ] Long text (P0)
- [ ] Numbers (P0)
- [ ] People (P0)
- [ ] Date (P0)
- [ ] Timeline (P0)
- [ ] Dropdown (P0)
- [ ] Checkbox (P0)
- [ ] Tags (P0)
- [ ] Link (P0)
- [ ] Email (P0)
- [ ] Phone (P0)
- [ ] Files (P0)
- [ ] Subitems / `subtasks` (P0)
- [ ] Connect boards / `board_relation` (P1)
- [ ] Dependency (P1)
- [ ] Rating (P1)
- [ ] Vote (P1)
- [ ] Week (P1)
- [ ] Hour (P1)
- [ ] World clock (P1)
- [ ] Time tracking (P1)
- [ ] Location (P1)
- [ ] Country (P1)
- [ ] Color picker (P1)
- [ ] Button (P1)
- [ ] Doc (P1)

**Alleen lezen of berekend**
- [ ] Formula (P1)
- [ ] Mirror (P1)
- [ ] Progress tracking (P1)
- [ ] Auto number (P1)
- [ ] Item ID (P1)
- [ ] Creation log (P1)
- [ ] Last updated (P1)
- [ ] Item assignees (P1)
- [ ] Integration-column (beheerd door integraties, P2)

**Kolomgedrag**
- [ ] Status labels met eigen kleuren en indexen
- [ ] Kolomsamenvattingen onderaan (som, gemiddelde, verdeling)
- [ ] Kolompermissies (zien en bewerken per rol)
- [ ] Kolom verbergen, vastpinnen, hernoemen, verplaatsen
- [ ] Column center (kolommen zoeken en toevoegen op categorie) †
- [ ] AI-kolommen (samenvatten, categoriseren, vertalen, uitlezen) (P2)

## 3. Views (P0 / P1)

- [ ] Table (P0)
- [ ] Kanban (P0)
- [ ] Calendar (P1)
- [ ] Timeline (P1)
- [ ] Gantt met dependencies (P1)
- [ ] Workload (P1)
- [ ] Cards (P1)
- [ ] Chart (P1)
- [ ] Map (P2)
- [ ] Files gallery (P2)
- [ ] Form view (P1)
- [ ] Doc view (P2)
- [ ] Meerdere views per board, met tabs
- [ ] Filters, sorteren, groeperen en zoeken per view
- [ ] Opgeslagen views en persoonlijke filters
- [ ] Custom views vanuit apps (P3)

## 4. Dashboards en widgets (P1)

Cross-board rapportage is de kern.

- [ ] Dashboard aanmaken op één of meer boards
- [ ] Chart (taart, staaf, lijn, gestapeld)
- [ ] Numbers
- [ ] Battery (voortgang)
- [ ] List
- [ ] Timeline en Gantt
- [ ] Workload
- [ ] Calendar
- [ ] Files
- [ ] Text, embed en andere hulpwidgets
- [ ] Dashboard-filters en cross-board koppelingen
- [ ] Dashboard delen, vergrendelen en op TV tonen †
- [ ] Widgets van apps (P3)

## 5. Automations, workflows en integraties

**Automations (P1)**
- [ ] Recipes: trigger, optionele condition, action (kant-en-klare recepten)
- [ ] Custom recipe builder
- [ ] Automation Center
- [ ] Triggers: status verandert, datum bereikt, item aangemaakt, kolomwaarde verandert, persoon toegewezen, subitem aangemaakt of klaar, button geklikt, terugkerend schema
- [ ] Acties: notificatie of e-mail sturen, persoon toewijzen, waarde wijzigen, item aanmaken (ook op ander board), verplaatsen naar groep, subitem aanmaken, webhook sturen
- [ ] Dependency- en timeline-automations
- [ ] Automation-limieten per plan en gebruiksteller
- [ ] Automations activeren, uitzetten en verwijderen (ook via MCP)

**Workflows (P2)**
- [ ] Visuele workflow builder (stappen, vertakkingen, goedkeuringen)
- [ ] Workflow plannen, concept bewaren en publiceren
- [ ] AI-workflows (meerstaps, door AI uitgevoerd)

**Integraties (P2 / P3)**
- [ ] Integrations Center
- [ ] Voorbeelden: Slack, Gmail, Google Drive, Microsoft Teams, Jira, GitHub, GitLab, Bitbucket, CircleCI
- [ ] Inkomende en uitgaande webhooks
- [ ] Zapier en Make-achtige connectors †
- [ ] Integratie-framework met recipe sentences, triggers, acties en field mapping

## 6. WorkForms (P1)

- [ ] Formulier bouwen met vraagtypes die op kolommen mappen
- [ ] Achterliggend board per formulier
- [ ] Wachtwoord, tags, openbare link, embed
- [ ] Voorwaardelijke logica †
- [ ] Inzendingen via API of MCP
- [ ] Branding en thankyou-pagina †

## 7. Docs, bestanden, whiteboard (P1 / P2)

- [ ] WorkDocs: blokken-editor, op workspace-niveau of aan een item
- [ ] Doc-actions voor automations en apps
- [ ] Bestanden uploaden met presigned URL (2 stappen: upload-url, daarna afronden)
- [ ] Bestandsvoorbeeld, versies, bestandsgalerij
- [ ] Whiteboard / canvas †
- [ ] Doc-commentaar en @mentions †

## 8. Samenwerking (P0 / P1)

- [ ] Realtime updates tussen gebruikers
- [ ] Notificaties in de app (bell) en per e-mail, met voorkeuren
- [ ] Inbox
- [ ] @mentions en antwoorden
- [ ] Gasten (extern, beperkte toegang) en gastlimieten per plan
- [ ] Gedeelde boards, private boards
- [ ] Reacties (likes, emoji) †
- [ ] Teams als groep om aan toe te wijzen

## 9. Resource-, portfolio- en tijdbeheer (P1 / P2)

- [ ] Workload en capaciteitsplanning, overbelasting zien, slepen om te herbalanceren
- [ ] Portfoliobeheer: voortgang, afhankelijkheden, risico's over projecten heen
- [ ] Time tracking per item en tijdlogs
- [ ] Goedkeuringsstromen †
- [ ] Budget en kosten †
- [ ] Rapportage over werkelijke versus geplande uren †

## 10. Aparte producten (P2)

**CRM**
- [ ] Standaard boards: Contacts, Deals, Leads, Accounts, Activities
- [ ] Pipeline en deal-stages
- [ ] Leadcapture via formulier of integratie
- [ ] E-mailsync en e-mailtracking (geopend en beantwoord)
- [ ] Offertes en facturen (aanmaken, versturen, volgen)
- [ ] Forecasting (waarde, kans, voorspeld versus werkelijk)
- [ ] Activiteiten (gesprekken, meetings)
- [ ] Lead routing en opvolg-herinneringen
- [ ] Mass e-mail en sequences †

**Weekend dev**
- [ ] Sprints (Scrum en Kanban boards)
- [ ] Roadmaps en feature backlog
- [ ] Bugtracking met tijd-tot-oplossing
- [ ] Git-koppeling: commits, pull requests en branches aan taken
- [ ] Retrospectives (Keep, Improve, Discussion, met voten)
- [ ] Releaseplanning en prioritering
- [ ] Sprintsamenvatting en sprintmetadata (ook via MCP)
- [ ] AI-dagelijkse standups

**Service**
- [ ] Ticketing met prioriteit, assignee, categorie
- [ ] SLA-beheer
- [ ] Klantenportaal voor tickets
- [ ] Automatische routing en triage
- [ ] Kennisbank met agent die verouderde artikelen markeert
- [ ] AI-service-agent die standaardverzoeken zelf oplost
- [ ] ITSM-use cases (toegang, wachtwoordreset)

**Campaigns**
- [ ] E-mailcampagnes bouwen, versturen en optimaliseren
- [ ] Segmentatie en AI-ondersteuning

## 11. AI (P2)

- [ ] Sidekick: AI-assistent die context van boards, statussen, docs en gesprekken kent
- [ ] Weekend magic: complete boardstructuur genereren uit een beschrijving
- [ ] Vibe: apps en workflow-ervaringen bouwen met natuurlijke taal
- [ ] Agents: aanmaken, activeren, uitvoeren, met triggers, skills en toegang tot boards en docs
- [ ] Kant-en-klare agents: Lead Scorer, Ticket Assignment, Risk Analyzer, Meeting Summarizer
- [ ] AI Blocks in automations en autofill (categoriseren, vertalen, samenvatten, extraheren)
- [ ] Notetaker: meetingnotities, samenvattingen en actiepunten
- [ ] Creditsysteem voor AI-gebruik

## 12. Platform, API en MCP (P1 / P3)

**API en ontwikkeling**
- [ ] GraphQL API met objecten: boards, columns, items, groups, updates, users, teams, workspaces, folders, docs, webhooks, tags, assets, activity logs
- [ ] Schema-introspectie
- [ ] Webhooks
- [ ] Rate limits en dagelijkse API-budgetten
- [ ] OAuth-apps en API-tokens
- [ ] Apps-framework: board column extension, board menu, column view, custom views, account settings view, administration view, doc actions, custom objects, storage API, automation blocks, recipe sentences, cron jobs, AI assistant en Sidekick tools, workspace templates
- [ ] App marketplace en installatie per account

**Platform MCP (60+ tools)**

Gehost op `/api/mcp`. Auth via API-token, OAuth-app of dynamic client registration. Toolgroepen:
- Boards en items: `create_board`, `get_board_info`, `get_board_items_page`, `get_board_activity`, `board_insights`, `create_group`, `create_column`, `get_column_type_info`, `create_item`, `change_item_column_values`
- Workspaces: `create_workspace`, `update_workspace`, `list_workspaces`, `workspace_info`, `create_folder`, `update_folder`, `move_object`
- Docs: `create_doc`, `update_doc`, `read_docs`
- Dashboards: `create_dashboard`, `create_widget`, `all_widgets_schema`
- Views: `create_view`, `update_view`, `create_view_table`, `update_view_table`
- Forms: `create_form`, `get_form`, `update_form`, `form_questions_editor`, `create_form_submission`
- Gebruikers: `get_user_context`, `list_users_and_teams`
- Updates en notificaties: `create_update`, `get_updates`, `create_notification`
- Zoeken en assets: `search`, `get_assets`, `get_asset_upload_url`, `finalize_asset_upload`
- Automations en workflows: `list_automations`, `manage_automations`, `create_automation`, `plan_workflow`, `create_workflow`, `update_workflow`, `publish_workflow`
- Agents: `manage_agent`, `manage_agent_triggers`, `manage_agent_skills`, `manage_agent_knowledge`, `agent_catalog`
- Meetings: `get_notetaker_meetings`
- Sprints: `get_weekend_dev_sprints_boards`, `get_sprints_metadata`, `get_sprint_summary`
- API en schema: `all_weekend_api`, `get_graphql_schema`, `get_type_details`
- UI-componenten: `show_table`, `show_chart`, `show_battery`, `show_assign`
- Tool-aanroepen tellen mee voor het dagelijkse API-limiet

**Eigen uitbreidingen**
- [ ] Eigen MCP-server (HTTP) met bovenstaande toolgroepen
- [ ] Apps MCP: apps beheren via AI
- [ ] MCP-auth met tokens per gebruiker en per workspace
- [ ] Auditlog van MCP-aanroepen

## 13. Beheer, beveiliging en plans (P3)

- [ ] Rollen: account, workspace, board en kolom, plus custom account roles
- [ ] SAML 2.0 SSO, Google-login, tweefactorauthenticatie
- [ ] SCIM-provisioning
- [ ] Auditlog met API-toegang
- [ ] IP-restricties
- [ ] Panic button (account vergrendelen)
- [ ] Geavanceerde gastpermissies
- [ ] HIPAA en compliance-opties
- [ ] Plans: Free, Basic, Standard, Pro, Enterprise (limieten op gasten, automations, integraties, views)
- [ ] Facturering en seats †
- [ ] Data-export en backup †

## 14. Clients (P3)

- [ ] Responsief web
- [ ] Mobiele app (iOS en Android), formulieren en dashboards op mobiel
- [ ] Desktop-app †
- [ ] Offline-modus †

---

## Voorgestelde bouwvolgorde

1. **P0:** auth, accounts, workspaces, boards, groups, items, subitems, basis-columns (status, tekst, nummers, people, datum, timeline, dropdown, checkbox, files), Table en Kanban, updates, activity log. Direct een eerste MCP-server met `create_board`, `create_item`, `change_item_column_values`, `get_board_items_page`.
2. **P1:** overige columns, views, dashboards, automations, forms, docs, notificaties, workload, time tracking, GraphQL API en webhooks.
3. **P2:** workflows, integraties, AI (Sidekick, magic, agents, AI Blocks), CRM, dev, service.
4. **P3:** apps-framework, marketplace, enterprise-beheer, mobiel.
