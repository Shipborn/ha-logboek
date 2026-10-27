# Status

**Versie 0.15.0** (2026-10-26), werkmap `261026`. Werk gepauzeerd.

## Gedaan
- 0.14.0: omgezet naar Shipborn App. Hoofdmenu met de modules Logboek (subtabbladen Logboek, Taken, Categorieën), Onderhoud, Reizen en Instellingen (logo). Logboek werkt zoals 0.13.1. Onderhoud en Reizen tonen "in ontwikkeling".
- 0.15.0: frontend opgesplitst in bestanden per tabblad (template + js + css) met een gedeelde basis. Flask/Jinja stelt de pagina samen.
- Lokaal getest met de echte backend: taak aanmaken, logregel met foto, foto bewerken, lightbox, geschiedenis, categorie hernoemen, PDF, herladen op hash.

## Niet gedaan / niet getest
- **Niet op GitHub.** `Shipborn/ha-logboek` (main) staat nog op 0.13.1, zonder lokale wijzigingen. Pushen lukte niet: er waren geen inloggegevens op deze computer. De procedure staat in `../CLAUDE.md` onder "Publiceren naar GitHub".
- Niet getest in Home Assistant (ingress, update van 0.13.1 met behoud van gegevens) en niet op Android (camera in de HA-app).

## Volgende stappen
1. Nieuwste datummap naar GitHub pushen (zie `../CLAUDE.md`).
2. In HA bijwerken: `/addons/logboek` vervangen door `/addons/shipborn_app` (of de repository verversen) en controleren dat het als update binnenkomt met behoud van logregels en foto's.
3. Testen in de HA Android-app: foto maken, uit galerij, foto bewerken.
4. Open vragen aan de gebruiker:
   - Verhuist Taken naar de module Onderhoud, of wordt Onderhoud iets anders?
   - Wat moet Reizen bevatten (bijv. tochten met datum, route, bemanning, afstand, motoruren)?
   - GitHub-repository hernoemen? (URL in `repository.yaml`, `shipborn_app/config.yaml`, README)
   - Git gebruiken in plaats van (of naast) de datummappen?
