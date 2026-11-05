# Beslissingen

## 2026-11-05 – Agenda (0.17.0)
- **Eigen module Agenda** (hoofdmenu, tussen Onderhoud en Reizen) met maandkalender en daglijst eronder; maandraster werkt ook op de telefoon (gekleurde balkjes i.p.v. tekst).
- **Aparte tabel `planning`** in plaats van een geplande datum op de taak: een taak kan meerdere keren gepland worden, en losse punten zonder taak (afspraken) zijn ook mogelijk. Bij verwijderen van een taak blijft het punt staan (titel is een kopie van de taaknaam).
- **Afronden via de logregel**: geen aparte "gedaan"-status voor geplande taken; een nieuwe logregel bij de taak rondt het geplande punt af (gekozen punt, anders het oudste open punt van die taak). Wordt die logregel verwijderd, dan staat het punt weer open (`entry_id` → NULL). Losse punten worden afgevinkt.
- **Verwachte datum uit het interval** wordt alleen getoond (niet opgeslagen) en verdwijnt zodra de taak is ingepland; intervallen op uren hebben geen datum en staan niet in de agenda.

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
