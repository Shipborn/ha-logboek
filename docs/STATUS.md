# Status

**Versie 0.18.0** (2026-11-05, 0.17.0 en 0.18.0 nog niet gecommit). 0.16.0 staat op GitHub (`Shipborn/ha-logboek`, main).

## Gedaan
- 0.14.0: omgezet naar Shipborn App met modules.
- 0.15.0: frontend per tabblad in losse bestanden (template + js + css) met gedeelde basis; op GitHub.
- 0.16.0:
  - Taken en Categorieën verplaatst van Logboek naar de module **Onderhoud**; Logboek heeft alleen nog de logregels.
  - **Instellingen › Urentellers**: HA-sensor voor hoofdmotor en generator (in de database, niet meer als app-optie). Bestaande `engine_hours_entity` wordt bij de eerste start overgenomen.
  - Taken met meerdere tellers: dagen, uren hoofdmotor, uren generator; wat het eerst bereikt is telt. Logregels slaan beide urenstanden op. MQTT, PDF en CSV bijgewerkt.
  - **Stappenplan** per taak (editor): stappen toevoegen/verplaatsen/verwijderen, uitleg met eenvoudige opmaak, uitlegafbeeldingen, HA-entiteiten (tonen, bedienen, vereiste status), foto's vragen/verplicht met minimum.
  - **Uitvoeren** van een stappenplan: stap voor stap, Volgende geblokkeerd tot voorwaarden en verplichte foto's in orde zijn, opmerkingen per stap; Afronden maakt automatisch een logregel met foto's, opmerkingen en bestede tijd.
- 0.17.0:
  - Nieuwe module **Agenda**: maandrooster (op de telefoon met stipjes) + dagoverzicht met logregels, geplande klussen, verwachte taken en afspraken uit de gekoppelde agenda. Klussen plannen (los of bij een taak), verslepen (computer), uitvoeren vanuit de agenda (logregel/stappenplan gekoppeld aan de planning).
  - **Koppeling met iCloud of een andere CalDAV-agenda** (Instellingen › Agenda; inloggegevens als app-opties): planning in twee richtingen, logregels optioneel één richting, overige afspraken alleen tonen. Synchroniseert elke 5 min, na wijzigingen en bij openen van de Agenda.
  - Lokaal getest met Radicale als CalDAV-server: kalenders vinden, sturen, terughalen van verplaatsen/hernoemen/notitie, verwijderen in de agenda, herinnering blijft behouden, logregels terugzetten na wijziging in de agenda, uitvoeren met en zonder `planning_id`, logregel verwijderen zet planning open, logregels uitzetten ruimt de agenda op, herhalende en meerdaagse externe afspraken. In de browser: rooster, dagoverzicht, plannen vanuit verwachte taak, slepen, uitvoeren, telefoonbreedte, Instellingen.
- 0.18.0: **Google Agenda** als tweede dienst naast iCloud/CalDAV (Calendar API met eigen OAuth-client, koppelen in Instellingen › Agenda door het `http://localhost/…`-adres terug te plakken). Agendacode omgebouwd naar één gezamenlijke vorm voor beide diensten. Getest met `tools/nep_google.py`: koppelen (ook fout adres en hergebruikt adres), kalenders (alleen schrijfbare), versturen naar kalender-ID met `#`/`@`, wijzigen/verwijderen in Google terug naar de app, HTML-omschrijving, herinneringen behouden, app wint bij conflict, herhalende externe afspraken, verlopen token vernieuwen, ingetrokken token (duidelijke fout), ontkoppelen, wisselen van dienst; in de browser het koppelen en kalender kiezen. CalDAV opnieuw getest na de ombouw.
- Lokaal getest met nep-HA (`tools/nep_ha.py`) op een kopie van de 0.15-testdatabase: migratie, urentellers instellen, taak met stappenplan maken (incl. afbeelding), uitvoeren met blokkade, bedienen, verplichte foto's, afronden, status/dueText daarna, PDF en CSV, weigering van bedienen buiten een stappenplan.

## Niet gedaan / niet getest
- Agenda: **niet getest tegen echte iCloud** (alleen Radicale) en niet in de Docker-build (nieuwe pakketten `icalendar`, `recurring-ical-events`). De link naar de app in de afspraak (`external_url` + `/hassio/ingress/<slug>`) is niet getest.
- Agenda: **Google niet getest met het echte Google** (alleen de nep-server); gedrag van echte Google bij `events/import` van een eerder verwijderde afspraak en bij PATCH met `null` voor date/dateTime is aangenomen. Slepen alleen met muis, niet op touchscreens. Meerdaagse planning kan niet (een in de agenda verlengde klus wordt bij een wijziging in de app weer één dag).
- Niet getest in Home Assistant zelf (ingress, echte kleppen/schakelaars, update vanaf 0.13.1/0.15.0) en niet in de HA Android-app (camera in de pagina bij Uitvoeren en bij uitlegafbeeldingen).
- Een lopende uitvoering wordt niet bewaard: pagina sluiten = foto's en voortgang kwijt.
- Uitlegafbeeldingen die geüpload zijn in een stappenplan dat daarna niet wordt opgeslagen, blijven als losse bestanden in `/share/logboek/photos` staan.
- Het stappenplan staat niet in de taak-PDF.
- `voorbeeld/Wierpot Aft schoonmaken.yaml` (voorbeeld van de gebruiker) staat alleen in de werkmap; bij publiceren naar GitHub weglaten.

## Volgende stappen
0. 0.17.0/0.18.0 committen/pushen, in HA bijwerken, iCloud (Apple ID + app-specifiek wachtwoord) of Google (eigen OAuth-client) instellen en een kalender kiezen; controleren dat klussen in de agenda verschijnen en verschuiven op de telefoon terugkomt in de app.
1. In HA bijwerken naar 0.16.0; controleren dat de urenteller hoofdmotor is overgenomen en de taken kloppen.
2. Het voorbeeld (wierpot aft) als stappenplan invoeren en met de echte entiteiten testen, ook op Android.
3. Open vragen aan de gebruiker:
   - Lopende uitvoering bewaren (op de server) zodat je later verder kunt?
   - Stappenplan in de taak-PDF (als werkinstructie)?
   - Wat moet Reizen bevatten?
   - GitHub-repository hernoemen? Git gebruiken in plaats van (of naast) de datummappen?
