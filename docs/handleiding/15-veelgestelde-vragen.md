# Veelgestelde vragen

Dit hoofdstuk helpt als iets niet werkt zoals je verwacht, legt uit wat er (nog) niet in Weekend zit, bevat alle sneltoetsen en zegt wie wat beheert.

## Problemen oplossen

### Inloggen en toegang

| Wat je ziet | Oorzaak en oplossing |
|---|---|
| "Onjuiste e-mail of wachtwoord" | Controleer het e-mailadres en het wachtwoord. Een beheerder kan je account heractiveren of een nieuwe uitnodiging sturen ([Beheer en rechten](12-beheer-en-rechten.md)). Is je account gedeactiveerd, dan kom je er niet meer in. |
| Op de loginpagina staat een melding na **Inloggen met Google** of **Inloggen met Microsoft** | **Geen account**: vraag een beheerder je uit te nodigen of automatisch aanmaken aan te zetten. **Domein niet toegestaan**: gebruik je zakelijke account. **Niet geverifieerd**: Google of Microsoft heeft het e-mailadres niet bevestigd (bij Microsoft: vraag de beheerder `MICROSOFT_TENANT_ID` op jullie eigen tenant te zetten). **Gedeactiveerd of vergrendeld**: neem contact op met een beheerder. **Verlopen**: probeer het opnieuw en gebruik dezelfde browser. |
| Niemand kan nog inloggen en **Alleen inloggen met SSO** staat aan | Een beheerder met serverrechten voert `npm run auth:break-glass -- naam@example.com` uit; dat zet de afdwinging uit zodat wachtwoorden weer werken. Beheerders met **noodtoegang** kunnen altijd via het linkje **Noodtoegang** op de loginpagina met hun wachtwoord inloggen. De afdwinging vervalt ook vanzelf als Google en Microsoft allebei niet meer geconfigureerd zijn ([Beheer en rechten](12-beheer-en-rechten.md#inloggen-met-google)). |
| Je wordt steeds naar de loginpagina gestuurd | Je sessie is verlopen (14 dagen) of een beheerder heeft je afgemeld. Log opnieuw in. |
| "Toegang vanaf dit IP-adres is niet toegestaan" | Een beheerder heeft een IP-beperking ingesteld (Beheer > Beveiliging). Vraag om je adres toe te voegen. |
| "Board niet gevonden of geen toegang" | Het board is **Private** en je bent geen lid, of het is verwijderd. Vraag een board owner je toe te voegen via **Uitnodigen**, of kijk in de **Prullenbak**. |
| Een gast ziet maar een paar boards | Dat klopt: gasten zien alleen de boards die met hen zijn gedeeld. |
| Je kunt een kolom of item niet bewerken | Je hebt alleen kijkrechten, de kolom is berekend (alleen-lezen), of de kolompermissies laten het niet toe. Vraag een board owner. |

### Werken in de tabel

| Wat je ziet | Oorzaak en oplossing |
|---|---|
| Items ontbreken op het board | Er staat een filter, zoekopdracht of persoonsfilter aan. Een knop met een blauw getal in de werkbalk heeft iets actiefs. Klik op **Filter** en dan op **Alle filters wissen**, en wis het zoekveld en het persoonsfilter. |
| Slepen van rijen werkt niet | Het board is gesorteerd of gegroepeerd op een kolom. Zet **Sort** en **Group by** uit. |
| Een formule toont `#ERROR` | Delen door nul, tekst in een rekensom of een onbekende kolomnaam. Open **Kolominstellingen** en controleer de formule ([Columns](02-columns.md)). |
| Een mirror of connect-boards-kolom blijft leeg | De kolom heeft nog geen gekoppeld board, of de items zijn niet gekoppeld. Open **Kolominstellingen** en kies het board. |
| Je wijziging is weg na Ctrl+Z | Ctrl+Z maakt de laatste actie ongedaan. Met **Ctrl+Shift+Z** of **Ctrl+Y** voer je haar opnieuw uit. In een tekstvak geldt de ongedaan-functie van dat tekstvak. |
| Een collega ziet je wijziging niet | Het board werkt live. Ververs de pagina met **F5** als de verbinding is weggevallen. |
| Een groot bestand uploaden lukt niet | In een Files-kolom is 9 MB per bestand het maximum, in een Doc 2 MB. |

### Automations, formulieren en uren

| Wat je ziet | Oorzaak en oplossing |
|---|---|
| Een automation doet niets | Open **Automate** en **Mijn automations** en controleer of de schakelaar aan staat. Kijk op **Logboek** naar **Mislukt** of **Overgeslagen**. |
| Run **Overgeslagen** met "Loop protection" | Twee automations roepen elkaar aan. Pas een van de twee aan. |
| Run **Overgeslagen** door een limiet | Er geldt een limiet per board per uur en per account per maand. Wacht tot de limiet vrij is. |
| Een formulierlink zegt dat het formulier niet bestaat | Het formulier is nog een **Concept**. Klik in de bouwer op **Publiceren**. Na **Nieuwe link maken** werkt de oude link niet meer. |
| Uren staan niet bij de fase op Projecten & Fases | De urenregel heeft geen **Fase** (of **Klant**). Open de regel in **Urenregistratie** en kies de fase. De sommen tellen alleen regels met een fase ([Uren en Delivery](09-uren-en-delivery.md)). |
| Het snelle uren-formulier ontbreekt | Het formulier **Uren snel invullen** staat als concept op de pagina **Forms**. Een beheerder moet het publiceren. |
| De timer op een taak telt niet bij de uren | Dat is bedoeld. Facturatie gebruikt alleen het board **Urenregistratie** ([Werkafspraken](14-werkafspraken.md)). |
| Een sprint kan niet starten | Er is al een actieve sprint. Sluit die eerst af met **Complete sprint**. |

### API, MCP en AI

| Wat je ziet | Oorzaak en oplossing |
|---|---|
| HTTP 401 bij de API of MCP | Het token is ingetrokken, verlopen of verkeerd gekopieerd. Maak een nieuw token ([MCP en API](10-mcp-en-api.md)). |
| `UserUnauthorizedException` bij een mutation | Het token heeft alleen **Lezen**. Maak een token met **Schrijven**. |
| HTTP 429 | Het dag- of minuutbudget van het token is op. Wacht tot `Retry-After` verstreken is. |
| "AI niet geconfigureerd" | De server heeft geen sleutel voor AI. Een beheerder stelt dat in ([AI en agents](13-ai-sidekick-en-agents.md)). Notetaker, Daily Briefer, Sprint Reporter en Hours Checker werken wel zonder. |
| Een kaart (Map-view) blijft grijs | De kaarttegels komen van OpenStreetMap en hebben internet nodig. De markers staan er wel. |
| Het lettertype lijkt anders | De webfont komt van Google Fonts. Zonder internet valt de pagina terug op een systeemlettertype. |

## Beperkingen

Dit is anders of ontbreekt:

- **Zelf hosten**: je draait Weekend zelf (Docker of Node.js). Er is geen mobiele app.
- **Geen marketplace of apps-framework**: apps van derden, eigen widgets en eigen views via een app bestaan niet.
- **Integraties** zijn webhook-koppelingen (Slack, Microsoft Teams, GitHub, Bitbucket, Jira, Gmail, Outlook en een inkomende webhook). Er is geen inlogkoppeling met die diensten via een marketplace.
- **Weekend dev** bevat sprints, backlog, burndown, velocity, Complete sprint, bugs, retrospectives en Git-koppeling. Wat in [Development](08-dev-sprints.md) staat is er.
- **SSO**: inloggen met Google werkt (OAuth 2.0 / OpenID Connect). **SAML** is een stub: het scherm toont de gegevens van deze app, maar er wordt niets met een identity provider uitgewisseld. SCIM is niet aangesloten.
- **Abonnement**: het scherm is alleen lezen. Er wordt niets afgerekend en het standaardplan blokkeert niets.
- **Whiteboard** en **Workflow builder** zijn lichte uitvoeringen met de belangrijkste functies.
- **AI** werkt via de Claude API en alleen als een beheerder een sleutel heeft ingesteld. Schrijfacties van Sidekick voer je pas uit nadat je ze hebt bevestigd.
- **API en MCP**: alleen de GraphQL-types en MCP-tools uit [MCP en API](10-mcp-en-api.md) bestaan. Extra: tools voor agents, Notetaker en sprints.
- **Terminologie**: Board, Group, Item, Update, Workspace en Column blijven Engels. De rest van de schermen is Nederlands.
- **Importer**: de monday.com-importer leest alleen uit de monday.com-account en schrijft er nooit naar ([Import](11-import.md)).

## Sneltoetsen

**Overal**

| Toets | Wat het doet |
|---|---|
| **/** of **Ctrl+K** | zoeken in alles (boards, items, updates, docs, workspaces, mensen) |
| **Esc** | venster, menu of zoekscherm sluiten |

**Board**

| Toets | Wat het doet |
|---|---|
| **Ctrl+Z** | laatste actie ongedaan maken |
| **Ctrl+Shift+Z** of **Ctrl+Y** | opnieuw uitvoeren |

**Tabel (klik eerst op een cel)**

| Toets | Wat het doet |
|---|---|
| **Pijltjes** | naar de buurcel |
| **Enter** of **F2** | de cel bewerken |
| een letter of cijfer | begint met bewerken en neemt het teken over |
| **Tab** / **Shift+Tab** | opslaan en naar de volgende of vorige cel |
| **Esc** | bewerken annuleren, daarna de selectie wissen |
| **Delete** of **Backspace** | de cel leegmaken |
| **Ctrl+C** / **Ctrl+V** | cel kopiëren en plakken |
| **Spatie** | de rij selecteren of de selectie opheffen (met **Shift** een reeks) |

**Itempaneel en updates**

| Toets | Wat het doet |
|---|---|
| **Ctrl+Enter** | update plaatsen |
| **Esc** | een geopende lijst of voorbeeld sluiten |

**Whiteboard**

| Toets | Wat het doet |
|---|---|
| **Ctrl+D** | geselecteerd element dupliceren |
| **Delete** | geselecteerd element verwijderen |
| **Ctrl+Z** | ongedaan maken |
| **Spatie** ingedrukt houden en slepen | het canvas verschuiven |
| **Ctrl+scrollen** | in- en uitzoomen |

**API-explorer**

| Toets | Wat het doet |
|---|---|
| **Ctrl+Enter** | de query uitvoeren |

## Wie beheert wat

| Wat | Wie mag het |
|---|---|
| Gebruikers uitnodigen, rollen, teams, gasten, beveiliging, auditlog, abonnement, AI-instellingen, import en sjablonen | accountbeheerders (rol **Admin**) |
| Structuur van een board (kolommen, groepen, views), leden en rechten van dat board | **board owners** en admins |
| Items, updates en waarden bewerken | leden met bewerkrechten op het board |
| Alleen kijken | **Viewer** of een lid met alleen-lezen rechten |
| Alleen gedeelde boards zien | **Gast** |
| Eigen profiel, wachtwoord, API-tokens en meldingen | iedereen voor zichzelf |

Meer over rollen en rechten staat in [Beheer en rechten](12-beheer-en-rechten.md).

## De handleiding bijwerken (beheerders en ontwikkelaars)

- De hoofdstukken staan als Markdown in `docs/handleiding/`. De app toont ze op `/help`.
- `npm run manuals` maakt de schermafbeeldingen opnieuw (specs in `e2e/manuals/`).
- `npm run manuals:check` controleert alle links en afbeeldingen. `npm run manuals:pdf` maakt `docs/handleiding/handleiding.pdf` als Chrome of Chromium aanwezig is.
