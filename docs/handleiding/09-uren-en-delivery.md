# Uren en Delivery

Eén plek voor sturing en uren. Dit hoofdstuk beschrijft de workspace **Delivery** (klanten, projecten en fases, urenregistratie), hoe de uren automatisch worden opgeteld per fase, de klant-workspace uit het sjabloon en de checklist per klant.

## De vier lagen en waar je wat vindt

| Laag | Workspace | Wat staat erin |
|---|---|---|
| Klantrelatie | Eén workspace per klant (uit het sjabloon) | Kickoff & Roadmap, Builds & Taken, AI Maturity Tracker, Customer Files, Contacten, Gespreksverslagen |
| Sturing | **Delivery** | Klanten, Projecten & Fases, Urenregistratie, Klant overstap checklist |
| Bouwen | Development | Sprints, Taken, Epics, Bugs, Retrospectives (zie hoofdstuk 8) |
| Persoonlijk | My Work | Je eigen taken uit alle borden. Losse persoonlijke borden zijn niet meer nodig |

Een taak in Development hoort bij een epic, de epic bij een fase in Projecten & Fases en de fase bij een klant. Uren schrijf je op klant + fase (en eventueel de taak).

## De structuur klaarzetten (beheerder)

1. Ga naar **Beheer > Importeren** (`/admin/import`).
2. Klik in het blok **Sjablonen** op **Plan-structuur aanmaken**. Er verschijnt "Sjablonen staan klaar".
3. Opnieuw klikken kan altijd: er ontstaan geen dubbele borden of kolommen en bestaande waarden blijven staan.

Op de opdrachtregel doet `npx tsx scripts/db-seed.ts --templates` hetzelfde (met `--klant "Naam A,Naam B"` maak je meteen klant-workspaces).

## Het bord Klanten

Per klant: accountmanager, **PO / PM**, **Uren-verantwoordelijke**, contractvorm(en), uurtarief dev en PM, het **Jira-project** (het sleutelwoord, bijvoorbeeld LMS) en een link naar de klant-workspace. Twee kolommen laten zien wat er gekoppeld is: **Projecten & fases** en **Urenregels**. Daarnaast tellen **Uren dev totaal** en **Uren PM totaal** alle geschreven uren van de klant op.

## Het bord Projecten & Fases

Per fase leg je vast: klant, verantwoordelijke, fasestatus (Gepland, Actief, In review, Go/no-go, Afgerond, Geparkeerd), go/no-go datum en status, type, **Uren begroot dev** en **Uren begroot PM**, risico (Groen, Oranje, Rood), looptijd, bedrag en de **Factuurstatus** (Niet gefactureerd, Deels gefactureerd, Gefactureerd).

Deze kolommen worden **automatisch berekend** uit het bord Urenregistratie. Je vult ze niet in:

| Kolom | Wat het toont |
|---|---|
| Uren dev besteed, Uren PM besteed | Som van Uren dev / Uren PM van alle urenregels van deze fase (mirror van de kolom Urenregels) |
| Uren besteed | Uren dev besteed + Uren PM besteed |
| Restant dev, Restant PM | Uren begroot min uren besteed |
| Budget gebruikt | Percentage van het totale begrote aantal uren dat is besteed |
| Budgetwaarschuwing (80%) | Tekst "OK", "Waarschuwing: 80% van het budget bereikt" of "Over budget" |

Tip: voeg een **Dashboard**-widget of een filter toe op de kolom Budgetwaarschuwing om fases boven 80% direct te zien.

## Uren schrijven in Urenregistratie

Facturatie gebeurt uitsluitend op basis van het bord **Urenregistratie** in Delivery.

1. Open het bord **Urenregistratie**, of gebruik het snelle formulier **Uren snel invullen** (staat als concept op de pagina Forms; een beheerder publiceert het wanneer je het wilt gebruiken).
2. Klik op **+ Add item** en geef de regel een korte naam, bijvoorbeeld "Sprint 21 dev".
3. Een automation vult **Wie** (jijzelf) en **Datum** (vandaag) automatisch in. Dat is het recept "nieuwe regel, Wie = jijzelf, Datum = vandaag".
4. Kies de **Klant** en de **Fase** (verbind de regel met een klant en fase in Projecten & Fases).
5. Vul de uren in: **Uren dev**, **Uren PM**, **Meerwerk uren** of **Non-billable uren**, en eventueel **On-site dagen**.
6. Vink **Billable** aan als de uren factureerbaar zijn en vul de **Factuurperiode** in, bijvoorbeeld 2026-10.
7. Controleer na het opslaan het bord Projecten & Fases: Uren besteed en Restant van de fase zijn direct bijgewerkt.

Schrijf dagelijks of uiterlijk op vrijdag. De timer op taken (kolomtype Time tracking, en het tabblad **Uren** bij een taak) is alleen voor eigen inzicht en telt niet mee voor facturatie.

Elke regel kan ook naar een **Taak** in Development wijzen (kolom Taak). De taak toont dan via de kolom Uren welke regels erbij horen.

### Maandafsluiting

Op de eerste werkdag van de maand: uren nakijken, de factuurperiode sluiten en **Gefactureerd** aanvinken. Zet daarna de **Factuurstatus** van de fase op Deels gefactureerd of Gefactureerd.

## Klant-workspace uit het sjabloon

Elke klant krijgt een eigen workspace met dezelfde zes borden:

| Board | Map | Inhoud |
|---|---|---|
| Kickoff & Roadmap | Planning & To do's | Groepen Pre-Kickoff, Kickoff, Maand 2 - Quick wins, Maand 3+ - Build |
| Builds & Taken | Planning & To do's | Backlog, Actieve Sprint, Afgerond |
| AI Maturity Tracker | AI Maturity Tracker | Nulmeting, huidige score en doelscore per onderdeel |
| Customer Files | Klant informatie | Bestanden van en voor de klant |
| Contacten | Klant informatie | Contactpersonen |
| Gespreksverslagen | Klant informatie | Verslagen, met de actiepunten als subitems |

Gespreksverslagen staan **altijd** in de klant-workspace. In Delivery staat alleen een link.

### Een klant-workspace maken

1. Ga naar **Beheer > Importeren** en vul bij **Klantnaam** de naam in.
2. Klik op **Klant-workspace aanmaken**.
3. Bestaat de klant al in het bord Klanten, dan krijgt die een link naar de nieuwe workspace en wordt de checklist-stap "Klant-workspace" afgevinkt.

Dezelfde actie kan een automation uitvoeren: "nieuwe klant in Klanten, maak een klant-workspace" (blok **Maak een klant-workspace vanuit het sjabloon**).

## Checklist per klant

Het bord **Klant overstap checklist** in Delivery heeft per klant één regel met stappen, onder meer: klant in Klanten, fase in Projecten & Fases, klant-workspace, epics gekoppeld aan de fase en team op de hoogte (zie [Werkafspraken](14-werkafspraken.md)). De kolom **Voortgang** toont het percentage afgevinkte stappen. Nieuwe klanten in het bord Klanten krijgen automatisch een regel wanneer de sjablonen opnieuw worden uitgevoerd.

## My Work

Gebruik **My Work** als persoonlijke takenlijst in plaats van losse persoonlijke borden (zie [Werkafspraken](14-werkafspraken.md)).

Beperkingen: uren die je op een taak schrijft (tabblad **Uren**) komen niet vanzelf in Urenregistratie; schrijf uren die je wilt factureren altijd in dat board. De sommen op Projecten & Fases tellen alleen urenregels die aan een fase zijn gekoppeld. Het snelle formulier **Uren snel invullen** bestaat als concept en moet door een beheerder worden gepubliceerd.
