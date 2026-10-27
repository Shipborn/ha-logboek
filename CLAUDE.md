# Projectnotities

Home Assistant-app (vroeger "add-on") **Shipborn App** (map `shipborn_app/`, slug nog `logboek`): één paneel met modules. Logboek (onderhoudslogboek met foto's en taken) is één module; Onderhoud en Reizen zijn nog lege plekken. UI en teksten in het Nederlands.

Werkwijze per sessie (nieuwe datummap): zie `../CLAUDE.md`.

## Structuur
- `repository.yaml` – maakt deze repo installeerbaar als HA-app-repository.
- `shipborn_app/config.yaml` – app-manifest. **Verhoog `version` bij elke wijziging** (ook `VERSION` in `shipborn_app/app/app.py`), anders biedt HA geen update aan.
- `shipborn_app/Dockerfile` – bewust `FROM alpine:3.22` i.p.v. `ARG BUILD_FROM`: de Supervisor van de gebruiker geeft `BUILD_FROM` niet mee, dat brak de build.
- `shipborn_app/app/app.py` – Flask + waitress op poort 8099 (ingress). SQLite in `/data/logboek.db`, foto's in `/share/logboek/photos` (JPEG + `_t.jpg`-thumbnail, EXIF-rotatie, verkleind tot `photo_max_px`).
- Frontend: vanilla JS zonder build-stap, relatieve URL's (`api/...`, `static/...`) vanwege ingress. Flask stelt de pagina samen met Jinja (`render_template`); `MODULES` in `app.py` bepaalt het hoofdmenu en de tabbladen (id, naam, bestand).
  - Per tabblad horen bij elkaar: `app/templates/<module>/<tab>.html` (een `<section id="view-<id>" hidden>` + de dialogen van dat tabblad), `app/static/<module>/<tab>.js` en `.css` (alleen geladen als ze bestaan). Tabbladen: `logboek/logregels` (`log`), `logboek/taken` (`tasks`), `logboek/categorieen` (`cats`), `onderhoud/onderhoud`, `reizen/reizen`, `instellingen/instellingen` (`settings`).
  - Gedeeld: `templates/index.html` (skelet: kop, menu, includes, scripts), `templates/gedeeld/macros.html` (`dialoog`, `voet`, `binnenkort`), `templates/gedeeld/fotos.html` (camera, editor, lightbox), `static/gedeeld/basis.css` en `fotos.css`, en de scripts in deze volgorde: `basis.js` (hulpfuncties, `api`, navigatie `show`, opstarten `start`), `ui.js` (HTML-bouwstenen: `chip`, `leeg`, `pdfKnop`, `statsHtml`, `thumbsHtml`, `tijdlijnHtml`/`tlClick`), `ha.js` (`entPicker`), `fotos.js` (`shrinkPhoto`, `openCamera(onFile)`, `openEditor(src, target, klaar)`, `openLightbox`). Daarna de tabbladscripts.
  - Gewone `<script>`-bestanden, geen ES-modules: top-level functies/variabelen zijn globaal en worden tussen tabbladen gebruikt (bijv. `openEntry` uit logregels in taken/categorieën). Namen moeten dus uniek zijn over alle bestanden.
  - Een tabblad meldt zich aan met `tabblad(id, {nieuw, toon, config, laden, ververs, naVerversen})` (uitleg in `basis.js`). Na een wijziging `verversAlles()`. Berichten tussen tabbladen met `op`/`meld` (bijv. `meld('taken', TASKS)` vult de taakkeuze in de logregeldialoog). Keuzelijsten met `data-categorieen="<eerste optie>"` vult `vulCategorieKeuzes()`. Rode tellers: `zetTeller(tab, n)` (module toont het totaal). URL-hash `#<module>/<tab>` onthoudt de plek.
  - Nieuw tabblad: regel in `MODULES` + template (+ js/css). Logregels: lijst + logregeldialoog; Taken: lijst, taakdialoog, geschiedenisdialoog; Categorieën: beheer + dialoog met alle logregels van die categorie.
- `shipborn_app/DOCS.md` – gebruikersdocumentatie (getoond in HA).

## Gedrag
- Slug blijft `logboek` (0.14.0): een andere slug is in HA een nieuwe app met een lege `/data`. Daarom ook `/share/logboek`, MQTT-topics `logboek/...` en de databasenaam ongewijzigd. Zie `docs/DECISIONS.md`.
- Categorieën staan in de tabel `categories`; optie `categories` is alleen de beginlijst. Hernoemen past entries/tasks mee aan, verwijderen zet hun categorie op NULL.
- Taakstatus: achterstallig / binnenkort (`warn_days`, `warn_hours`) / ok / onbekend / inactief; interval in dagen en/of motoruren, wat het eerst komt.
- Logregels: `duur_minuten` (bestede tijd, invoer `1:30` / `1,5` / `45 min`, kolom via `ALTER TABLE` in `init_db`). Tijdstempels (`created_at`/`updated_at`) in UTC met offset; oudere zonder offset zijn ook UTC — de browser toont lokale tijd.
- Foto's: twee `<label for>`-knoppen (camera met `capture="environment"`, galerij met `multiple`), inputs niet `hidden`/`display:none` en geen `.click()` — anders werkt het niet in de Android-webview van de HA-app (getest op Galaxy A54). In de **HA Android-app** (`HA_ANDROID`: UA bevat Home Assistant of `externalApp` in window/parent) wordt `capture` genegeerd en levert `multiple` geen bestanden op: daar is `multiple` uit en opent Foto maken een camera in de pagina (`#camDlg`, `getUserMedia`, vereist https en cameratoestemming van de app). Foto's worden in de browser verkleind naar JPEG (`shrinkPhoto`, `photo_max_px`) vóór upload. Per foto `photos.omschrijving`: nieuwe foto's via `foto_omschrijving` (zelfde volgorde als `fotos`), bestaande via `foto_<id>_omschrijving` bij PUT van de logregel.
- Meetwaarden: `tasks.entiteiten` / `categories.entiteiten` (JSON-lijst entity_id's). Bij **aanmaken** van een logregel worden de states van taak + categorie opgehaald (`capture_values`) en in `entry_values` gezet; bewerken laat ze ongemoeid. `api/ha/entities` (keuzelijst), `api/ha/preview` (voorbeeld in dialoog). Lokaal testen met nep-HA: `HA_API=http://127.0.0.1:8123/api SUPERVISOR_TOKEN=test`.
- Logregelformulier heeft geen motoruren/kosten meer (0.7.0). Bij aanmaken worden motoruren stil uit `engine_hours()` gehaald (nodig voor taakintervallen op uren); bij bewerken blijven oude motoruren/kosten staan. Kolommen bestaan nog in de database.
- Dagmail (0.8.0): `mail_loop` checkt elke 30 s; na `email_time` (tijdzone uit HA `/api/config`, `tzdata` in Dockerfile) en als `meta.email_dag` ≠ vandaag → logregels met `created_at` > `meta.email_tot` mailen via SMTP (HTML + inline thumbnails). Geen logregels = geen mail. `POST api/email/test` stuurt de logregels van vandaag zonder meta te wijzigen. Lokaal testen: `python -m aiosmtpd -n -l 127.0.0.1:1025 -c aiosmtpd.handlers.Mailbox <dir>` met `smtp_security: geen`.
- Foto-editor (0.11.0): `#editor` met canvas; vormen in beeldcoördinaten (`ed.shapes`), bij Opslaan JPEG via `toBlob`. Nieuwe foto: vervangt `pending[i].file`. Bestaande foto: `POST api/photos/<id>/bewerkt` (direct, los van Opslaan van de logregel); eerste bewerking bewaart het origineel in `photos.origineel`, `POST .../herstel` zet het terug. Afbeelding laden via `onload`, niet `decode()` (hangt in verborgen webviews).
- Logo (0.12.0): `/share/logboek/logo.png` (PNG, transparantie behouden, max 1000×400). `GET logo.png?v=<mtime>`, `POST/DELETE api/logo`, `config.logo` = mtime. Module Instellingen; `LogPdf.heading` zet het linksboven (max 70×18 mm); `build_report` zet het inline (PNG) bovenaan de dagmail.
- PDF (0.10.0): fpdf2 met DejaVu (`font-dejavu` in Dockerfile; lokaal valt `LogPdf` terug op Arial van macOS). `api/pdf/entry|task|category/<id>`; één logregel gebruikt grote foto's (2 per rij), taak/categorie miniaturen (4 per rij). Titel blijft bij de eerste fotorij (`entry` checkt de benodigde hoogte). Knoppen (`.pdfbtn` / `.ib.pdf`) staan op de overzichtskaarten, niet in de dialogen; klikhandlers van de lijsten negeren `.pdfbtn`.
- Gebruikers (0.13.0): `panel_admin: false` → ook niet-beheerders zien het paneel; geen rechtenverschil in de app. `current_user()` leest de ingress-headers `X-Remote-User-Display-Name` / `X-Remote-User-Name`; `entries.ingevoerd_door` bij aanmaken, `gewijzigd_door` bij PUT. Lokaal zonder ingress: leeg.
- Motoruren via HA Core API (`engine_hours_entity`), MQTT-broker via Supervisor `services/mqtt` of handmatige opties. MQTT discovery onder `homeassistant/<component>/logboek/...`, state onder `logboek/...`.

## Testen lokaal
`DATA_DIR=/tmp/lb/data PHOTO_DIR=/tmp/lb/photos OPTIONS_FILE=/tmp/lb/none.json python3 shipborn_app/app/app.py` en open http://localhost:8099.
Pakketten (zie Dockerfile): `pip install flask waitress paho-mqtt requests fpdf2 pillow`, op Windows het liefst in een venv in de scratchpad, niet in de Dropbox-map. Zonder backend werkt de pagina niet meer (Jinja-templates); een statische server volstaat dus niet.


## Maintaining project context
At the end of each substantial task, review whether the project's persistent documentation needs updating.
- Update CLAUDE.md when architecture, conventions, setup instructions, or important constraints change.
- Maintain docs/STATUS.md with the current project state, completed work, outstanding issues, and next steps.
- Record important technical decisions and their rationale in docs/DECISIONS.md.
- Keep documentation concise, accurate, and free of redundant information.
- Never overwrite useful existing documentation without reviewing it.
- Before finishing a task, summarize which documentation files were updated and which were left unchanged.
- Do not commit or push changes unless explicitly requested.