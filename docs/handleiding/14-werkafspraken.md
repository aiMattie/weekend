# Werkafspraken

Dit hoofdstuk beschrijft een voorbeeldwerkwijze voor een team, met de checklist per klant, als stappen in de app. Pas de afspraken aan op je eigen team; spreek af wie eigenaar is van de inrichting en beslist over wijzigingen. De afspraken gelden voor developers, de product owner of PM, de accountmanagers en de uren-verantwoordelijke.

Per afspraak staat erbij wie het doet en welk scherm je gebruikt. De achtergrond van elk scherm staat in de genoemde hoofdstukken.

## De structuur klaarzetten (beheerder, eenmalig)

De afspraken veronderstellen vier lagen: klant-workspace, Delivery, Development en My Work. Een beheerder zet ze klaar.

1. Open **Beheer > Importeren**.
2. Klik in het blok **Sjablonen** op **Plan-structuur aanmaken**. Je ziet "Sjablonen staan klaar".
3. Controleer in de zijbalk dat de workspaces **Delivery** (Klanten, Projecten & Fases, Urenregistratie, Klant overstap checklist) en **Development** (Sprints, Taken, Epics, Bugs, Retrospectives) bestaan.

Opnieuw klikken is veilig: er ontstaan geen dubbele borden. Meer in [Uren en Delivery](09-uren-en-delivery.md) en [Development](08-dev-sprints.md).

## Developers

### Sprintritme: 2 weken, start op maandag
1. Open het board **Sprints** in de workspace Development, tab **Planning**.
2. Klik op **Sprint maken**. De sprint krijgt de eerstvolgende twee weken, van maandag tot en met vrijdag van week twee.
3. Plan de sprint voor de start met het team: sleep taken uit de **Backlog** naar de sprint.
4. Klik op maandag bij de sprint op **Start sprint**. Er is maar één actieve sprint tegelijk.
5. Sluit de sprint aan het einde af met **Complete sprint** (zie hieronder).

Er is **één sprintbord voor het hele team**, niet per klant. Per taak geef je de klant en de epic aan.

### Statussen op alle dev-borden
Gebruik op elk dev-board dezelfde statussen: **Backlog**, **Ready**, **In progress**, **Review**, **Wacht op klant**, **Done** en **Blocked**.

Zet de status van een taak door op de cel te klikken, of sleep de kaart op de tab **Actieve sprint** naar een andere kolom.

### Velden per taak
Vul op het board **Taken** per taak in:

| Veld | Keuze |
|---|---|
| Type | Feature, Bug, Chore of Onderzoek |
| Prioriteit | P1 tot en met P4 |
| Schatting | uren (of story points) |
| Klant | de klant waarvoor het werk is |
| Epic | de epic uit het board Epics |
| Sprint | de sprint, leeg is backlog |
| Eigenaar | wie de taak doet |
| Herkomst | Klantmeeting, Testfase of Meerwerk |
| Jira key | optioneel: het nummer uit Jira, bijvoorbeeld LMS-123 |

Status en **Eigenaar** zijn altijd ingevuld: een taak zonder eigenaar bestaat niet. Controleer dat met de werkbalk: kies **Filter**, kolom **Eigenaar**, voorwaarde leeg. Blijven er taken staan, wijs ze dan toe. Wil je een seintje bij een nieuwe taak zonder eigenaar, maak dan op het board een automation met **Eigen recept bouwen** ([Automations](05-automations.md)): Wanneer een item wordt aangemaakt, Als **Eigenaar** leeg is, Dan stuur een melding aan de PO.

### Sprint afsluiten
1. Klik bij de actieve sprint op **Complete sprint**.
2. Kies voor het onafgemaakte werk **Naar de volgende sprint** of **Terug naar de backlog**.
3. Klik op **Complete sprint**. Afgeronde taken blijven bij de sprint.

### Inzicht en code
- Burndown en velocity staan op het tabblad **Dashboard** van het board Sprints.
- De Git-koppeling met GitHub of Bitbucket zet een beheerder op via **Development > Git-koppeling**. Noem daarna `weekend-<item-id>` (of de Jira key) in de branchnaam of de commit, dan staan de commits en pull requests op het tabblad **Git** van de taak.

## Product owner en PM

1. **Backlog per klant**: open het board **Taken**, kies een klant bij **Alle klanten** en houd de volgorde op prioriteit.
2. **Epics op de roadmap**: open het board **Epics**, tab **Roadmap**. Koppel elke epic in de kolom **Fase** aan de fase uit de offerte in Projecten & Fases. Zo zie je per fase hoeveel werk af is.
3. **Sprintplanning en review/retro**: plan het begin van de sprint op de tab **Planning**. Houd aan het einde de review en de retro op het board **Retrospectives** (Keep, Improve, Discussion, met stemmen).
4. **Nieuwe wensen van een klant**: laat de klant een formulier invullen ([Forms en Docs](07-forms-en-docs.md)), of maak een item in de backlog en vul de kolom **Herkomst** in: **Klantmeeting**, **Testfase** of **Meerwerk**. Filter op **Herkomst = Meerwerk** om meerwerk direct te zien.

## Urenregistratie

Facturatie gebeurt uitsluitend op basis van het board **Urenregistratie** in Delivery.

### Regels
1. Eén plek: schrijf alle uren in **Urenregistratie**, niet in een ander board.
2. Per regel vul je in: **Wie**, **Datum**, **Klant**, **Fase**, de uren (**Uren dev**, **Uren PM**, **Meerwerk uren** of **Non-billable uren**), **Billable** (ja of nee) en **Factuurperiode** (bijvoorbeeld 2026-10).
3. Schrijf dagelijks of uiterlijk op vrijdag.
4. De timer op een taak (kolom Time tracking, of het tabblad **Uren** bij een taak) mag je gebruiken voor eigen inzicht. Hij telt niet mee voor facturatie.

### Hoe je een regel schrijft
1. Open het board **Urenregistratie** en klik op **+ Add item** (of vul het snelle formulier **Uren snel invullen** in, als een beheerder het heeft gepubliceerd).
2. Geef de regel een korte naam, bijvoorbeeld "Sprint 21 dev".
3. **Wie** en **Datum** vult een automation voor je in: jijzelf en vandaag.
4. Kies **Klant** en **Fase**, vul de uren in en vink **Billable** aan als de uren factureerbaar zijn.
5. Open **Projecten & Fases**: **Uren besteed** en **Restant** van de fase zijn direct bijgewerkt.

### Controle per maand
Op de eerste werkdag van de maand doet de uren-verantwoordelijke dit:
1. Open **Urenregistratie** en controleer de regels van de vorige maand: ontbreekt er een **Klant**, **Fase** of **Wie**?
2. Open **Projecten & Fases** en kijk naar **Budget gebruikt** en **Budgetwaarschuwing (80%)**.
3. Sluit de factuurperiode: vink **Gefactureerd** aan op de regels van die periode.
4. Zet de **Factuurstatus** van de fase op **Deels gefactureerd** of **Gefactureerd**.

## Algemeen

### My Work in plaats van persoonlijke borden
Gebruik **My work** (zijbalk onder Apps, of onder **More** in de rail) als je persoonlijke takenlijst. Alle items waar jij bij **People** op staat staan er, uit alle boards, in **Verlopen**, **Vandaag**, **Deze week** enzovoort. Maak geen losse persoonlijke borden meer en bouw bestaande persoonlijke borden af: verplaats de items naar het juiste projectboard.

### Gespreksverslagen in de klant-workspace
1. Open de workspace van de klant en het board **Gespreksverslagen**.
2. Maak een item voor het gesprek en schrijf het verslag in een update of een doc.
3. Maak de actiepunten meteen als **subitem** van het verslag (of als taak op **Builds & Taken**), met een eigenaar en datum.
4. In Delivery zet je alleen een link naar het verslag. Verslagen komen nooit in Delivery zelf.

Met de [Notetaker](13-ai-sidekick-en-agents.md) maak je het verslag automatisch in de klant-workspace; de actiepunten worden pas taken nadat je ze bevestigt.

### Status en eigenaar
Elke taak heeft een **Status** en een **Eigenaar**. Gebruik de view **Table** met **Filter** op een lege Eigenaar om gaten te vinden.

## Checklist per klant

Het board **Klant overstap checklist** in Delivery heeft per klant één regel met vinkjes. De kolom **Voortgang** toont het percentage. Loop per klant deze stappen af en vink ze af.

| Stap | Zo doe je het in de app | Vinkje |
|---|---|---|
| Klant staat in het board Klanten, met accountmanager en contractvorm | Open **Klanten**, maak een item voor de klant en vul **Accountmanager**, **PO / PM**, **Uren-verantwoordelijke**, **Contractvorm(en)** in | Klant in Klanten |
| Actieve fase staat in Projecten & Fases, met budget en looptijd | Open **Projecten & Fases**, maak een item per fase en vul **Klant**, **Uren begroot dev**, **Uren begroot PM**, **Looptijd** en **Bedrag excl. btw** in | Fase in P&F |
| Klant-workspace bestaat (vanuit het sjabloon) | **Beheer > Importeren**, vul **Klantnaam** in en klik op **Klant-workspace aanmaken** | Klant-workspace |
| Epics aangemaakt en gekoppeld aan de fase | Open **Epics**, maak de epics en kies in de kolom **Fase** de fase | Epics gekoppeld |
| Team en PO weten dat de klant live staat | Stuur een update of een melding aan team en PO op het checklist-item | Team op de hoogte |

De overige vinkjes (bijvoorbeeld een proefimport en de overgang vanuit een vorige tool) vink je af zodra die stappen buiten de app zijn gedaan.

Beperkingen: de app dwingt de werkafspraken niet af. Een taak zonder eigenaar kan wel worden opgeslagen, en uren kunnen ook buiten Urenregistratie worden vastgelegd (bijvoorbeeld op het tabblad Uren van een taak). De afspraken werken alleen als iedereen ze volgt en de maandcontrole wordt gedaan. De timer op taken wordt niet automatisch naar Urenregistratie doorgezet.
