# 0002: Levenscyclus van epics (Gepland, Actief, Afgerond, Geparkeerd)

- Status: aangenomen
- Datum: 2026-10-07
- Module: dev (`src/server/services/epic-lifecycle.ts`, hook in `sprint-sync.ts`, `sprints.ts`, `planning-view.tsx`, `roadmap-view.tsx`)
- Bouwt voort op [0001](0001-klant-opdracht-epic.md): de epic is de opdracht van een klant.

## Vraag

De status van epics klopte vaak niet met de taken: epics die helemaal af waren maar niet op "Afgerond" stonden, epics zonder taken, epics op "Afgerond" met nog open taken, en epics met open werk dat in geen enkele sprint zat (werk voor later).

Oude releases en werk voor later vervuilden zo de epic-filters en de roadmap. Hoe houden we dit bij zonder handwerk?

## Gangbare aanpak in sprinttools

- **Werk voor later staat in de backlog.** Dat zijn taken zonder sprint, of taken in een geplande toekomstige sprint. Het sprintbord toont alleen de actieve sprint, dus daar verschijnt later werk niet.
- **De epic-status geeft de fase van de opdracht aan.** Gangbaar is zo'n status te regelen met een automatisering op de onderliggende items, bijvoorbeeld "als alle subitems af zijn, zet het item op Done". Dat doen wij hier voor epic en taken.

## Besluit

1. **De status van een epic volgt zijn taken** (automatisch, als systeemgebruiker):
   - alle gekoppelde taken af → **Afgerond**
   - een open taak in de actieve sprint → **Actief**
   - anders, als de epic op Actief of Afgerond stond → **Gepland** (er is nog werk, maar niets in de sprint)
   - **Geparkeerd** wordt nooit aangeraakt, en epics zonder taken ook niet.

   Dit wordt opnieuw berekend bij elke wijziging van een taak (status, sprint, epic-koppeling, aanmaken, archiveren of verwijderen; bij een nieuwe koppeling ook voor de vorige epic) en na het starten of afsluiten van een sprint.
2. **Geparkeerd = bewust later.** Een opdracht die stilligt of pas later start zet je handmatig op Geparkeerd. De taken blijven gewoon in de backlog. Haal je de opdracht terug, zet de epic dan op Gepland; daarna neemt de automatie het weer over.
3. **Afgeronde en geparkeerde epics zijn standaard verborgen** in het epic-filter van de planning en in de roadmap. Een vinkje "Toon afgeronde en geparkeerde epics" laat ze zien, met het aantal verborgen epics erbij. Het epic-filter toont "Klant · Epic", omdat namen als "Release 1" bij meerdere klanten voorkomen, en volgt het klantfilter.

## Waarom

- **Geen handwerk en geen verouderde status.** Of een epic af is volgt rechtstreeks uit de taken. Een epic die met de hand op Afgerond is gezet terwijl er nog werk open staat, gaat terug naar Gepland zodra er iets aan een taak verandert of er een sprint start of afgesloten wordt.
- **Geparkeerd blijft een menselijke keuze.** Uit de taken alleen is niet af te leiden of werk "later" is of "vergeten". Daarom zet de automatie nooit iets op Geparkeerd en haalt ze er ook niets vanaf.
- **Schone pickers, niets kwijt.** Verbergen in plaats van verwijderen houdt de historie intact (rapportages, uren), en één vinkje laat alles weer zien.

## Gevolgen

- Een epic die je met de hand op Afgerond zet terwijl er nog open taken onder hangen, gaat bij de volgende wijziging aan een van zijn taken of de volgende sprintwissel terug naar Gepland of Actief. Wil je dat niet, zet de open taken dan op Done, verplaats ze naar een andere epic, of parkeer de epic.
- Statusnamen liggen vast in het template (`EPIC_STATUSES` in `dev-template.ts`) en in `EPIC_STATUS` in `epic-lifecycle.ts`. Wie ze hernoemt, moet beide aanpassen.
