# Beslissingen

## 2026-10-26 – Logboek wordt een module van Shipborn App (0.14.0)
- **Eén HA-app met modules als hoofdmenu**, niet een repository met losse apps. Eén paneel, één database, één set opties; modules delen logo en instellingen.
- **Slug blijft `logboek`.** In Home Assistant hoort een slug bij een app, niet bij een tabblad; tabbladen hebben geen eigen slug. Een nieuwe slug (`shipborn`) installeert een nieuwe app met een lege `/data`, dus zonder migratie raak je de database kwijt. Met dezelfde slug is de omzetting een gewone update. Om dezelfde reden blijven `/share/logboek`, `logboek.db` en de MQTT-topics `logboek/...` gelijk. Overstappen op een andere slug kan later met een migratie (bijv. via de databasekopie in `/share/logboek/backup`).
- Wel aangepast: mapnaam `shipborn_app/`, `name` en `panel_title` "Shipborn App", paneelicoon `mdi:sail-boat`.
- Elke module krijgt een eigen weergave (`#view-…`) en eigen URL-hash (`#logboek/tasks`, `#reizen`) in plaats van een eigen slug.

## 2026-10-26 – Werkwijze met datummappen
- Elke sessie begint met een nieuwe kopie van de nieuwste datummap in `../jjmmdd` (bij meerdere sessies op één dag `jjmmdd_2`, …), gemaakt met `../nieuwe_sessie.ps1`. Oudere mappen blijven als archief staan.
- De datummappen zijn geen git-repository. GitHub (`Shipborn/ha-logboek`, main) wordt bijgewerkt door de inhoud van de nieuwste datummap volledig over de repo heen te zetten, als normale commit bovenop de bestaande geschiedenis (geen force-push).

## 2026-10-26 – Frontend per tabblad in losse bestanden (0.15.0)
- **Server-side samenstellen met Jinja** (zit al in Flask, geen nieuwe dependency, geen build-stap). Alternatief was HTML-fragmenten in de browser ophalen; dat geeft een extra laadstap en volgordeproblemen met event-handlers.
- **Gedeelde opmaak als Jinja-macro's** (`dialoog`, `voet`, `binnenkort`) en **JS-bouwstenen** in `ui.js`, zodat tabbladbestanden vooral hun eigen inhoud bevatten.
- **Gewone scripts i.p.v. ES-modules**: de bestaande code gebruikt functies over tabbladen heen (`openEntry`, `TASKS`); met gewone scripts blijft dat werken zonder alles om te bouwen. Nadeel: namen zijn globaal en moeten uniek zijn.
- Koppeling tussen tabbladen via `tabblad(...)`-hooks, `verversAlles()` en `op`/`meld`, zodat een tabblad niet meer in de DOM van een ander tabblad hoeft te schrijven.
- `static/*` met `Cache-Control: no-cache` plus `?v=<versie>`, zodat HA na een update geen oude bestanden toont.

## 2026-10-27 – Onderhoud, urentellers en stappenplannen (0.16.0)
- **Taken en Categorieën in de module Onderhoud** (wens gebruiker); Logboek = alleen logregels. Categorieën gelden nog steeds ook voor logregels.
- **Urentellers in de database (`meta`) in plaats van app-opties**, zodat ze in de app onder Instellingen staan en zonder herstart wijzigen. Vaste lijst `TELLERS` (hoofdmotor, generator) met eigen kolommen, geen vrije lijst motoren: de gebruiker wilde precies deze twee. Hoofdmotor houdt de oude kolommen (`motoruren`, `interval_uren`) zodat bestaande data en MQTT-sensoren blijven werken.
- **Een taak kan meerdere intervallen hebben** (dagen, hoofdmotor, generator); de eerste die bereikt wordt bepaalt de status (wens gebruiker).
- **Stappenplan wordt in de app zelf uitgevoerd**, niet als gegenereerd HA-script met browser_mod (zoals het voorbeeld in `voorbeeld/`): alleen in de app kunnen foto's gemaakt en verplicht worden. De functionaliteit van het script (stappen, uitleg, entiteiten bedienen, gates) is nagebouwd.
- **Gates als "vereiste status" per entiteit** (off/on/closed/open) in plaats van vrije Jinja-templates zoals in het script: eenvoudig in te stellen in de editor en zonder template-engine in de app.
- **Bedienen alleen voor entiteiten die in een stappenplan op 'bedienen' staan** en alleen voor schakelbare domeinen: het paneel is ook voor niet-beheerders, dus geen vrije toegang tot alle HA-services.
- **Afronden maakt automatisch een logregel** (wens gebruiker) via de bestaande `POST api/entries`; geen aparte tabel voor uitvoeringen.
- **Uitvoering alleen in de browser** tot Afronden (eenvoud). Bewaren van een lopende uitvoering staat als open vraag in STATUS.

## 2026-11-05 – Agenda met CalDAV-koppeling (0.17.0)
- **Rechtstreeks via CalDAV** (keuze gebruiker, optie C) i.p.v. een ICS-abonnement (alleen app → agenda, publieke URL nodig, Google ververst traag) of via de agenda-integraties van HA (kunnen afspraken alleen aanmaken, niet wijzigen/verwijderen). Werkt met iCloud (app-specifiek wachtwoord) en andere CalDAV-servers; Google kwam in 0.18.0.
- **Eigen kleine CalDAV-client** met requests en ElementTree in plaats van de `caldav`-bibliotheek: die heeft `lxml` nodig, wat op Alpine/armv7 lastig bouwt. Wel `icalendar` en `recurring-ical-events` (pure Python) voor het lezen/schrijven van afspraken en herhalingen.
- **Inloggegevens als app-opties** (HA-type `password`), niet in de database: de database wordt na elke wijziging naar `/share/logboek/backup` gekopieerd, en `/share` is ook voor andere apps en Samba leesbaar. Kalenderkeuze staat wel in de database (Instellingen › Agenda).
- **Planning in twee richtingen, logregels één richting**: een logregel is een registratie; die hoort in de app gewijzigd te worden. Bij een wijziging aan beide kanten tegelijk wint de app (eenvoudig en voorspelbaar). Een planning die in de agenda verwijderd wordt, verdwijnt ook uit de app.
- **Bestaande afspraak als basis bij bijwerken**, zodat herinneringen en andere velden die op de telefoon zijn toegevoegd blijven staan.
- **Uitvoeren koppelt automatisch**: een logregel bij een taak telt voor de eerstvolgende open planning van die taak, zodat uitvoeren via Taken de planning ook afsluit.

## 2026-11-05 – Google Agenda (0.18.0)
- **Google Calendar API v3** i.p.v. Google-CalDAV: Google-CalDAV ondersteunt alleen `If-Match` (geen `If-None-Match`), vraagt na de eerste sync om sync-collection en moet apart aangezet worden. De API is beter gedocumenteerd, schrijft herhalingen zelf uit en PATCH laat herinneringen staan.
- **Eén gezamenlijke vorm voor beide diensten** (`kalender.py`: dezelfde methoden, afspraken als dicts), zodat de sync-logica (wie wint, verwijderen, logregels één kant op) één keer bestaat.
- **Eigen OAuth-client van de gebruiker** (zoals de Google-integratie van HA zelf): een gedeelde client van Shipborn zou verificatie door Google vragen en is niet nodig voor één boot.
- **Koppelen door het localhost-adres terug te plakken** (desktop-client, loopback-redirect, PKCE): de device flow ("code invoeren op een ander apparaat") staat de agenda-scope niet toe, en een vaste redirect naar de app kan niet omdat het ingress-adres per sessie verandert. Nadeel: één handmatige kopieerstap.
- **Token in `/data/google_token.json`** (alleen voor de app leesbaar), niet in de database (die gaat naar `/share`).
- Gebruiker moet het toestemmingsscherm op **In productie** zetten: in testmodus verlopen vernieuwingssleutels na 7 dagen.

