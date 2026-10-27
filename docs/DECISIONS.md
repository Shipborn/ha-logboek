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
