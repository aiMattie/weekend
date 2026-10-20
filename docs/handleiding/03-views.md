# Views

Een board kan meerdere **views** hebben: dezelfde items, anders getoond. De views staan als tabs onder de boardtitel. De Table view is de standaard; de andere views maak je met de **+** achter de tabs.

## Een view toevoegen

1. Open een board.
2. Klik op de **+** rechts van de laatste tab.
3. Kies een view in het keuzescherm. Elke view heeft een icoon en een korte beschrijving: Table, Kanban, Calendar, Timeline, Gantt, Workload, Cards, Chart, Map, Files gallery, Form.
4. De nieuwe view opent direct. Heeft het board nog geen geschikte kolom (bijvoorbeeld een date-kolom voor de Calendar), dan staat er een knop om die kolom aan te maken.

Alle views gebruiken de zoekbalk, het persoonsfilter en de filters van de toolbar. Wijzig je een item in een view, dan zie je dat meteen in de andere views, ook bij collega's (realtime).

## Views beheren (tabmenu)

Klik op de drie puntjes in de actieve tab.

| Actie | Wat het doet |
|---|---|
| Rename | Geef de view een andere naam (ook: dubbelklik op de tab) |
| Duplicate | Maakt een kopie met dezelfde instellingen, direct achter het origineel |
| Link naar view kopiëren | Kopieert een link met `?view=...`; wie de link opent, ziet precies deze view |
| Als standaard-view instellen | De view wordt de eerste tab en opent als eerste |
| Delete | Verwijdert de view (de laatste view kan niet worden verwijderd). De items blijven staan |
| Delen met het board | Alleen voor een persoonlijke view (met een persoonsicoon): maakt hem zichtbaar voor iedereen |

**Volgorde wijzigen:** sleep een tab naar links of rechts.

## Instellingen van een view

Elke view (behalve de Table) heeft rechtsboven de knop **Instellingen**. Het scherm bevat de opties van dat type, bijvoorbeeld welke kolom de lanes bepaalt, welke velden op een kaart staan of welk zoomniveau de Timeline gebruikt. Met **Opslaan** worden de instellingen bij de view bewaard (voor iedereen). Mag je de structuur van het board niet wijzigen, dan geldt een wijziging alleen voor jezelf.

## Kanban

1. Voeg een **Kanban**-view toe. De lanes komen uit de eerste status-kolom; een andere kolom (status, dropdown of people) kies je in **Instellingen > Lanes per kolom**.
2. **Kaart verplaatsen:** sleep een kaart naar een andere lane. De waarde van de kolom wordt aangepast.
3. **Kaart toevoegen:** klik onderaan een lane op **Kaart toevoegen**, typ de naam en druk op Enter. De kaart krijgt de waarde van die lane.
4. **Lane inklappen:** klik op de gekleurde kop van een lane. De keuze wordt bij de view bewaard.
5. De lane **Geen waarde** bevat items zonder waarde in de gekozen kolom. Sleep een kaart erheen om de waarde leeg te maken.
6. **Velden op de kaart** kies je in Instellingen > Velden op de kaart.

## Calendar

1. Voeg een **Calendar**-view toe. Items verschijnen op hun datum (date-kolom) of over meerdere dagen (timeline-kolom). Heb je meerdere date- of timeline-kolommen, kies dan in Instellingen welke getoond worden; elke kolom heeft een eigen kleur, of kleur op status.
2. Schakel met **Maand / Week / Dag** en blader met de pijltjes; **Vandaag** springt terug.
3. **Verplaatsen:** sleep een item naar een andere dag. Bij een timeline verschuift de hele periode.
4. **Verlengen of verkorten:** sleep de linker- of rechterrand van een timeline-balk.
5. **Item toevoegen:** klik op een lege dag, typ een naam en druk op Enter. Het item krijgt die datum.

## Timeline

1. Voeg een **Timeline**-view toe. Elk item is een balk op de tijdas, gegroepeerd per group (kies in Instellingen ook **Persoon** of **Niet groeperen**).
2. Kies bovenin het zoomniveau: **Dag, Week, Maand, Kwartaal**. De rode lijn is vandaag.
3. Sleep een balk om te verplaatsen, sleep de randen om de periode aan te passen.
4. Een item zonder datum heeft een lege rij: klik in die rij om het in te plannen.
5. Klik op de groepskop om de group in te klappen.

## Gantt

1. Voeg een **Gantt**-view toe. Heeft het board een **Dependency**-kolom, dan worden pijlen getekend van voorganger naar opvolger. Zonder die kolom staat er een knop om hem toe te voegen.
2. **Afhankelijkheid maken:** beweeg over een balk, pak het bolletje aan de rechterkant en sleep het naar een andere balk. Die tweede balk wordt afhankelijk van de eerste. **Verwijderen:** dubbelklik op de pijl.
3. **Verschuiven met afhankelijkheden:** verplaats of verleng je een balk zodat die de volgende overlapt, dan schuiven de afhankelijke items automatisch mee (zet dit uit in Instellingen > Afhankelijke items automatisch verschuiven).
4. Het **kritieke pad** (de langste keten van afhankelijke taken) is rood. Zet het aan of uit met de knop **Kritiek pad**.
5. **Mijlpaal:** kies in Instellingen een checkbox-kolom; aangevinkte items worden een ruit op de startdatum.
6. **Baseline:** kies een extra timeline-kolom; de oorspronkelijke planning staat als dunne grijze balk onder de balk.

## Workload

1. Voeg een **Workload**-view toe en kies in Instellingen de people-kolom, de datum-/timeline-kolom en eventueel een numbers-kolom met de schatting in uren.
2. Per persoon zie je per week (of dag) de belasting ten opzichte van de capaciteit (standaard 8 uur per werkdag). Kleuren: blauw = ruimte over, groen = goed gevuld, rood = overbelast.
3. De uren van een item worden gelijk verdeeld over de werkdagen van de periode en over de toegewezen personen. Zonder schatting rekent de view met het aantal uren per dag uit Instellingen.
4. Pas de capaciteit van één persoon aan in het getal naast de naam.
5. **Herverdelen:** sleep een item (onder de naam van de persoon) naar de rij van een collega.

## Cards

1. Voeg een **Cards**-view toe. Elk item is een kaart met een omslagafbeelding uit de eerste file-kolom (de eerste afbeelding).
2. Kies in Instellingen de file-kolom en de velden die op de kaart staan. Klik op een kaart om het item te openen.

## Chart

1. Voeg een **Chart**-view toe en kies in Instellingen het **Grafiektype**: staaf, gestapeld, lijn of taart.
2. Kies de kolom waarop gegroepeerd wordt (status, dropdown, people, datum per maand of Group), optioneel een kolom om op te stapelen, en de waarde: aantal items, som of gemiddelde van een numbers-kolom.
3. Rechts van de grafiek staat de bijbehorende tabel met de waarden.

## Map

1. Voeg een **Map**-view toe. Het board heeft een **Location**-kolom nodig (met breedte- en lengtegraad); de knop in de view maakt hem aan.
2. Items met een locatie verschijnen als marker op OpenStreetMap, gekleurd naar de status. Klik op een marker en daarna op **Open item**.

## Files gallery

1. Voeg een **Files gallery**-view toe. Alle bestanden van het board staan er, ook die in updates zijn geplaatst.
2. Filter op **Afbeeldingen** of **Documenten** of zoek op bestandsnaam. Klik op de itemnaam onder een bestand om het item te openen.

## Form

1. Voeg een **Form**-view toe. Het formulier bevat een veld per kolom.
2. Kies **Formulier bewerken** om titel en beschrijving in te stellen, velden te verbergen, labels te wijzigen, velden verplicht te maken en de group te kiezen waarin nieuwe items komen.
3. Vul het formulier in en kies **Versturen**: er wordt een item aangemaakt.
4. Een formulier dat je met mensen buiten het board wilt delen maak je in **WorkForms** (Forms in de zijbalk). Onder het formulier staat een link naar WorkForms.

Beperkingen: de kaartondergrond van de Map-view komt van OpenStreetMap en heeft internet nodig; zonder internet zie je alleen de markers. De Form-view maakt items op dit board, maar heeft geen openbare link. Een formulier voor mensen zonder account bouw je in WorkForms ([Forms en Docs](07-forms-en-docs.md)).
