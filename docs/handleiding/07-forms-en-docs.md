# Forms, Docs en Whiteboards

## Forms

Met een **Form** (WorkForm) laat je mensen binnen of buiten je team een aanvraag indienen. Elke inzending wordt een **item** op een achterliggend **board**, met de antwoorden als kolomwaarden en als **update** op het item.

### Een formulier maken

1. Open **Forms** in de zijbalk of de rail links.
2. Klik op **Nieuw formulier**, geef het een naam en kies de **Workspace**.
3. Kies bij **Achterliggend board** voor *Nieuw board maken* (standaard) of *Bestaand board gebruiken* en kies dan het board.
4. Klik op **Formulier maken**. De bouwer opent.

### Vragen bouwen

1. Links staan de **Vragen**. De eerste vraag (*Name*) wordt de naam van het nieuwe item en is altijd verplicht. Alle andere kolommen van het board staan er ook als vraag in.
2. Sleep een vraag aan het handvat om de volgorde te wijzigen.
3. Klik op **Vraag toevoegen** om een kolom die er nog niet in zit toe te voegen, of kies **Tekstblok toevoegen** voor uitleg zonder antwoord.
4. Klik op een vraag (links of in het voorbeeld in het midden). Rechts, op het tabblad **Vraag**, stel je in:
   - de titel en beschrijving en, bij tekstvelden, een placeholder;
   - **Verplicht** en **Verborgen voor invullers**;
   - bij Status- en Dropdown-vragen welke opties beschikbaar zijn;
   - **Voorwaardelijke logica**: klik op *Voorwaarde toevoegen*, kies een andere vraag en een voorwaarde (gelijk aan, bevat, is ingevuld, is leeg). De vraag verschijnt alleen als aan de voorwaarde is voldaan. Een verborgen vraag is nooit verplicht en wordt niet opgeslagen.
5. Een vraag verwijder je met **Vraag verwijderen**.

### Ontwerp en bedankpagina

Op het tabblad **Ontwerp** zet je een beschrijving, omslagafbeelding en logo (URL), de hoofdkleur en achtergrondkleur, de tekst van de verzendknop en de **Bedankpagina** (titel, bericht en eventueel een URL waarnaar na verzenden wordt doorgestuurd).

### Toegang en beveiliging

Op het tabblad **Instellingen**:

- **Wachtwoord**: bezoekers moeten het wachtwoord invullen voordat ze het formulier zien.
- **Alleen ingelogde gebruikers** en **Eén antwoord per gebruiker** (vereist inloggen).
- **Tags** worden boven het formulier getoond.

Het openbare formulier heeft een ingebouwde spamfilter (verborgen veld) en een limiet van 5 inzendingen per minuut per bezoeker.

### Publiceren en delen

1. Klik op **Publiceren**. Zolang het formulier een *Concept* is, geeft de link een melding dat het formulier niet bestaat.
2. Klik op **Delen** voor de openbare link (`/f/<code>`) en de **Embed-code** (een iframe die je in een website plakt). Met **Kopieren** zet je ze op het klembord.
3. Met **Nieuwe link maken** vervang je de code; de oude link werkt dan niet meer.

### Invullen en resultaat bekijken

1. Open de link, ook zonder in te loggen (bijvoorbeeld in een privevenster).
2. Vul de velden in en klik op **Verzenden**. Verplichte velden zonder antwoord krijgen een melding.
3. Je ziet de bedankpagina met je eigen titel en bericht, en de knop **Nog een antwoord versturen**.
4. Open het achterliggende board (knop **Board openen** in de bouwer): de inzending staat daar als nieuw item. Open het item en kijk bij **Updates** voor de antwoorden.

### Inzendingen via API of MCP

`POST /api/v1/forms/<id>/submissions` met `{ "answers": { "name": "...", "status": "Done" } }` maakt een inzending (antwoorden op vraag-id, kolomsleutel of vraagtitel). De MCP-tool `create_form_submission` doet hetzelfde.

## Docs

Een **Doc** (WorkDoc) is een document met blokken, in een workspace of vast aan een item. Je schrijft met kopjes, lijsten, checklists, tabellen, code, afbeeldingen en verwijzingen naar boards en items, en je werkt samen met opmerkingen en @mentions.

### Een doc maken

1. Open **Docs** in de zijbalk of de rail links.
2. Kies rechtsboven de **workspace** waarin het doc moet komen en klik op **Nieuw doc**.
3. Typ de titel bovenaan en klik in de pagina om te beginnen met schrijven. Wijzigingen worden automatisch bewaard; rechtsboven staat *Opgeslagen* zodra alles binnen is.

### Schrijven met blokken

1. Typ **/** op een lege regel voor het opdrachtenmenu (Kop 1 tot 3, Opsomming, Genummerde lijst, Checklist, Tabel, Codeblok, Citaat, Scheidingslijn, Afbeelding, Bestand, Board, Item). Typ verder om te filteren, bijvoorbeeld `/kop`.
2. De werkbalk boven de pagina doet hetzelfde met knoppen, plus vet, cursief, onderstreept, doorgehaald, code en links.
3. In een tabel verschijnen extra knoppen om rijen en kolommen toe te voegen of te verwijderen.
4. Met **Afbeelding** of **Bestand** voeg je een afbeelding of bijlage toe (bestanden tot 2 MB).
5. Kies **Cover toevoegen** boven de titel voor een kleur of een afbeelding als omslag.

### Mensen noemen en verwijzen naar boards en items

1. Typ **@** en een deel van een naam. Kies de persoon uit de lijst. De persoon krijgt een melding in de **Inbox** met een link naar het doc.
2. Klik in de werkbalk op **Board** of **Item** om een blok in te voegen dat naar een board of item linkt. Bij een item kies je eerst het board en daarna het item.

### Opmerkingen bij een blok

1. Beweeg de muis over een blok. Links verschijnt een rond **+**-knopje; klik erop.
2. Schrijf de opmerking in het paneel rechts. Typ **@** om iemand te noemen en klik op **Plaatsen**.
3. Een blok met een open opmerking krijgt een gele rand. Gebruik **Afhandelen** als het opgelost is en **Toon afgehandeld** om afgehandelde opmerkingen terug te zien.

### Versies

1. Klik op **Versies**. Tijdens het bewerken wordt er automatisch ongeveer elke vijf minuten een versie bewaard.
2. Klik op **Versie opslaan** om nu een versie vast te leggen, of op **Herstel** bij een oudere versie. De huidige tekst blijft dan bewaard als nieuwe versie.

### Delen en exporteren

1. Klik op **Delen**. Standaard kan iedereen met toegang tot de workspace het doc bewerken. Kies **Privé** en voeg personen toe (bewerken of alleen lezen) om het te beperken. Alleen de eigenaar en admins wijzigen het delen.
2. Klik op **Exporteer Markdown** om het doc als `.md`-bestand te downloaden.

### Een doc bij een item

Een doc kan aan een item hangen (bijvoorbeeld via een Doc-kolom). Het doc opent dan met de naam van het item als titel en bovenaan staat een kruimelpad terug naar het item.

## Whiteboards

Een **Whiteboard** is een oneindig canvas om te brainstormen: sticky notes, vormen, tekst, verbindingen, tekeningen en afbeeldingen.

### Een whiteboard maken en gebruiken

1. Open **Whiteboards** in de zijbalk en klik op **Nieuw whiteboard**. Geef het bovenaan een naam.
2. Kies links in de werkbalk een gereedschap en klik op het canvas om iets te plaatsen: **Sticky note**, **Rechthoek**, **Ellips**, **Ruit** of **Tekst**. Typ meteen de tekst; klik ergens anders om te bevestigen. Dubbelklik later op een element om de tekst te wijzigen.
3. Kies een **kleur** in het kleurenpaneel; met een geselecteerd element verandert de kleur direct.
4. Gebruik **Verbinding** en sleep van het ene element naar het andere. De lijn blijft meebewegen als je een element verplaatst.
5. Met **Tekenen** maak je een vrije lijn. Met **Afbeelding** voeg je een afbeelding toe via een URL (laat de URL leeg om een bestand te kiezen).
6. Met **Selecteren** klik je een element aan, sleep je het naar een andere plek en pas je het formaat aan met het vierkantje rechtsonder. **Dupliceren**, **Verwijderen** en **Ongedaan maken** staan onderaan de werkbalk (Ctrl+D, Delete en Ctrl+Z werken ook).
7. Schuif door op de achtergrond te slepen (of Spatie ingedrukt te houden), en zoom met Ctrl+scrollen of de knoppen rechtsonder.

### Samenwerken

Het whiteboard wordt automatisch bewaard. Collega's die tegelijk meekijken zien je wijzigingen binnen een paar seconden; wijzigingen van collega's overschrijven nooit wat jij zojuist hebt aangepast.

Beperkingen: een Doc exporteer je alleen als Markdown (geen Word of PDF) en bijlagen in een doc zijn maximaal 2 MB. Het Whiteboard is een lichte uitvoering: sticky notes, vormen, tekst, verbindingen, tekeningen en afbeeldingen. Een openbaar formulier schrijft zonder login naar het board; publiceer het alleen als dat de bedoeling is.
