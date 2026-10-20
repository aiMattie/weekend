# Beheer, rechten en beveiliging

Dit hoofdstuk is voor admins en voor board owners. Je leert mensen uitnodigen, rollen en rechten instellen, het account beveiligen en terugkijken wie wat deed. Alles staat in het **Beheer**-scherm (tandwiel in de linker balk, of via je avatar rechtsboven). Je eigen instellingen staan op **Mijn profiel**.

## 1. Hoe rechten werken

Rechten bestaan uit vier lagen. Een gebruiker mag iets als alle lagen het toestaan.

| Laag | Waar stel je het in | Opties |
|---|---|---|
| Accountrol | Beheer > Gebruikers | **Admin** (alles), **Member** (gewoon werken), **Viewer** (alleen kijken), **Gast** (alleen gedeelde boards), of een **eigen rol** |
| Workspace | Workspace- en boardrechten | Open of gesloten, wie boards mag maken, rollen **Owner**, **Lid** en **Abonnee** (alleen kijken) |
| Board | Workspace- en boardrechten | Main, **Private** of **Shareable**; rechten van leden: alles bewerken, inhoud bewerken, alleen toegewezen items bewerken, alleen bekijken; board owners |
| Kolom | Workspace- en boardrechten (onderaan) | Per kolom: wie hem ziet en wie hem bewerkt |

Een wijziging werkt direct, ook voor mensen die al ingelogd zijn.

## 2. Gebruikers uitnodigen

1. Open **Beheer > Gebruikers**.
2. Klik op **Gebruiker uitnodigen**.
3. Vul het e-mailadres in, kies een rol (Member, Viewer, Admin of een eigen rol) en klik op **Uitnodiging versturen**.
4. Je ziet nu een link. Kopieer hem met **Kopieer link** en stuur hem door als de mail niet aankomt. De link is 7 dagen geldig en werkt één keer.
5. De uitgenodigde opent de link, vult zijn naam in, kiest een wachtwoord en klikt op **Account aanmaken**. Daarna is hij ingelogd.

Zolang de uitnodiging openstaat zie je hem onder **Openstaande uitnodigingen**. Daar kun je hem **Opnieuw sturen** (nieuwe link, de oude vervalt) of **Intrekken**.

### Veel mensen tegelijk (CSV)

1. Klik op **Importeren (CSV)**.
2. Kies een bestand of plak de tekst. De eerste regel bevat de kolomnamen `naam`, `email` en `rol` (member, viewer of admin). Komma of puntkomma als scheidingsteken werkt allebei.
3. Klik op **Importeren**. Je ziet hoeveel uitnodigingen zijn aangemaakt en welke regels zijn overgeslagen en waarom (dubbel adres, geen geldig adres, onbekende rol).

### Rol wijzigen, deactiveren

- Kies een andere rol in de kolom **Rol**. Het effect is meteen zichtbaar: een Viewer kan niets meer bewerken.
- **Deactiveren** blokkeert het account en meldt de persoon overal af. **Heractiveren** zet het weer aan. Je kunt jezelf niet deactiveren en er blijft altijd minstens één admin.
- Bij **Laatst actief** zie je wanneer iemand voor het laatst in de app was, bij **2FA** of tweestapsverificatie aanstaat. Met **2FA resetten** help je iemand die zijn telefoon kwijt is.

## 3. Teams

Een team is een groep mensen die je aan items kunt toewijzen en met `@team` kunt noemen in een update (iedereen in het team krijgt dan een melding).

1. Open **Beheer > Teams**, typ een naam en klik op **Team maken**.
2. Kies bij **Lid toevoegen** een persoon en klik op **Toevoegen**.
3. Met **Owner maken** wordt iemand team owner. Een team owner mag de leden van zijn eigen team beheren, ook zonder admin te zijn.

## 4. Gasten

Gasten zijn externe mensen (klanten, freelancers). Ze zien alleen de boards die je met hen deelt. Ze zien geen workspaces, geen andere mensen en geen beheerschermen en ze kunnen nooit de structuur van een board wijzigen.

1. Open **Beheer > Gasten** en klik op **Gast uitnodigen**.
2. Vul het e-mailadres in en kies de boards die je wilt delen. Je kunt ook een hele workspace kiezen: de gast ziet dan alle boards die als **Shareable** zijn ingesteld.
3. Kies **Alleen bekijken** of **Bewerken** en klik op **Uitnodiging versturen**. Stuur de link naar de gast.
4. Met **Toegang wijzigen** pas je de gedeelde boards later aan, met **Verwijderen** stopt de toegang direct.

Een openbaar board wordt **Shareable** zodra je het met een gast deelt. **Private** boards kunnen niet met gasten gedeeld worden.

Instellingen op dezelfde pagina:

- **Gasten toestaan**: zet je dit uit, dan kun je geen gasten meer uitnodigen.
- **Gasten zien alleen vrijgegeven views**: een board owner kiest welke views een gast ziet.

## 5. Eigen rollen

Naast Admin, Member, Viewer en Gast maak je eigen rollen met een eigen set rechten, bijvoorbeeld een "Auditor" die het auditlog mag lezen maar geen workspaces mag maken.

1. Open **Beheer > Rollen en rechten**.
2. Typ een naam, kies waarop de rol gebaseerd is en klik op **Rol maken**.
3. Zet per recht **Zoals basisrol**, **Toestaan** of **Weigeren** en klik op **Opslaan**.
4. Geef de rol aan een gebruiker bij **Beheer > Gebruikers** in de kolom **Rol**.

De tabel **Standaardrollen** bovenaan laat zien wat elke vaste rol mag. Wat je daar ziet is dezelfde regel die de app zelf gebruikt.

## 6. Workspace- en boardrechten

Open **Workspace- en boardrechten** (knop op de pagina Rollen en rechten, of `/permissions`). Je ziet de workspaces en boards waar je owner van bent, of alles als je admin bent.

**Workspace**
1. Kies een workspace.
2. **Soort workspace**: *Open* (iedereen in het account kan hem zien) of *Gesloten* (alleen leden).
3. **Wie mag boards maken**: alle leden of alleen owners.
4. Voeg mensen toe als **Owner**, **Lid** of **Abonnee** (alleen kijken).

**Board**
1. Kies een board.
2. **Zichtbaarheid**: *Main* (de hele workspace), *Private* (alleen leden) of *Shareable* (ook gasten).
3. **Rechten van leden**:
   - *Alles bewerken*: items en structuur (kolommen, groepen, views).
   - *Inhoud bewerken*: items, maar geen kolommen, groepen of views.
   - *Alleen toegewezen items bewerken*: leden bewerken alleen items waaraan ze (of hun team) zijn toegewezen in een People-kolom. Ze kunnen wel reageren, maar geen items aanmaken.
   - *Alleen bekijken*.
4. Voeg leden toe en geef ze de rol **Owner**, **Lid** of **Alleen kijken**. Board owners en admins kunnen altijd alles op hun board.

**Kolomrechten** staan onderaan dezelfde pagina:
- **Wie ziet de kolom**: iedereen, alleen owners of bepaalde personen. Wie hem niet mag zien, krijgt de kolom en de waarden niet eens te zien (ook niet via zoeken of de API).
- **Wie bewerkt de kolom**: iedereen, alleen owners, alleen toegewezen personen of bepaalde personen.

## 7. Account

**Beheer > Account**: naam, logo (PNG, JPEG, WebP of GIF tot 2 MB), standaardtaal, tijdzone en op welke dag de week begint. Klik op **Opslaan**.

## 8. Beveiliging

Open **Beheer > Beveiliging**.

- **Tweestapsverificatie verplicht**: wie 2FA niet heeft, wordt na het inloggen naar zijn profiel gestuurd om het in te stellen.
- **Sessieduur** en het aantal mislukte pogingen voordat een account 15 minuten geblokkeerd wordt.
- **Wachtwoordbeleid**: minimale lengte, hoofdletter, cijfer, speciaal teken.
- **IP-beperking**: vul de toegestane adressen of ranges in (bijvoorbeeld `203.0.113.0/24`), één per regel. Alleen die adressen komen nog binnen. Je eigen adres moet erbij staan, anders weigert de app de lijst. Leeg laten betekent: overal toegestaan.
- **Bewaartermijn auditlog** in dagen.

### Inloggen met Google

Collega's kunnen met hun Google-account inloggen (OAuth 2.0 / OpenID Connect). Inloggen met Microsoft werkt op dezelfde manier, zie [Inloggen met Microsoft](#inloggen-met-microsoft); SAML is nog een instellingenscherm. Open **Beheer > Single sign-on**.

**Eenmalig instellen (door een beheerder met toegang tot Google Cloud Console)**

1. Open [console.cloud.google.com](https://console.cloud.google.com), kies of maak een project en ga naar **APIs & Services > Credentials**.
2. Stel het **OAuth consent screen** in: kies **Internal** als iedereen een Google Workspace-account van jullie eigen domein heeft, anders **External**.
3. Kies **Create credentials > OAuth client ID** met type **Web application**.
4. Voeg bij **Authorized redirect URIs** het adres toe dat op de pagina **Single sign-on** staat, bijvoorbeeld `https://weekend.example.com/api/auth/google/callback` of, lokaal, `http://localhost:3058/api/auth/google/callback`. Het hangt af van `APP_URL`; de tekst moet exact kloppen.
5. Zet de **Client ID** en het **Client secret** als `GOOGLE_CLIENT_ID` en `GOOGLE_CLIENT_SECRET` in de omgeving van de server, zet `APP_URL` op het publieke adres (bijvoorbeeld `https://weekend.example.com`, lokaal `http://localhost:3058`) en herstart de app. Optioneel: `GOOGLE_ALLOWED_DOMAINS=example.com,example.org`.
6. Ververs de pagina. De status springt van **Niet geconfigureerd** naar **Geconfigureerd**, en de loginpagina toont de knop **Inloggen met Google**. De pagina laat per variabele zien of hij aanwezig is, maar toont nooit de waarden.

Zolang de variabelen ontbreken is er geen Google-knop en werkt inloggen met een wachtwoord gewoon.

**Instellingen op de pagina** (deze gelden voor Google én Microsoft)

- **Toegestane domeinen**: alleen Google-accounts van deze domeinen komen binnen (het domein van het e-mailadres en het Workspace-domein van Google moeten beide kloppen). Leeg laten betekent: geen beperking op domein; er kunnen dan alleen bestaande gebruikers inloggen.
- **Nieuwe gebruikers automatisch aanmaken**: een onbekend Google-adres binnen een toegestaan domein krijgt automatisch een Member-account (naam en foto uit Google). Standaard staat dit uit: een onbekend adres krijgt de melding dat er geen account is. Aanzetten kan alleen met minimaal één toegestaan domein.
- **Alleen inloggen met SSO (Google of Microsoft)**: schakelt inloggen met een wachtwoord uit voor iedereen, behalve voor beheerders die je als **noodtoegang** aanvinkt. Aanzetten lukt alleen als jouw eigen Google- of Microsoft-account al is gekoppeld (via **Mijn profiel**), zodat je jezelf niet buitensluit. Op de loginpagina staan dan alleen de knoppen voor Google en Microsoft, met een klein linkje **Noodtoegang** voor die beheerders.
- **Test inloggen**: doorloopt de Google-aanmelding zonder je sessie te wijzigen en toont wat er met dat Google-account zou gebeuren.
- **Gekoppelde accounts**: wie welk Google- of Microsoft-account heeft gekoppeld, met **Ontkoppelen**.

Loopt een Google-login stuk, dan staat op de loginpagina een duidelijke melding:

**Hoe een Google-login een gebruiker vindt.** Is het Google-account al gekoppeld, dan is dat de gebruiker. Anders zoekt de app een bestaande, actieve gebruiker met hetzelfde (door Google geverifieerde) e-mailadres en koppelt het account bij de eerste login; vanaf dan telt alleen nog het gekoppelde Google-account, ook als het e-mailadres later verandert. Een gebruiker die al een ander Google-account heeft gekoppeld, wordt nooit op e-mailadres aan een nieuw Google-account gekoppeld. Gedeactiveerde gebruikers komen er niet in. Een Google-login vraagt niet om de eigen 2FA-code van de app (Google regelt de tweede stap), maar de panic button en de IP-beperking gelden wel. Alles wordt vastgelegd in het auditlog (`sso.login_success`, `sso.login_failed` met reden, `sso.identity_linked`, `sso.user_provisioned`, `sso.settings_changed`).

**Buitengesloten?** Staat **Alleen inloggen met SSO** aan en kan niemand meer inloggen (Google niet bereikbaar, verkeerd account gekoppeld)? Een beheerder met toegang tot de server voert uit: `npm run auth:break-glass -- naam@example.com`. Dat zet de afdwinging uit en markeert die beheerder als noodtoegang; inloggen met een wachtwoord werkt dan weer. De afdwinging vervalt ook vanzelf zodra zowel Google als Microsoft niet meer geconfigureerd is. Zie ook [Veelgestelde vragen](15-veelgestelde-vragen.md).

**Beperkingen bij Google- en Microsoft-login.** Geen SAML. Het aantal gebruikers wordt niet begrensd bij automatisch aanmaken. Uitloggen in deze app logt niet uit bij Google of Microsoft, en een gedeactiveerde Google- of Microsoft-gebruiker verliest pas toegang als hij hier gedeactiveerd wordt. Het redirect-adres moet precies overeenkomen met `APP_URL`: open de app dus via dat adres.

### Inloggen met Microsoft

Werk- of schoolaccounts (Microsoft Entra ID, voorheen Azure AD) en desgewenst persoonlijke Microsoft-accounts. Het werkt net als Google en gebruikt dezelfde instellingen (domeinen, automatisch aanmaken, alleen SSO, noodtoegang). Op **Beheer > Single sign-on** staat een eigen kaart **Microsoft (Entra ID)** met status, de schakelaar **Inloggen met Microsoft toestaan**, **Test inloggen**, de redirect-URI's en de stappen.

**Eenmalig instellen (door een beheerder in het Microsoft Entra-beheercentrum)**

1. Open [entra.microsoft.com](https://entra.microsoft.com) > **Identiteit > Toepassingen > App-registraties** en kies **Nieuwe registratie**.
2. Kies wie mag inloggen: **alleen accounts in deze organisatie** (aanbevolen) of ook andere organisaties / persoonlijke accounts. Voeg bij **Omleidings-URI** het platform **Web** toe met de URI van de pagina **Single sign-on**, bijvoorbeeld `http://localhost:3058/api/auth/microsoft/callback`.
3. Ga naar **Certificaten & geheimen > Nieuw clientgeheim** en kopieer de waarde.
4. Zet de **Application (client) ID**, het clientgeheim en de **Directory (tenant) ID** als `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` en `MICROSOFT_TENANT_ID` in `.env` en herstart de app. De loginpagina toont dan **Inloggen met Microsoft**.

**Welke e-mailadressen telt de app als geverifieerd?** Met je eigen tenant-ID (aanbevolen) komen alleen accounts uit jouw organisatie binnen en geldt hun e-mailadres als geverifieerd. Laat je `MICROSOFT_TENANT_ID` leeg (`organizations`, elke organisatie) of zet je hem op `common`, dan telt een e-mailadres alleen als geverifieerd bij persoonlijke Microsoft-accounts of als Entra de optionele claim `xms_edov` meestuurt (voeg dan onder **Tokenconfiguratie** de optionele claims `email` en `xms_edov` toe). Zo kan niemand met een eigen tenant en een nagemaakt e-mailadres het account van een collega overnemen. Een gekoppeld Microsoft-account wordt herkend aan tenant + object-ID, niet aan het e-mailadres.

### SAML (nog niet beschikbaar)

Er is een instellingenscherm (**Beheer > Single sign-on > SAML (nog niet beschikbaar)**). Het toont de gegevens van deze app (Entity ID, ACS-URL en een metadatabestand) en velden voor je identity provider. De status is altijd **Niet verbonden**: er wordt nog niets met je identity provider uitgewisseld. Gebruik het om de gegevens alvast te bewaren.

### SCIM-provisioning

Klik op **SCIM-token maken**, kopieer het token (je ziet het maar één keer) en vul het samen met de basis-URL in bij Okta of Entra ID. Daarmee maakt, wijzigt en deactiveert je identity provider gebruikers automatisch. Een nieuw token maken laat het oude vervallen.

### Panic button

Bij een incident: **Beveiliging > Panic button > Account vergrendelen**.

1. Bevestig. Alle sessies worden afgemeld en niemand kan nog inloggen of de API gebruiken.
2. Je krijgt een **herstelcode**. Bewaar hem veilig: je ziet hem maar één keer.
3. Een admin logt in met e-mail en wachtwoord. Staat het account op slot, dan verschijnt het veld **Herstelcode beheerder**. Vul de code in.
4. Ga naar **Beheer > Beveiliging** en klik op **Account ontgrendelen**. Iedereen kan weer inloggen.

## 9. Auditlog

**Beheer > Auditlog** toont wie wat deed: inloggen en mislukte pogingen, rechtenwijzigingen, het verwijderen van boards en workspaces, het maken van tokens, API- en MCP-aanroepen en exports.

1. Zoek op tekst, kies een categorie of gebeurtenis en een periode, en klik op **Filteren**.
2. **Exporteren (CSV)** downloadt wat je nu ziet.
3. Oudere regels laad je met **Oudere regels**.

Voor een SIEM is er een JSON-API: `GET /api/v1/audit-log?event=board.deleted&from=2026-01-01&limit=200` met een sessie of API-token van iemand met auditrechten. Het antwoord bevat `rows`, `nextCursor` (geef die mee als `cursor` voor de volgende pagina) en `total`. Geheimen als wachtwoorden en tokens worden nooit bewaard.

## 10. Mijn profiel

Via je avatar rechtsboven > **Mijn profiel**.

- **Gegevens**: foto uploaden, naam, functie, telefoon, taal en tijdzone. **Notificatie-instellingen** brengt je naar de Inbox.
- **Wachtwoord**: vul je huidige en een nieuw wachtwoord in. Alle andere apparaten worden afgemeld.
- **Tweestapsverificatie**: klik op **2FA instellen**, scan de QR-code met een authenticator-app (of voer de sleutel handmatig in), vul de code in en klik op **Bevestigen**. Bewaar de 10 **herstelcodes**: elke code werkt één keer als je je telefoon kwijt bent. Bij het inloggen vraagt de app na je wachtwoord om de code of een herstelcode.
- **Google-account** en **Microsoft-account**: als inloggen met Google of Microsoft aan staat, zie je hier welk account gekoppeld is. **Koppelen** brengt je langs Google of Microsoft en terug; **Ontkoppelen** haalt de koppeling weg (dat kan niet als het je enige manier is om in te loggen).
- **Actieve sessies**: je ziet je apparaten. **Afmelden** beëindigt één sessie, **Overal afmelden behalve hier** alle andere.

## 11. Zoeken

De zoekbalk bovenaan zoekt in boards, items, updates, docs, workspaces en mensen, en laat alleen zien waar je toegang toe hebt.

1. Druk op `/` of `Ctrl+K` en typ. Resultaten staan gegroepeerd, met de gevonden tekst gemarkeerd.
2. Navigeer met de pijltjestoetsen, open met `Enter`, sluit met `Esc`.
3. Zonder tekst zie je je recente zoekopdrachten.

Beperkingen: SAML is een instellingenscherm zonder werkende koppeling met een identity provider (Google-login werkt wel, zie [Inloggen met Google](#inloggen-met-google)).
