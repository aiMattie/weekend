# Automations, workflows en integraties

Met automations laat je het board dingen zelf doen: een status verandert, dan verplaatst het item, een collega krijgt een melding of er ontstaat een nieuw item. Een automation bestaat uit drie delen: **Wanneer** (de trigger), optioneel **Als** (een voorwaarde) en **Dan** (een of meer acties).

Er zijn meer dan 60 kant-en-klare recepten, een eigen receptbouwer, een beheerpaneel met logboek, een workflow builder en een Integrations center.

## De Automation center openen

1. Open een board.
2. Klik rechtsboven op **Automate** (naast Uitnodigen).
3. De Automation center opent. Links staan de categorieën: **Notificaties**, **Statuswijziging**, **Terugkerend**, **Deadlines**, **Items aanmaken**, **Afhankelijkheden**, **Integraties**, **Subitems** en **Sprints**. Bovenaan staan de tabs **Recepten**, **Eigen recept bouwen**, **Mijn automations** en **Logboek**.

## Een recept gebruiken

Een recept is een zin met invulgaten, bijvoorbeeld "Wanneer **status** verandert naar **Done**, verplaats het item naar **groep**".

1. Kies een categorie links, of typ een zoekterm in **Zoek recepten** (bijvoorbeeld "verplaats").
2. Klik in de zin op een blauw invulgat en kies een waarde: een kolom, een label, een groep, een persoon. Het board vult al verstandige standaardwaarden in.
3. Klik op **Aan board toevoegen**. Onderaan verschijnt de melding "Automation toegevoegd".
4. De automation staat nu aan. Test hem: zet bij een item de status op **Done** en het item springt naar de gekozen groep.

## Je eigen recept bouwen

1. Open de tab **Eigen recept bouwen**.
2. Kies bij **Wanneer** een trigger, bijvoorbeeld "Wanneer een item wordt aangemaakt". Vul de gevraagde velden in.
3. Klik bij **Als** op **Voorwaarde toevoegen** om te filteren, bijvoorbeeld "kolom is leeg". Met meerdere voorwaarden kies je **EN** (alles moet kloppen) of **OF** (een is genoeg).
4. Klik bij **Dan** op **Actie toevoegen** en kies wat er moet gebeuren. Je kunt meer acties toevoegen en met de pijltjes de volgorde wijzigen.
5. Geef de automation een naam en klik op **Opslaan**. Je komt in **Mijn automations**.

Liever typen? Schrijf bovenaan een zin zoals "Wanneer status verandert naar Done, verplaats item naar groep Afgerond" en klik op **Vul het formulier in**. Controleer het resultaat en sla het op.

In teksten (melding, update, e-mail) kun je tekens gebruiken die automatisch worden ingevuld: `{item}`, `{board}`, `{group}`, `{column}`, `{from}`, `{to}`, `{user}`, `{link}` en `{item.<kolomnaam>}`.

### Triggers

Item aangemaakt, subitem aangemaakt, kolom verandert, status verandert naar (met optioneel "van"), subitem klaar, persoon toegewezen, op een knop geklikt (knopkolom), item verplaatst naar een groep, update geplaatst, datum breekt aan (met uren of dagen ervoor of erna en een tijdstip), terugkerend (elke dag, werkdag, week of maand), status duurt langer dan N dagen, sprint gestart, sprint afgesloten.

### Acties

Kolomwaarde wijzigen, status zetten, persoon toewijzen, melding sturen (in-app, optioneel ook e-mail), e-mail sturen, item aanmaken (op hetzelfde of een ander board, met kolomkoppeling), subitem aanmaken, item verplaatsen naar groep of board, item dupliceren, archiveren, verwijderen, update plaatsen, datum zetten (nu of relatief aan een andere datum), getal ophogen, timer starten of stoppen, item aanmaken vanuit een sjabloon, webhook versturen (met HMAC-ondertekening), Slack- of Teams-bericht sturen, epic met eerste taken aanmaken en een klant-workspace aanmaken vanuit het sjabloon.

### Voorbeelden

- **Fase op Go:** "Wanneer **Fasestatus** verandert naar **Go**, maak een epic aan op **Epics** met de eerste taken op **Taken**" (categorie Items aanmaken).
- **Wacht op klant:** "Wanneer **Status** langer dan **5** dagen op **Wacht op klant** staat, stuur **Accountmanager** een seintje" (categorie Notificaties).
- **Fase Afgerond:** "Wanneer **Fasestatus** verandert naar **Afgerond**, maak een factuurtaak aan op **Taken** en stuur **personen** een melding".
- **Nieuwe klant:** "Wanneer een nieuw item wordt aangemaakt, maak een klant-workspace aan vanuit het sjabloon" (op het board Klanten).

## Automations beheren

Open **Mijn automations**. Per automation zie je een samenvatting, de laatste run en het aantal runs.

1. **Aan of uit zetten:** klik op de schakelaar. Een uitgeschakelde automation doet niets meer, maar blijft bewaard.
2. **Bewerken:** klik op **Bewerken** om de receptbouwer te openen met de huidige inhoud.
3. **Dupliceren:** klik op **Dupliceren**. De kopie staat uit tot je hem aanzet.
4. **Verwijderen:** klik op **Verwijderen** en bevestig.
5. **Geschiedenis:** klik op **Geschiedenis** voor de runs van deze automation.

## Het logboek

Op de tab **Logboek** zie je alle runs van het board: tijd, automation, item, status en resultaat. Een run heeft de status **Gelukt**, **Mislukt**, **Wordt opnieuw geprobeerd**, **Overgeslagen** of **Wacht op goedkeuring**.

- Een mislukte stap wordt automatisch tot drie keer opnieuw geprobeerd (na 1 en 5 minuten). De foutmelding staat in het logboek. Klik bij een mislukte run op **Opnieuw proberen** om hem direct te herhalen.
- **Overgeslagen** met "Loop protection" betekent dat een automation zichzelf zou aanroepen (bijvoorbeeld A zet de status, waardoor B A weer start). Zo'n kringloop wordt na een paar stappen afgebroken.
- Er gelden limieten per board per uur en per account per maand. Bij het bereiken van de limiet staat de run als Overgeslagen met de reden.

## Meldingen en e-mail

De actie **Stuur een melding** maakt een melding in de Inbox van de gekozen personen. Zet **ook e-mailen** aan om dezelfde melding per e-mail te versturen. Ontvangers kun je kiezen als vaste persoon, "maker van het item", "persoon die de wijziging deed" of "personen in een kolom".

E-mail gaat via SMTP. Standaard is dat de lokale mail catcher op `127.0.0.1:1025`. Instellen kan met de omgevingsvariabelen `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS` en `SMTP_SECURE`.

## Workflows (workflow builder)

Een workflow is een automation met vertakkingen en goedkeuringen, getekend als stappenschema. Hij gebruikt dezelfde motor als gewone automations.

1. Klik in de zijbalk op **Workflows** en kies een board en een naam. Klik op **Nieuwe workflow**.
2. Kies de trigger bovenaan.
3. Klik op **+ Stap toevoegen** voor een actie, **+ Vertakking** voor een Als/Anders-keuze, of **+ Goedkeuring** voor een stap waarop iemand moet akkoorden. Bij een vertakking vul je de voorwaarde in en bouw je de paden **Dan** en **Anders**.
4. Klik op **Concept opslaan** om te bewaren zonder te activeren.
5. Klik op **Publiceren** om de workflow aan te zetten. Een gepubliceerde workflow die je wijzigt gaat terug naar Concept tot je opnieuw publiceert.
6. Bij een goedkeuringsstap krijgt de goedkeurder een melding. Onder **Workflows > Wachtende goedkeuringen** klikt hij op **Goedkeuren** (de workflow gaat verder) of **Afwijzen** (de run stopt).

## Integrations center

Klik in de zijbalk op **Integrations**. Elke kaart toont of de koppeling **Verbonden** of **Niet verbonden** is.

- **Slack en Microsoft Teams:** klik op **Verbinden**, plak de inkomende webhook-URL van het kanaal en sla op. Daarna kies je het kanaal in de actie "Stuur een Slack/Teams-bericht".
- **GitHub, Jira, Gmail, Outlook en Inkomende webhook:** klik op **Verbinden**, kies het board (en eventueel de groep) waarop nieuwe items komen en sla op. Je krijgt een geheime URL. Elke POST naar die URL maakt een item aan. GitHub controleert de handtekening met je webhook-secret; Jira en GitHub vertalen issues en pull requests naar items. Bij Gmail en Outlook gebruik je een filter, Apps Script of Power Automate die de mail naar de URL stuurt. Met **Veldkoppeling** koppel je JSON-velden aan kolommen, bijvoorbeeld `date=$.deadline`.
- **Nieuwe URL genereren** maakt de oude URL ongeldig.

### Uitgaande webhooks

Onderaan het Integrations center stuur je events van een board (of het hele account) naar je eigen URL.

1. Klik op **Webhook toevoegen**, vul de URL in, kies het board en de events (bijvoorbeeld `create_item` of `change_status_column_value`).
2. Klik op **Opslaan**. Met **Test** stuur je een testbericht en met **Leveringen** zie je het logboek met status, antwoordcode en pogingen.
3. Elke aanroep is ondertekend: de header `X-Webhook-Signature` bevat `t=<tijd>,v1=<HMAC-SHA256 van "<tijd>.<body>">` met het secret van de webhook. Controleer die aan jouw kant.
4. Mislukte leveringen worden opnieuw geprobeerd na 30 seconden, 2 minuten, 10 minuten, 1 uur en 6 uur. Daarna staat de levering op **dead**; klik op **Opnieuw** om hem handmatig te herhalen.

Beperkingen: e-mail gaat via SMTP en staat standaard op een lokale mail catcher (`127.0.0.1:1025`). Zonder SMTP-instellingen komt een e-mail dus niet bij de ontvanger aan. Integraties werken via webhook-URL's en handtekeningen; er is geen inlogkoppeling (OAuth) met Slack, GitHub of Microsoft. De workflow builder is een lichte uitvoering met stappen, vertakkingen en goedkeuringen.
