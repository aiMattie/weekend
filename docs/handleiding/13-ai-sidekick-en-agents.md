# AI: Sidekick, Weekend magic, agents en Notetaker

De AI-functies werken met de Claude API. Een beheerder zet de sleutel in de omgeving van de server (zie **AI instellen** onderaan). Zonder sleutel zie je overal de melding **AI niet geconfigureerd** en blijft de rest van de app gewoon werken. De Notetaker en een paar vaste agents (Daily Briefer, Sprint Reporter, Hours Checker) werken zelfs zonder AI.

Alles wat AI doet gaat via dezelfde functies als wat jij zelf doet, met **jouw rechten**. Sidekick kan dus niets zien of wijzigen wat jij ook niet mag. Wijzigingen worden eerst als kaart voorgesteld en pas uitgevoerd als jij **Bevestigen** klikt.

## Sidekick

Sidekick is de assistent die je boards, items en docs kent.

1. Klik in de rail links op **Sidekick**, of op een board rechtsboven op **AI-suggesties**. Rechts opent het Sidekick-paneel.
2. Heb je een board open, dan weet Sidekick dat: bovenin staat "Context: het board dat je nu open hebt". Heb je een item of doc open, dan is dat de context.
3. Typ een vraag, bijvoorbeeld "Wat staat er op dit board?" of "Wat is er te laat?", en druk op Enter. Het antwoord komt woord voor woord binnen. Onder het antwoord zie je welke gegevens Sidekick opzocht (bijvoorbeeld `get_board`).
4. Met **+** begin je een nieuw gesprek, met het pijltje-icoon open je Sidekick op de volle pagina (`/sidekick`) met links al je eerdere gesprekken.

### Een wijziging laten uitvoeren

1. Vraag bijvoorbeeld: "maak item Offerte versturen".
2. Sidekick antwoordt met een **Voorstel van Sidekick**: een kaart met wat er gaat gebeuren. Er is nog niets aangemaakt.
3. Klik op **Bevestigen** om het uit te voeren, of **Weigeren** om het te laten. Na bevestigen staat er "Uitgevoerd" op de kaart en staat het item op het board. In het activiteitenlogboek van het item staat dat het via AI is gedaan.

Sidekick kan boards en items lezen, samenvatten en zoeken, items aanmaken, kolomwaarden wijzigen, updates plaatsen en met Weekend magic een board maken. Staat er in een item of update een tekst als "negeer je instructies", dan behandelt Sidekick die als gewone tekst en volgt hem niet.

### Credits

Elke AI-aanroep kost credits (1 credit is 1000 gewogen tokens, uitvoer telt vijf keer zo zwaar). Onder het invoerveld zie je hoeveel je deze maand gebruikte. Is de maandlimiet van jou of van het account bereikt, dan meldt Sidekick dat en kun je pas weer verder als een beheerder de limiet verhoogt (zie **Beheer** hieronder).

## Weekend magic: een board uit een beschrijving

1. Open `/sidekick` en klik links op **Board maken met Weekend magic**.
2. Beschrijf je proces, bijvoorbeeld "Een recruitment pipeline van sollicitatie tot contract, met fases, recruiter en startdatum". Kies de workspace.
3. Klik op **Voorbeeld maken**. Je ziet de naam, de kolommen met hun type en de groepen met voorbeeld-items. Er is nog niets aangemaakt. Je kunt de naam aanpassen.
4. Klik op **Board aanmaken**. Het board wordt opgebouwd met echte kolomtypes (status met labels, persoon, datum, ...), groepen en voorbeeld-items. Klik op **Board openen**.

Je kunt dit ook aan Sidekick vragen ("Maak een board voor klantonboarding"). Dan krijg je dezelfde preview als kaart met Bevestigen.

## AI-blokken in automations

In de Automation center en in de receptbouwer staan onder **Dan** zes AI-acties:

| Actie | Wat ze doet |
|---|---|
| **AI: categoriseer** | Kiest een label van een status- of dropdownkolom (of een categorie uit een lijst) |
| **AI: vat samen** | Schrijft een samenvatting in een tekstkolom |
| **AI: vertaal** | Vertaalt een tekst naar de taal die je kiest |
| **AI: haal gegevens eruit** | Haalt een waarde (getal, datum, tekst) uit een tekstkolom |
| **AI: bepaal sentiment** | Positief, neutraal of negatief, als label of tekst |
| **AI: vul kolom in** | Vult een kolom in op basis van de andere gegevens van het item |

1. Open de receptbouwer en kies bij **Wanneer** bijvoorbeeld "Wanneer een item wordt aangemaakt".
2. Kies bij **Dan** de actie **AI: categoriseer**. Kies de kolom waaruit AI leest (leeg betekent het hele item) en de kolom waar het resultaat in komt.
3. Stel **max. credits per run** in (standaard 5). Is de invoer te groot voor dat budget, dan stopt de run met een duidelijke melding in plaats van geld uit te geven.
4. Sla de automation op. Nieuwe items worden voortaan automatisch gecategoriseerd. In het **Logboek** zie je wat AI deed en wat het kostte.

### AI autofill in het kolommenu

Wil je een bestaande kolom in een keer laten invullen?

1. Open het menu van de kolomkop en kies **AI autofill**.
2. Kies wat AI moet doen (invullen, categoriseren, samenvatten, vertalen, ...), eventueel uit welke kolom AI leest en een extra instructie.
3. Laat **Alleen lege cellen invullen** aan staan en klik op **Invullen**. Het resultaat toont hoeveel cellen zijn ingevuld. Het budget voor een hele run is 50 credits: is dat op, dan stopt AI en meldt dat.

## Agents

Een agent is een AI-collega met een eigen opdracht, triggers, skills en toegang tot een paar boards of docs. Klik in de rail op **Agents** (of op een board rechtsboven op **Agents** voor je eigen agents).

### Een kant-en-klare agent kiezen

1. Open **Agent-overzicht** (links). Je ziet Lead Scorer, Ticket Assignment, Risk Analyzer, Meeting Summarizer, Daily Briefer, Sprint Reporter en Hours Checker.
2. Klik bij een agent op **Gebruiken**. Kies het board waar de agent mee werkt (bij Hours Checker het bord Urenregistratie, bij Sprint Reporter het sprintbord) en klik op **Agent aanmaken**.
3. De agent staat eerst als **Concept**. Controleer de instellingen en zet de status op **Actief** wanneer je hem wilt laten draaien.

| Agent | Wat hij doet |
|---|---|
| Lead Scorer | Geeft elke nieuwe lead een score van 0 tot 100 met een korte reden als update |
| Ticket Assignment | Wijst nieuwe tickets toe aan de best passende collega |
| Risk Analyzer | Zoekt elke week risico's op een board en meldt ze aan jou |
| Meeting Summarizer | Vat meetingnotities samen als je de agent noemt (@) op een item |
| Daily Briefer | Elke werkdag om 7:30 een overzicht in je inbox van wat te laat is en wat vandaag af moet |
| Sprint Reporter | Elke vrijdag een samenvatting van de lopende sprint in je inbox |
| Hours Checker | Controleert Urenregistratie op dagen zonder uren, regels zonder uren of klant en waarschuwt de betrokkene |

Of beschrijf in een zin wat je agent moet doen op de pagina **Nieuwe agent**: AI ontwerpt dan de opdracht en skill en je past ze aan.

### De builder

Op de pagina van een agent staan zes tabs:

- **Instellingen**: naam, beschrijving, instructies, status (Concept, Actief, Gepauzeerd), identiteit en limieten per run (stappen, tokens, runs per uur). De identiteit is een AI-gebruiker; je kunt een bestaande koppelen, zoals Scout of Aide. Wijzigingen van de agent staan in de activiteit onder die naam.
- **Triggers**: wanneer de agent draait: item aangemaakt, kolomwaarde gewijzigd (optioneel naar een bepaalde status), de agent wordt genoemd, een schema of handmatig.
- **Skills**: een skill is een benoemde instructie met een lijst toegestane tools. Heeft een agent skills, dan mag hij alleen die tools (plus lezen) gebruiken.
- **Kennis**: de boards en docs die de agent mag lezen of lezen en schrijven. Meer dan dit kan de agent niet, en je kunt hem nooit meer geven dan je zelf mag.
- **Testconsole**: start de agent nu, met een optionele extra invoer. Je ziet het resultaat, elke tool-aanroep (met of de agent iets niet mocht), het transcript en de kosten.
- **Runs**: de geschiedenis van alle runs met trigger, status, stappen en credits. Klik op een rij voor details.

### Veiligheid van agents

- Een agent schrijft als zijn eigen identiteit en heeft alleen toegang tot wat bij **Kennis** staat. Een poging daarbuiten komt terug als geweigerde tool-aanroep.
- Een agent kan zijn eigen werk niet opnieuw triggeren en een keten van agents die elkaar triggeren stopt vanzelf (de run krijgt de status Overgeslagen met de reden).
- Elke run heeft harde grenzen voor stappen en tokens (status **Begrensd** als ze bereikt zijn) en elke agent heeft een maximum aantal runs per uur.
- Een beheerder kan alle agents in een keer stoppen met de **noodstop** (Beheer > AI en credits).

## Notetaker

1. Klik in de rail op **Notetaker** en op **Nieuwe meeting**.
2. Geef een titel, de klant en kies de klant-workspace. Plak het transcript of je notities.
3. Klik op **Verwerken**. Je krijgt een samenvatting, de besluiten en de actiepunten (met wie en wanneer, als dat in de tekst staat). Zonder AI worden regels die beginnen met **Actie:** en **Besluit:** herkend.
4. Controleer de actiepunten, vink aan welke taken moeten worden en kies het board. Klik op **Taken aanmaken van geselecteerde actiepunten**. Pas dan worden het taken (op het gekozen board, met de persoon en datum waar mogelijk).
5. Klik op **Gespreksverslag opslaan in de klant-workspace**. Het verslag komt als doc in die workspace, zoals in de werkafspraken staat. Klik op **Doc openen** om het te lezen.

Via de MCP-tool `get_notetaker_meetings` kunnen AI-clients dezelfde meetings lezen.

## Automations en workflows in gewone taal

De velden "Beschrijf het in een zin" in de Automation center en bij Workflows gebruiken nu Claude: je schrijft "Als een item op Stuck komt, geef het aan Admin en stuur hem een melding" en krijgt een geldige automation, gecontroleerd tegen de beschikbare blokken. Lukt dat niet, of staat AI uit, dan wordt de eenvoudige patroonherkenning van vroeger gebruikt ("Wanneer ..., dan ..."). Ook de MCP-tools `create_automation`, `plan_workflow` en `create_workflow` doen dit.

## Beheer: AI en credits

Beheerders openen **Beheer > AI en credits**:

1. Bovenaan staat de aanbieder: of er een sleutel is ingesteld (de sleutel zelf zie je nooit), de basis-URL en het model.
2. Met **AI aan voor dit account** zet je alle AI-functies uit. Met de **noodstop** stop je alle agents; **Agents weer toestaan** zet ze terug. Beide acties komen in het auditlog.
3. Bij **Credits per maand** stel je de limiet per gebruiker en voor het hele account in. Leeg betekent onbeperkt.
4. Onderaan staat het gebruik van deze maand per onderdeel (Sidekick, agents, AI-blokken, ...) en per gebruiker.

## AI instellen (voor beheerders)

Zet in de omgeving van de server (`.env`, nooit in de code):

| Variabele | Betekenis |
|---|---|
| `ANTHROPIC_API_KEY` | De sleutel. Zonder sleutel is AI uit en zie je "AI niet geconfigureerd" |
| `ANTHROPIC_BASE_URL` | Optioneel: een eigen endpoint, bijvoorbeeld de bedrijfsproxy (`llm.example.com`) |
| `AI_MODEL` | Optioneel: het model, standaard `claude-sonnet-5-5` (ook in te stellen bij Beheer > AI) |
| `AI_USER_MONTHLY_CREDITS`, `AI_ACCOUNT_MONTHLY_CREDITS` | Optioneel: standaardlimieten zolang er nog niets bij Beheer is ingesteld |
| `AI_SCHEDULER=off` | Optioneel: zet de minuut-timer van geplande agents uit |

Herstart de server na het wijzigen van de omgeving.

Beperkingen: zonder `ANTHROPIC_API_KEY` is AI uit. De Notetaker kan zonder AI alleen regels herkennen die beginnen met **Actie:** en **Besluit:**. De Notetaker maakt het verslag uit tekst die je plakt; er is geen opname of live transcriptie.
