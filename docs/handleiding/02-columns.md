# Columns

Een column (kolom) is een eigenschap van de items op een board: een status, een datum, een persoon, een bedrag. Deze handleiding laat zien hoe je kolommen toevoegt, instelt en gebruikt. Alle voorbeelden komen uit de Delivery-workspace (boards Klanten en Projecten & Fases).

## 1. Een kolom toevoegen (Column center)

1. Open een board, bijvoorbeeld **Klanten**.
2. Klik rechts van de laatste kolomkop op de **+**.
3. Het **Column center** opent. Links kies je een categorie: **Alle kolommen**, **Essentials** of **Super useful**. Bovenin zoek je op naam of omschrijving (bijvoorbeeld "tijd" vindt Time tracking en World clock).
4. Klik op een tegel, bijvoorbeeld **Rating**. De kolom verschijnt direct achter de laatste kolom.
5. Kolommen die eerst een keuze nodig hebben (**Connect boards**, **Mirror**, **Formula**) openen een tweede stap. Vul daar de naam en de instellingen in en klik op **Kolom maken**.

### Kolomtypes

| Categorie | Type | Wat het doet |
|---|---|---|
| Essentials | Status, Dropdown | Gekleurde labels die je zelf beheert |
| Essentials | Text, Long text, Link, Email, Phone | Tekst en contactgegevens (e-mail en telefoon zijn klikbaar, telefoon toont een landvlag) |
| Essentials | People, Date, Timeline, Numbers, Checkbox | Personen, data, perioden, getallen, vinkjes |
| Essentials | Files | Bestanden uploaden, bekijken en downloaden |
| Essentials | Tags | Herbruikbare tags voor het hele account |
| Super useful | Connect boards, Mirror, Dependency | Items koppelen, gegevens van gekoppelde items tonen, afhankelijkheden |
| Super useful | Formula, Progress tracking, Auto number, Item ID | Berekende kolommen (alleen lezen) |
| Super useful | Creation log, Last updated, Item assignees | Wie maakte, wijzigde of is toegewezen (alleen lezen) |
| Super useful | Time tracking, Week, Hour, World clock | Tijd en planning |
| Super useful | Rating, Vote, Button, Color picker | Beoordelen, stemmen, een knop voor automations, een kleur |
| Super useful | Location, Country, Doc | Adres met kaartlink, land met vlag, een WorkDoc |

## 2. Waarden invullen

Klik op een cel om hem te bewerken. Wat er gebeurt hangt van het type af:

- **Timeline**: kies een start- en einddatum. De cel toont een blauwe balk ("5 - 9 okt"). Een einddatum voor de start wordt geweigerd.
- **Week**: kies een week (maandag tot en met zondag). De cel toont "Week 41".
- **Hour**: kies een tijdstip, bijvoorbeeld 14:30.
- **World clock**: zoek een tijdzone. De cel toont de lokale tijd en de plaatsnaam en loopt vanzelf door.
- **Rating**: klik op een ster. Nog een keer op dezelfde ster wist de waarde. Het aantal sterren (3 tot 10) stel je in bij de kolominstellingen.
- **Vote**: klik op de duim om te stemmen of je stem in te trekken. Met de muis boven het getal zie je wie er stemde.
- **Tags**: typ een naam. Bestaat de tag nog niet, dan kies je **Maak tag "..."** of druk je op Enter.
- **Location**: vul een adres in, eventueel met breedte- en lengtegraad. Het adres is een link naar de kaart.
- **Country**: zoek op de Nederlandse of Engelse naam.
- **Color picker**: kies een kleur uit het palet of een eigen kleur.
- **Button**: een klik start de automations met de trigger "Wanneer de knop wordt ingedrukt". De tekst en kleur stel je in bij de kolominstellingen.
- **Doc**: klik op **Doc maken** om een WorkDoc aan het item te koppelen en te openen. Daarna opent de cel dat document.

### Bestanden (Files)

1. Klik op de cel in de **Files**-kolom. Er opent een lijst met de bestanden van dit item.
2. Sleep bestanden in het vak of klik erop om te kiezen. Je kunt meerdere bestanden tegelijk kiezen (maximaal 9 MB per bestand).
3. Afbeeldingen krijgen een miniatuur. Klik op de naam om het bestand te bekijken, op de pijl om het te downloaden en op het kruisje om het te verwijderen.
4. Bestanden staan op de server in `data/files`. Alleen mensen die het board mogen zien kunnen ze openen.

### Time tracking

1. Klik op de groene **play**-knop om een timer te starten. De teller loopt door, ook na het herladen van de pagina.
2. Klik op de rode knop om te stoppen. De sessie wordt bewaard met de naam van wie hem startte.
3. Klik op de tijd zelf om handmatig uren toe te voegen of een sessie te verwijderen. Het totaal van alle sessies staat onderaan het board in de samenvattingsrij.

## 3. Labels van een Status of Dropdown bewerken

1. Klik op een cel van de Status-kolom en kies onderin **Labels bewerken**, of open het kolommenu (de pijl in de kolomkop) en kies **Labels bewerken**.
2. Pas de naam aan, kies een kleur uit het kleurenpalet (klik op het gekleurde vlakje), versleep een label of gebruik de pijltjes om de volgorde te wijzigen.
3. Zet **Klaar** aan bij labels die "afgerond" betekenen. Die tellen mee in Progress tracking en in de voortgang van subitems.
4. Verwijder een label met het kruisje. Items die dat label hadden worden leeg gemaakt.
5. Klik op **Opslaan**.

Elke kolom heeft zijn eigen labels. Een nieuw board krijgt Working on it, Done en Stuck.

## 4. Het kolommenu

Beweeg over een kolomkop en klik op de pijl. Het menu bevat:

- **Sorteer oplopend / aflopend**
- **Filter**: kies een operator en waarde, bijvoorbeeld "groter dan 20". Het filter geldt voor de huidige view.
- **Groeperen op deze kolom**
- **Kolom vastzetten** en **Verbergen**
- **Hernoemen**, **Dupliceren**
- **Kolomtype wijzigen**: kies in het Column center een ander type. De waarden worden omgezet waar dat kan (tekst naar status maakt van elke unieke tekst een label; getal naar tekst behoudt het getal). Waarden die niet passen worden leeg.
- **Kolominstellingen**: naam, beschrijving en de instellingen van het type (eenheid en decimalen bij Numbers, aantal sterren bij Rating, tekst en kleur bij Button, voorvoegsel bij Auto number, enzovoort). Bij Numbers kies je ook de **samenvatting onderaan**: som, gemiddelde, minimum, maximum, mediaan, aantal of geen.
- **Kolompermissies**: bepaal wie de kolom mag zien en wie waarden mag wijzigen (iedereen, alleen board-eigenaren, specifieke personen of alleen toegewezen personen). Alleen board-eigenaren en admins kunnen dit instellen.
- **Verwijderen**

## 5. Boards koppelen (Connect boards)

Met Connect boards koppel je items aan items van een ander board, bijvoorbeeld klanten aan hun projecten en fases.

1. Open de kolominstellingen van de kolom **Projecten & fases** op het board **Klanten** (of voeg een nieuwe Connect boards-kolom toe).
2. Vink bij **Te koppelen boards** het board **Projecten & Fases** aan.
3. Kies bij **Tweerichtingskoppeling**:
   - **Maak een kolom op het andere board**: op Projecten & Fases verschijnt automatisch een kolom die terugwijst naar Klanten.
   - **Koppel aan bestaande kolom "Klant"**: gebruik een kolom die er al is.
   - **Alleen op dit board**: een eenrichtingskoppeling.
4. Zet **Beperk tot een item** aan als elk item maar een gekoppeld item mag hebben.
5. Klik op **Opslaan**.
6. Klik nu in een cel van de kolom. Zoek het item en vink het aan. Kies je een koppeling aan de ene kant, dan ziet het andere board hem ook. Verwijder je hem aan een kant, dan verdwijnt hij aan beide kanten.
7. Klik op de naam van een gekoppeld item om dat item te openen.

## 6. Gegevens van gekoppelde items tonen (Mirror)

1. Kies in het Column center **Mirror**.
2. Kies bij **Via kolom** de Connect boards-kolom (bijvoorbeeld "Projecten & fases").
3. Kies bij **Te tonen kolom** de kolom van het andere board (bijvoorbeeld "Uren begroot dev").
4. Kies bij **Samenvoegen als**: *Geen (lijst)* toont elke waarde apart, met de opmaak van de bron (statuskleuren blijven kleuren). *Som*, *Gemiddelde*, *Minimum*, *Maximum*, *Mediaan* of *Aantal* rekent de waarden samen, bijvoorbeeld de begrote uren per klant.
5. Klik op **Kolom maken**.

Een mirror is alleen-lezen en wordt altijd actueel getoond: verandert iemand de uren op Projecten & Fases, dan zie je de som meteen veranderen op Klanten.

## 7. Berekenen met een formule (Formula)

1. Kies in het Column center **Formula**.
2. Typ de formule. Verwijs naar kolommen met accolades en de kolomnaam: `{Uren} * {Tarief}`. Onder het veld staan de kolommen als knopjes: een klik voegt de verwijzing in. Bij een fout in de syntax of een onbekende kolom krijg je meteen een melding.
3. Stel optioneel decimalen en een eenheid (bijvoorbeeld EUR) in.
4. Klik op **Kolom maken**.

Wat je kunt gebruiken:

| Soort | Voorbeelden |
|---|---|
| Rekenen | `+  -  *  /  ^`, haakjes, `ROUND(x; 2)`, `ROUNDUP`, `ROUNDDOWN`, `ABS`, `SQRT`, `POWER`, `MOD`, `INT` |
| Samenvatten | `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`. Ze nemen ook de lijst van een mirror: `SUM({Uren dev})` |
| Logica | `IF(voorwaarde; dan; anders)`, `AND`, `OR`, `NOT`, `ISBLANK`, vergelijken met `= <> < <= > >=` |
| Datum | `TODAY()`, `DAYS({Einde}; {Start})`, `YEAR`, `MONTH`, `DAY`, `WEEKDAY`, `ADD_DAYS`, `DATE`, `FORMAT_DATE` |
| Tekst | `&` of `CONCATENATE`, `LEFT`, `RIGHT`, `MID`, `LEN`, `UPPER`, `LOWER`, `TRIM`, `SUBSTITUTE`, `REPLACE`, `SEARCH`, `TEXT`, `VALUE` |

Lege cellen tellen als 0 bij rekenen. Een fout (bijvoorbeeld delen door nul) toont `#ERROR`; de muis boven de cel toont de reden. Formules mogen naar andere formules verwijzen, maar niet naar zichzelf.

## 8. Andere berekende kolommen

- **Progress tracking**: percentage items dat klaar is, gebaseerd op de status van de subitems (of van gekoppelde items). Klaar = een label met de Klaar-vlag, of de naam Done, Afgerond, Klaar, Complete.
- **Auto number**: oplopend nummer in volgorde van aanmaken, met optioneel voorvoegsel en minimum aantal cijfers.
- **Item ID**: het unieke id van het item.
- **Creation log** en **Last updated**: tijdstip en persoon.
- **Item assignees**: iedereen die in een People-kolom van het item of van zijn subitems staat.

## 9. Afhankelijkheden (Dependency)

Kies bij een item de items van hetzelfde board die eerst klaar moeten zijn. Het systeem weigert een afhankelijkheid die een kringverwijzing maakt (A hangt van B af, B van C en C van A).

## 10. Samenvattingsrij

Onder elke groep staat per kolom een samenvatting: de som (of de gekozen functie) bij getallen, een gekleurde verdelingsbalk bij Status en Tags, de periode bij Timeline en datums, het totaal aantal bestanden, de gemiddelde beoordeling, de totale tijd bij Time tracking.

## 11. Problemen oplossen

| Melding of gedrag | Oorzaak en oplossing |
|---|---|
| "Column ... is not connected to a board yet" | De Connect boards-kolom heeft nog geen board. Open Kolominstellingen en kies een board. |
| "This dependency would create a cycle" | Kies een andere afhankelijkheid, de keten loopt rond. |
| Een kolom kan niet bewerkt worden | De kolom is alleen-lezen (berekend) of de kolompermissies laten het niet toe. |
| `#ERROR` in een formule | Open Kolominstellingen > Formule. Veelvoorkomend: delen door nul, tekst in een rekensom, onbekende kolomnaam. |
