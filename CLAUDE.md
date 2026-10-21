# Projectnotities

Home Assistant-app (vroeger "add-on") `logboek`: onderhoudslogboek met foto's en onderhoudstaken. UI en teksten in het Nederlands.

## Structuur
- `repository.yaml` – maakt deze repo installeerbaar als HA-app-repository.
- `logboek/config.yaml` – app-manifest. **Verhoog `version` bij elke wijziging** (ook `VERSION` in `logboek/app/app.py`), anders biedt HA geen update aan.
- `logboek/Dockerfile` – bewust `FROM alpine:3.22` i.p.v. `ARG BUILD_FROM`: de Supervisor van de gebruiker geeft `BUILD_FROM` niet mee, dat brak de build.
- `logboek/app/app.py` – Flask + waitress op poort 8099 (ingress). SQLite in `/data/logboek.db`, foto's in `/share/logboek/photos` (JPEG + `_t.jpg`-thumbnail, EXIF-rotatie, verkleind tot `photo_max_px`).
- `logboek/app/static/index.html` – volledige frontend in één bestand, vanilla JS, relatieve URL's (`api/...`) vanwege ingress. Tabbladen: Logboek, Taken (met geschiedenisdialoog per taak), Categorieën (klik → dialoog met alle logregels van die categorie). Beide dialogen delen `tlItem`/`tlClick` voor de tijdlijn.
- `logboek/DOCS.md` – gebruikersdocumentatie (getoond in HA).

## Gedrag
- Categorieën staan in de tabel `categories`; optie `categories` is alleen de beginlijst. Hernoemen past entries/tasks mee aan, verwijderen zet hun categorie op NULL.
- Taakstatus: achterstallig / binnenkort (`warn_days`, `warn_hours`) / ok / onbekend / inactief; interval in dagen en/of motoruren, wat het eerst komt.
- Logregels: `duur_minuten` (bestede tijd, invoer `1:30` / `1,5` / `45 min`, kolom via `ALTER TABLE` in `init_db`). Tijdstempels (`created_at`/`updated_at`) in UTC met offset; oudere zonder offset zijn ook UTC — de browser toont lokale tijd.
- Foto's: twee `<label for>`-knoppen (camera met `capture="environment"`, galerij met `multiple`), inputs niet `hidden`/`display:none` en geen `.click()` — anders werkt het niet in de Android-webview van de HA-app (getest op Galaxy A54). Foto's worden in de browser verkleind naar JPEG (`shrinkPhoto`, `photo_max_px`) vóór upload.
- Meetwaarden: `tasks.entiteiten` / `categories.entiteiten` (JSON-lijst entity_id's). Bij **aanmaken** van een logregel worden de states van taak + categorie opgehaald (`capture_values`) en in `entry_values` gezet; bewerken laat ze ongemoeid. `api/ha/entities` (keuzelijst), `api/ha/preview` (voorbeeld in dialoog). Lokaal testen met nep-HA: `HA_API=http://127.0.0.1:8123/api SUPERVISOR_TOKEN=test`.
- Logregelformulier heeft geen motoruren/kosten meer (0.7.0). Bij aanmaken worden motoruren stil uit `engine_hours()` gehaald (nodig voor taakintervallen op uren); bij bewerken blijven oude motoruren/kosten staan. Kolommen bestaan nog in de database.
- Dagmail (0.8.0): `mail_loop` checkt elke 30 s; na `email_time` (tijdzone uit HA `/api/config`, `tzdata` in Dockerfile) en als `meta.email_dag` ≠ vandaag → logregels met `created_at` > `meta.email_tot` mailen via SMTP (HTML + inline thumbnails). Geen logregels = geen mail. `POST api/email/test` stuurt de logregels van vandaag zonder meta te wijzigen. Lokaal testen: `python -m aiosmtpd -n -l 127.0.0.1:1025 -c aiosmtpd.handlers.Mailbox <dir>` met `smtp_security: geen`.
- Motoruren via HA Core API (`engine_hours_entity`), MQTT-broker via Supervisor `services/mqtt` of handmatige opties. MQTT discovery onder `homeassistant/<component>/logboek/...`, state onder `logboek/...`.

## Testen lokaal
`DATA_DIR=/tmp/lb/data PHOTO_DIR=/tmp/lb/photos OPTIONS_FILE=/tmp/lb/none.json python3 logboek/app/app.py` en open http://localhost:8099.
