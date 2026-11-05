# Status

**Versie 0.17.0**. Op GitHub (`Shipborn/ha-logboek`, main, 2026-11-05), zonder de map `voorbeeld/`.

## Gedaan
- 0.14.0: omgezet naar Shipborn App met modules.
- 0.15.0: frontend per tabblad in losse bestanden (template + js + css) met gedeelde basis; op GitHub.
- 0.16.0:
  - Taken en Categorieën verplaatst van Logboek naar de module **Onderhoud**; Logboek heeft alleen nog de logregels.
  - **Instellingen › Urentellers**: HA-sensor voor hoofdmotor en generator (in de database, niet meer als app-optie). Bestaande `engine_hours_entity` wordt bij de eerste start overgenomen.
  - Taken met meerdere tellers: dagen, uren hoofdmotor, uren generator; wat het eerst bereikt is telt. Logregels slaan beide urenstanden op. MQTT, PDF en CSV bijgewerkt.
  - **Stappenplan** per taak (editor): stappen toevoegen/verplaatsen/verwijderen, uitleg met eenvoudige opmaak, uitlegafbeeldingen, HA-entiteiten (tonen, bedienen, vereiste status), foto's vragen/verplicht met minimum.
  - **Uitvoeren** van een stappenplan: stap voor stap, Volgende geblokkeerd tot voorwaarden en verplichte foto's in orde zijn, opmerkingen per stap; Afronden maakt automatisch een logregel met foto's, opmerkingen en bestede tijd.
- Lokaal getest met nep-HA (`tools/nep_ha.py`) op een kopie van de 0.15-testdatabase: migratie, urentellers instellen, taak met stappenplan maken (incl. afbeelding), uitvoeren met blokkade, bedienen, verplichte foto's, afronden, status/dueText daarna, PDF en CSV, weigering van bedienen buiten een stappenplan.

- 0.17.0: module **Agenda**: maandkalender met logregels, geplande taken/losse punten en verwachte datums volgens interval; inplannen, afvinken, uitvoeren vanuit de agenda (logregel rondt het punt af). Taken tonen "Ingepland op", Inplannen in de taakgeschiedenis. Lokaal getest (desktop en 375 px breed) met nep-HA: inplannen, uitvoeren met koppeling, automatische koppeling bij loggen buiten de agenda, afvinken, teller, validatie.

## Niet gedaan / niet getest
- Niet getest in Home Assistant zelf (ingress, echte kleppen/schakelaars, update vanaf 0.13.1/0.15.0) en niet in de HA Android-app (camera in de pagina bij Uitvoeren en bij uitlegafbeeldingen).
- Een lopende uitvoering wordt niet bewaard: pagina sluiten = foto's en voortgang kwijt.
- Uitlegafbeeldingen die geüpload zijn in een stappenplan dat daarna niet wordt opgeslagen, blijven als losse bestanden in `/share/logboek/photos` staan.
- Het stappenplan staat niet in de taak-PDF.
- Agenda: niet in HA/Android getest; geen MQTT-sensor of HA-kalender voor geplande punten; geen herhalende planning; intervallen op uren staan niet in de agenda (geen datum).
- `voorbeeld/Wierpot Aft schoonmaken.yaml` (voorbeeld van de gebruiker) staat alleen in de werkmap; bij publiceren naar GitHub weglaten.

## Volgende stappen
1. In HA bijwerken naar 0.16.0; controleren dat de urenteller hoofdmotor is overgenomen en de taken kloppen.
2. Het voorbeeld (wierpot aft) als stappenplan invoeren en met de echte entiteiten testen, ook op Android.
3. Open vragen aan de gebruiker:
   - Lopende uitvoering bewaren (op de server) zodat je later verder kunt?
   - Stappenplan in de taak-PDF (als werkinstructie)?
   - Wat moet Reizen bevatten?
   - GitHub-repository hernoemen? Git gebruiken in plaats van (of naast) de datummappen?
