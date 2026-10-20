# 0003: Sprint-historie per taak

- Status: aangenomen
- Datum: 2026-10-08
- Module: dev (`sprint-sync.ts`, `sprint-read.ts`, `sprints-tab.tsx`)

## Vraag

Werk dat niet af is, schuift door naar een volgende sprint. We willen per taak kunnen zien in welke sprints hij allemaal heeft gezeten en wat er per sprint mee gebeurde. Dat kon niet: alleen de afsluitdialoog legde de uitkomst per sprint vast. Open taken in een sprint die op een andere manier was gesloten, bleven daar "open" staan en waren nergens zichtbaar: niet in de backlog en niet in een lopende sprint.

## Besluit

1. **`sprint_items` is de historie.** Elke periode die een taak in een sprint zat is één regel, met als uitkomst `done`, `carried` (doorgeschoven) of `removed` (uit de sprint gehaald). Dat was er al voor de afsluitdialoog. Nu sluiten ook de andere routes netjes af:
   - Een taak die een **afgesloten** sprint verlaat terwijl zijn regel daar nog open staat, krijgt daar uitkomst `carried`, of `done` als hij daar af was (`closeLeftBehind` in `syncItem`).
2. **Tonen:**
   - Tab **Sprints** in het item-paneel, op borden met een Sprint-kolom: elke sprint met periode en resultaat (Afgerond, Doorgeschoven, Uit sprint gehaald, Huidige sprint, Niet afgerond).
   - Teller **↻n** op taken in de planning en op kaarten op het sprintbord: de taak zat al in n eerdere sprints.
   - API: `GET /api/v1/dev/items/:id/sprints`.
3. **Open werk in een afgesloten sprint staat in de backlog** van de planning, zodat het nooit meer onzichtbaar is.

## Waarom

- **Geen nieuwe tabel.** `sprint_items` bestond al met één regel per periode, en de rapportages (burndown, velocity, scope change) lezen die al. Het ontbrak alleen aan regels voor een paar routes.
- **Vergelijkbaar met gangbare sprinttools.** Een issue houdt zijn eerdere sprints, en onafgemaakt werk gaat bij het afsluiten naar de volgende sprint of de backlog. Het aantal keer doorschuiven is een signaal: werk dat steeds blijft liggen, is te groot of zit vast.

## Gevolgen

- Eerder afgesloten sprints krijgen achteraf uitkomsten op hun regels zodra hun open taken verder gaan. Het resultaat van die sprints (`sprints.result`) verandert niet.
- De teller telt afgesloten sprints waarin de taak zat, ook als hij er af kwam. In de tab staat het resultaat per sprint.
