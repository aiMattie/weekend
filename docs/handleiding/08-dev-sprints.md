# Development: sprints, backlog, bugs en retrospectives

Weekend dev bevat alles voor softwareteams: sprints, backlog, burndown, velocity, "Complete sprint", bugs met tijd tot oplossing, retrospectives, Git-koppeling en uren op taken. De standaardinrichting: **één sprintbord voor het hele team**, sprints van 2 weken die op maandag starten, en elke taak heeft een Klant, Epic en Sprint.

## De workspace Development

De workspace **Development** bevat vijf boards. Open ze via **Development** in de zijbalk of via de workspace-keuze.

| Board | Waar het voor is |
|---|---|
| Sprints | Het sprintbord van het team. Tabbladen: Planning, Actieve sprint, Dashboard en de tabel met alle sprints |
| Taken | De backlog en alle taken van alle klanten. Elke taak heeft Klant, Epic en Sprint |
| Epics | Epics, gekoppeld aan de fase in Projecten & Fases. Tabblad Roadmap toont de voortgang |
| Bugs | Bugs met de tijd tot oplossing |
| Retrospectives | Keep, Improve en Discussion per sprint, met stemmen |

Bestaat de workspace nog niet, dan maakt een beheerder hem aan met de knop **Development-workspace aanmaken** op de pagina Development, of met **Plan-structuur aanmaken** bij **Beheer > Importeren** (die maakt ook Delivery en het sjabloon voor klant-workspaces aan). Opnieuw klikken maakt geen dubbelen.

### Statussen en velden van een taak

Statussen (op alle dev-borden hetzelfde): **Backlog, Ready, In progress, Review, Wacht op klant, Done** en **Blocked**.

| Veld | Waarden |
|---|---|
| Type | Feature, Bug, Chore, Onderzoek |
| Prioriteit | P1 tot en met P4 |
| Schatting | uren (of story points) |
| Klant | de klant waarvoor het werk is |
| Epic | koppeling naar het bord Epics |
| Sprint | de sprint waarin de taak zit (leeg = backlog) |
| Eigenaar | wie de taak doet. Een taak zonder eigenaar bestaat niet |
| Jira key | optioneel: het Jira-nummer, bijvoorbeeld LMS-123 |
| Herkomst | Klantmeeting, Testfase of Meerwerk (zichtbaar meerwerk) |

## Een sprint maken en plannen

1. Open het bord **Sprints**. Het tabblad **Planning** toont de actieve en geplande sprints en onderaan de **Backlog**.
2. Klik op **Sprint maken**. De sprint krijgt automatisch de volgende naam (Sprint 22) en de datums van de eerstvolgende twee weken, van maandag tot vrijdag.
3. Voeg taken toe aan de backlog met het veld **Nieuwe taak in de backlog** onderaan, of maak ze op het bord Taken.
4. **Sleep** een taak aan het handvat links van de naam naar een sprint. Sleep je hem terug naar de Backlog, dan zit hij niet meer in een sprint.
5. Filter met **Alle klanten**, **Alle epics**, **Iedereen** of het zoekveld. Zo zie je de planning per klant.
6. Klik op de naam van een taak om het itempaneel te openen.

De kolom **Sprint** op het bord Taken laat je ook rechtstreeks een sprint kiezen. Het resultaat is hetzelfde als slepen.

## Een sprint starten

1. Klik bij een geplande sprint op **Start sprint**.
2. De sprint wordt **Actief**. Wat nu in de sprint zit, telt als de oorspronkelijke scope. Taken die later worden toegevoegd of verwijderd tellen als scopewijziging op het dashboard.
3. Er kan maar één sprint tegelijk actief zijn. Sluit de actieve sprint eerst af voordat je de volgende start.

## Werken in de actieve sprint

1. Open het tabblad **Actieve sprint**. De taken staan in kolommen per status.
2. Sleep een kaart naar een andere kolom om de status te wijzigen, bijvoorbeeld van In progress naar Review en daarna naar Done.
3. De voortgangsbalk bovenin toont hoeveel taken af zijn en hoeveel dagen er nog zijn.

## Een sprint afsluiten (Complete sprint)

Dit werkt als in Jira: met één knop gaat onafgemaakt werk automatisch door.

1. Klik bij de actieve sprint op **Complete sprint** (op de Planning of op de Actieve sprint).
2. Het venster toont hoeveel taken af en hoeveel nog open zijn.
3. Kies wat er met het onafgemaakte werk gebeurt:
   - **Naar de volgende sprint**: kies een geplande sprint, of laat de keuze op de eerstvolgende staan. Bestaat er geen geplande sprint, dan wordt automatisch een nieuwe sprint aangemaakt.
   - **Terug naar de backlog**: de taken krijgen geen sprint meer.
4. Klik op **Complete sprint**. Afgeronde taken blijven bij de afgesloten sprint. De sprint wordt Afgerond en verdwijnt uit de planning, de cijfers blijven op het dashboard staan.

## Het sprintdashboard

Open het tabblad **Dashboard** op het bord Sprints.

- **Burndown**: resterend werk per dag, met de ideale lijn (alleen werkdagen) en de scope. Stijgt de lijn, dan is er werk toegevoegd.
- **Velocity**: gepland en afgerond werk van de laatste sprints, met het gemiddelde.
- **Scopewijziging**: hoeveel werk na de start is toegevoegd of verwijderd.
- **Cycle time**: gemiddelde doorlooptijd van In progress tot Done.
- **Werkverdeling per developer**: afgerond en open werk per persoon.
- **Per klant**: kies een klant om alle cijfers voor die klant te zien.
- **Eenheid**: wissel tussen schatting (uren of punten) en aantal taken.
- **Daily standup**: een samenvatting per persoon: gisteren afgerond, vandaag bezig en blokkades. Kopieer de tekst naar Slack of Teams.

## Epics en de roadmap

1. Open het bord **Epics**. Het tabblad **Roadmap** toont elke epic met klant, fase, status, tijdlijn en voortgang (percentage taken dat af is).
2. Koppel een epic aan een fase in de kolom **Fase** (bord Projecten & Fases). Zo zie je per fase hoeveel werk af is.
3. Koppel een taak aan een epic in de kolom **Epic** op het bord Taken.

## Bugs en tijd tot oplossing

1. Open het bord **Bugs** en het tabblad **Bug overzicht**.
2. Zet de status van een bug op **Done**. De kolommen **Opgelost op** en **Tijd tot oplossing (dagen)** worden automatisch ingevuld. Zet je de bug weer open, dan worden ze geleegd.
3. Het overzicht toont het aantal open en opgeloste bugs, de gemiddelde en mediane tijd tot oplossing en de lijst per bug.

## Retrospectives

1. Open het bord **Retrospectives**. Kies bovenin de sprint.
2. Typ een punt in de kolom **Keep** (wat gaat goed), **Improve** (wat kan beter) of **Discussion** (wat bespreken we) en klik op **Toevoegen**.
3. Klik op **+1** bij een kaart om erop te stemmen. Klik nogmaals om je stem in te trekken. Elke persoon heeft maximaal één stem per kaart. De kaarten met de meeste stemmen staan bovenaan.
4. De kaarten staan per sprint gegroepeerd. In de tabelweergave zie je dezelfde kaarten als items per groep.

## Git-koppeling (GitHub en Bitbucket)

Commits, pull requests en branches verschijnen bij de taak, als de naam van de taak in de code voorkomt.

Instellen (beheerder):

1. Klik op **Development** in de zijbalk en dan op **Git-koppeling**.
2. Klik op **GitHub-koppeling maken** (of Bitbucket). Kopieer het **geheim** direct: het wordt maar een keer getoond. Kopieer ook de **Webhook-URL**.
3. GitHub: ga naar de repository, **Settings > Webhooks > Add webhook**. Plak de URL, kies content type **application/json**, plak het geheim bij **Secret** en kies de events **Push** en **Pull requests**.
4. Bitbucket: **Repository settings > Webhooks**, plak de URL en het geheim, kies de triggers **Push** en **Pull request**.

Gebruiken:

1. Noem de **Jira key** (bijvoorbeeld LMS-123) of `weekend-<item-id>` in de naam van je branch, je commitbericht of de titel van je pull request.
2. Open de taak en klik op het tabblad **Git**. Je ziet de commits, de pull requests (met status open, merged of closed) en de branches.

Een webhook met een ongeldige handtekening wordt geweigerd. Je kunt het geheim vervangen met **Nieuw geheim**.

## Uren op een taak

1. Open een taak en klik op het tabblad **Uren**.
2. Vul de uren in (bijvoorbeeld 1,5), de datum en een omschrijving en klik op **Uren toevoegen**.
3. Het totaal staat bovenaan. Je kunt je eigen regels verwijderen.

De uren op een taak zijn voor je eigen inzicht. Ze worden **niet** automatisch doorgezet naar het bord **Urenregistratie** in Delivery: schrijf uren die je wilt factureren daar zelf. Facturatie gebeurt uitsluitend op basis van dat bord ([Uren en Delivery](09-uren-en-delivery.md)).

## Automations en sprints

De automation-triggers **Sprint gestart** en **Sprint afgerond** gebruiken de sprintgebeurtenissen van het bord Sprints. Zo kun je bijvoorbeeld een melding sturen als een sprint start.
