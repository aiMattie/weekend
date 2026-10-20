# Dashboards

Een dashboard combineert gegevens van een of meer boards in widgets: grafieken, cijfers, lijsten, planning en meer. Cijfers kloppen altijd met de boards: wijzig je een item, dan ververst het dashboard vanzelf (live).

## Een dashboard maken

1. Klik in de zijbalk op **Dashboards**.
2. Klik rechtsboven op **Nieuw dashboard**.
3. Typ een naam, bijvoorbeeld "Delivery overzicht".
4. Vink bij **Kies de boards voor dit dashboard** een of meer boards aan. Je kunt zoeken op naam; de boards staan per workspace gegroepeerd. Kies je boards uit meerdere workspaces of meerdere boards uit een workspace, dan wordt het een cross-board dashboard.
5. Klik op **Dashboard maken**. Het lege dashboard opent.

Je past de boards later aan met de knop **Boards** bovenin het dashboard.

## Widgets toevoegen

1. Klik op **Widget toevoegen**. De galerij toont alle widgets in groepen: Grafieken, Cijfers en voortgang, Lijsten en bestanden, Planning, Overig.
2. Klik op een widget. Rechts opent het paneel **Widgetinstellingen** met een live voorbeeld.
3. Kies de instellingen (zie het overzicht hieronder) en klik op **Opslaan**.

| Widget | Wat het toont | Belangrijkste instellingen |
|---|---|---|
| Chart | Staaf, kolom, lijn, taart, donut of gestapeld | Groeperen op (kolom, Board of Group), Stapelen op, Meting (aantal, som, gemiddelde, min, max) |
| Numbers | Een tot vier kerncijfers | Meting per cijfer, Numbers-kolom, eenheid |
| Battery | Voortgangsbalk: aandeel afgeronde items | Status-kolom |
| Status overview | Tegels met het aantal items per status | Status-kolom |
| Progress | Voortgang naar een doel | Afgeronde items, of som van een kolom tegen een doel |
| Counter | Dagen tot of sinds een datum | Datum, label |
| List en Table | Items met gekozen kolommen | Kolommen, sorteren, maximum aantal |
| Timeline en Gantt | Items als balken op een tijdas | Datum- of timeline-kolom, kleur |
| Workload | Werkdruk per persoon, per status | People-kolom, meting |
| Calendar | Maandkalender | Datumkolom |
| Files | Galerij met bestanden van items | Boards |
| Last updated | Recente activiteit | Aantal |
| Text | Vrije tekst | Tekst, grootte |
| Embed | Webpagina of video (YouTube, Vimeo) | URL |

Per widget kies je ook **Boards** (leeg = alle boards van het dashboard) en **Filters** (bijvoorbeeld alleen items met status Done).

## Indeling aanpassen

- Sleep een widget bij de titelbalk om hem te verplaatsen.
- Sleep de hoek rechtsonder om hem groter of kleiner te maken. Het raster heeft 12 kolommen; de nieuwe indeling wordt direct bewaard.
- Beweeg over een widget voor de knoppen **Widgetinstellingen**, **Dupliceren** en **Verwijderen**.

## Filteren over alle widgets

1. Klik bovenin op **Filter**.
2. Klik op **Filter toevoegen**, kies een kolom (kolommen met dezelfde naam en hetzelfde type op verschillende boards tellen als een kolom), een voorwaarde en een waarde, bijvoorbeeld Status is een van Done.
3. Alle widgets tonen nu alleen de passende items. Verwijder het filter met het prullenbakje.

## Delen, vergrendelen en TV-modus

- **Delen**: kies of iedereen met toegang tot de workspace het dashboard ziet, of alleen geselecteerde mensen. Kopieer de link om hem te delen.
- **Vergrendelen** (slotje): alleen de eigenaar kan dan nog widgets en indeling wijzigen; anderen zien het dashboard alleen.
- **Volledig scherm (TV-modus)**: toont het dashboard schermvullend zonder knoppen en blijft live verversen. Verlaat de modus met **TV-modus verlaten** of Esc.
- **Meer acties** (drie puntjes): **Dupliceren** maakt een kopie met alle widgets; **Verwijderen** verwijdert het dashboard.

## Voor AI-agents en de API

De widgettypes en hun instellingen staan als JSON-schema op `GET /api/v1/widgets/schema` (hetzelfde als de MCP-tool `all_widgets_schema`). Een dashboard maak je met `POST /api/v1/dashboards` en widgets met `POST /api/v1/dashboards/:id/widgets`.
