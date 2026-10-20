# 0001: Klant > opdracht (epic) > taak in Weekend dev

- Status: aangenomen
- Datum: 2026-10-07
- Module: dev (`src/server/services/dev-config.ts`, `src/modules/dev/sprint-board-view.tsx`, `src/modules/dev/swimlanes.ts`)

## Vraag

Eén klant heeft vaak meerdere opdrachten tegelijk. Op het sprintbord (`Sprints` > view "Actieve sprint") wilden we het werk per klant zien, en daarbinnen per opdracht. Hoe leggen we de relatie klant -> opdracht -> taak vast, en welke bron is leidend voor de klant van een taak?

## Gangbare inrichtingen

Een work OS kent meestal geen vast object "opdracht". Er zijn drie gangbare inrichtingen:

1. **Klant als workspace of map, een bord per opdracht.** Klanten met meerdere projecten krijgen een eigen workspace of map met een bord per project. Het overzicht komt uit een dashboard.
2. **Klanten-bord + Projecten-bord met Connect boards.** Elk project-item verwijst naar één klant, taken verwijzen naar een project, klantgegevens komen via een Mirror-kolom mee. Eén klant kan zo veel opdrachten hebben zonder dubbele borden.
3. **Dev-inrichting: de epic is de opdracht.** Eén Epics-bord. Elke epic is een opdracht of deliverable, taken hangen via de Epic-kolom aan een epic en het sprintbord deelt in per epic. Er is geen extra laag "klant" boven epics. Dat los je op met een kolom of een koppeling.

## Besluit

We volgen **optie 3** met de koppelingsgedachte van optie 2:

- **De epic is de opdracht.** Eén klant met meerdere opdrachten = meerdere epics met dezelfde waarde in de Klant-kolom van het Epics-bord.
- **De klant van een taak komt van zijn epic.** `readTask()` neemt de klant van de eerste gekoppelde epic die een klant heeft. De eigen Klant-kolom van de taak is alleen de fallback, voor taken zonder epic of met een epic zonder klant. Dit is dezelfde gedachte als een Mirror-kolom in optie 2: één bron van waarheid.
- **Sprintbord-swimlanes.** De view "Actieve sprint" groepeert standaard per klant en daarbinnen per epic ("Per klant en epic"). Klanten zonder epic-taken krijgen geen epic-laag. Alternatieven in dezelfde view: "Per klant" en "Niet groeperen" (view-setting `groupBy`).

## Waarom

- **Past op wat er al is.** Het Epics-bord heeft al een Klant-kolom en taken zijn al via de Epic-kolom gekoppeld. Er is geen nieuw bord, geen migratie en geen extra invoer nodig.
- **Volgt het gangbare dev-model.** Epic = groter stuk werk / opdracht is het standaardmodel in sprinttools; ook in Jira groeperen sprintborden per epic. Zie de bron hieronder.
- **Eén bron van waarheid.** Klant op taak én op epic kon uit elkaar lopen. Waar ze verschillen, wint nu de epic.
- **Consistente rapportage.** Omdat `readTask()` het overal regelt, gebruiken sprintbord, klantfilter, dashboard (burndown/velocity per klant), sprinthistorie en bugs dezelfde klant.

## Gevolgen

- Een taak naar een andere klant verplaatsen = de epic wijzigen (of de klant van de epic). De Klant-kolom van een taak met een epic-klant heeft geen effect in de dev-views. Op het takenbord zelf blijft de oude waarde zichtbaar.
- Een kaart op het sprintbord naar een andere swimlane slepen wijzigt alleen de status, niet klant of epic.
- Slechts een deel van de sprinttaken heeft een epic. Die vallen onder "Zonder epic". Hoe beter taken gekoppeld zijn, hoe nuttiger de tweede laag.

## Overwogen en (nu) niet gekozen

- **Optie 1 (bord per opdracht):** veel borden, en het ene team-sprintbord over alle klanten heen zou verdwijnen.
- **Optie 2 (apart Projecten-bord tussen klant en epic):** extra laag en extra invoer zonder winst zolang een opdracht in de praktijk één epic is. Heroverwegen als opdrachten meerdere epics gaan omvatten.

## Bronnen

- Swimlanes per epic op een sprintbord (Jira, ter vergelijking): https://ones.com/blog/using-jira-scrum-board-swimlanes-4-practical-layouts-explained/
