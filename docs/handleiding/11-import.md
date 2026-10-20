# Import vanuit monday.com

De **monday.com-importer** haalt bestaande gegevens uit een monday.com-account naar Weekend. De importer is **alleen-lezen** naar monday.com, begint met een **dry-run** die alleen laat zien wat er zou gebeuren, en is herhaalbaar: opnieuw draaien werkt bestaande gegevens bij en maakt geen dubbelen.

## 1. De importer

### Wat wordt overgenomen

Gebruikers, teams, workspaces, mappen, boards met groepen, kolommen (inclusief statuslabels met kleuren, dropdown-labels, eenheden), views, items en subitems met alle kolomwaarden, updates met antwoorden, bestanden (gegevens en, indien mogelijk, de bestanden zelf) en WorkDocs. Boards van het type `sub_items_board` worden bij hun bovenliggende board gevoegd; `custom_object`-boards worden overgeslagen en gemeld.

Hoe waarden worden vertaald:

| monday.com | Weekend |
|---|---|
| Status | Label met dezelfde id, kleur en volgorde; "klaar"-labels blijven klaar |
| Personen | Gekoppeld aan de gebruiker met hetzelfde e-mailadres (of dezelfde naam) |
| Connect boards | Koppeling naar het overgenomen item; wordt gelegd nadat alle items bestaan |
| Mirror en formule | Opnieuw ingesteld op de nieuwe kolommen (formules krijgen `{Kolomnaam}`-verwijzingen) |
| Bestanden en WorkDocs-links | Bestand met download, of een link naar het monday.com-document |
| Onbekend kolomtype | Waarde blijft ongewijzigd (JSON) staan, met een waarschuwing in het rapport |

### Veiligheid

De importer schrijft **nooit** naar monday.com. De client weigert elk GraphQL-document waarin het woord `mutation` voorkomt, en dat is met een test vastgelegd. De API-sleutel (`MONDAY_API_KEY` in `.env`) wordt alleen naar api.monday.com gestuurd en staat nooit in logs of documenten.

### Uitvoeren in de app (beheerder)

1. Ga naar **Beheer > Importeren** (`/admin/import`).
2. Laat het veld met workspace-id's leeg (alles) of vul de monday.com-workspace-id's in, gescheiden met komma's. `main` is de hoofdworkspace.
3. Klik op **Dry-run starten**. Wacht tot de status **Klaar** is.
4. Lees het rapport: de aantallen per onderdeel (nieuw, bijwerken, ongewijzigd), de waarschuwingen en de diff-regels (`+` nieuw, `~` bijwerken, `=` gekoppeld aan bestaand).
5. Klopt het? Klik op **Importeren (schrijven)** en bevestig. Het schrijven gebeurt in één transactie: bij een fout blijft de omgeving ongewijzigd.
6. Onder **Geschiedenis** staat elke run met rapport. Klik op **Rapport tonen** om een oude run te bekijken.

### Uitvoeren op de opdrachtregel

```
npx tsx scripts/import-monday.ts                       # dry-run (standaard)
npx tsx scripts/import-monday.ts --verbose             # met waarschuwingen en diff
npx tsx scripts/import-monday.ts --apply               # schrijven
npx tsx scripts/import-monday.ts --workspace 7059403   # alleen deze workspace (herhaalbaar)
```

Importeer bij voorkeur in een lege omgeving (na `npm run setup`). Bestaande workspaces, mappen, gebruikers en teams worden herkend aan naam (en gebruikers aan e-mailadres) en gekoppeld in plaats van dubbel aangemaakt. Boards met dezelfde naam in dezelfde workspace worden ook gekoppeld (uitzetten kan met `--no-adopt-boards`).

## 2. Koppeling en automatische synchronisatie

Bovenaan **Beheer > Importeren** (`/admin/import`) staat de kaart **monday**. Daar koppel je de monday.com-account en zet je een planning aan. Zo blijft deze omgeving bij zolang het team nog in monday.com werkt.

### Koppelen

1. Plak de API-sleutel (in monday.com: je avatar > Developers > My access tokens) en klik op **Koppelen**.
2. De sleutel wordt eerst gecontroleerd bij monday.com. Klopt het, dan zie je **Gekoppeld** en "Verbonden als ...".

De sleutels worden versleuteld opgeslagen (op basis van `SESSION_SECRET`) en nooit teruggestuurd naar de browser. Een koppeling in de app gaat voor de waarden in `.env`; zonder koppeling gebruikt de importer `MONDAY_API_KEY` uit `.env` (de kaart toont dan **Gekoppeld via .env**). Met **Verbinding testen** controleer je de sleutel die op dat moment gebruikt wordt.

### Planning

* Zet **Automatisch synchroniseren** aan en kies **Elk uur**, **Dagelijks** of **Wekelijks** (met dag en tijd). Tijden gelden in de tijdzone van de account.
* Vul eventueel workspace-id's in (leeg = alles).
* **Nu synchroniseren** start direct een run met dezelfde instellingen.

Een geplande run schrijft altijd (zoals **Importeren**) en is een volledige run: bestaande items worden bijgewerkt, er komen geen dubbelen. Elke run staat onder **Geschiedenis** met zijn rapport, en de kaart toont de laatste en de volgende run. Loopt er al een import van hetzelfde soort, dan wacht de planning een minuut en probeert het opnieuw. De planner draait in de server; uitzetten kan met `IMPORT_SCHEDULER=off` in `.env`.

## Problemen oplossen

| Melding | Oplossing |
|---|---|
| monday is not linked | Koppel monday bovenaan **Importeren**, of zet `MONDAY_API_KEY` in `.env` op de server |
| monday.com weigert de sleutel | Sleutel verlopen of ingetrokken: maak een nieuwe en klik op **Wijzigen** |
| An import is already running | Wacht tot de lopende import klaar is (na 30 minuten geldt hij als afgebroken) |
