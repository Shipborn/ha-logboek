# Logboek

Onderhoudslogboek met foto's en terugkerende onderhoudstaken, als paneel in de Home Assistant-zijbalk. Gemaakt voor bijvoorbeeld een boot, maar bruikbaar voor alles waar je onderhoud van bijhoudt.

## Installeren (lokale add-on)

1. Zet de map `logboek` in de map `/addons` van Home Assistant. Dat kan met de **Samba share**-add-on (share `addons`) of met de **Terminal & SSH**-add-on. Het resultaat moet `/addons/logboek/config.yaml` zijn.
2. Ga naar **Instellingen → Add-ons → Add-on Store**, open het menu **⋮** rechtsboven en kies **Controleren op updates**.
3. Onderaan staat nu **Lokale add-ons → Logboek**. Klik op **Installeren**. De eerste build duurt een paar minuten.
4. Stel de opties in (zie hieronder) en klik op **Starten**. Zet **Weergeven in zijbalk** aan.

## Opties

| Optie | Uitleg |
|---|---|
| `title` | Titel bovenaan het paneel en naam van het apparaat in HA. |
| `categories` | Alleen de beginlijst bij de eerste start. Daarna beheer je categorieën in het tabblad **Categorieën** van het paneel. |
| `engine_hours_entity` | Optioneel. Een sensor met de motoruren, bijvoorbeeld `sensor.motoruren`. De actuele stand wordt dan automatisch ingevuld bij een nieuwe logregel en gebruikt voor intervallen op motoruren. |
| `warn_days` / `warn_hours` | Vanaf hoeveel dagen of uren vóór de deadline een taak op **Binnenkort** springt. |
| `photo_max_px` | Foto's worden verkleind tot maximaal dit aantal pixels aan de lange kant. `0` = origineel formaat bewaren. |
| `mqtt_enabled` | Sensoren in HA aanmaken via MQTT discovery. |
| `mqtt_host`, `mqtt_port`, `mqtt_username`, `mqtt_password` | Alleen nodig als je broker **niet** de Mosquitto-add-on is. Laat leeg om de broker automatisch te vinden. |

## Gebruik

- **Logboek**: tik op **+** voor een nieuwe logregel. Met **Foto toevoegen** kun je op je telefoon direct de camera openen of foto's uit je galerij kiezen, ook meerdere tegelijk. Tik op een regel om hem te bewerken. Tik op een foto om hem groot te bekijken. Bij **Bestede tijd** vul je in hoe lang het werk duurde, bijvoorbeeld `1:30` of `1,5` (uur) of `45 min`. Elke logregel toont ook wanneer hij is opgeslagen.
- **Taken**: terugkerend onderhoud met een interval in dagen, motoruren of beide (wat het eerst komt). Met **Uitgevoerd** maak je een logregel aan die aan de taak gekoppeld is, en daarmee start de teller opnieuw.
- Tik op een taak voor de **geschiedenis**: alle keren dat hij is uitgevoerd, met de tussenpozen in dagen en motoruren, totale kosten en tijd, foto's en de notitie van de taak. Vanuit daar kun je een logregel openen, de taak bewerken of hem als uitgevoerd loggen. Oude logregels koppel je aan een taak door ze te bewerken en de taak te kiezen.
- Een nieuwe taak staat op **Nog niet gelogd** tot je de eerste keer logt. Zet dan de datum van de laatste keer dat het onderhoud gedaan is.
- **Categorieën**: toevoegen, hernoemen (bestaande logregels en taken gaan mee), volgorde aanpassen met ↑/↓ en verwijderen.
- **CSV exporteren** levert een bestand dat direct in Excel opent.

## Opslag en back-up

- Database: `/data/logboek.db` (in de back-up van de add-on).
- Foto's: `/share/logboek/photos` (in een volledige back-up, en via Samba bereikbaar).
- Kopie van de database: `/share/logboek/backup/logboek.db`, bijgewerkt na elke wijziging. Start de app zonder eigen database (bijvoorbeeld na een herinstallatie), dan neemt hij deze kopie automatisch over.

## Sensoren in Home Assistant

Met MQTT ingeschakeld verschijnt een apparaat met de naam uit `title`, met:

- per taak: **status**, **achterstallig** (binary sensor), **dagen resterend** en/of **uren resterend**;
- overzicht: **Achterstallige taken** (aantal, met de namen als attribuut), **Taken binnenkort** en **Laatste logregel**.

De sensoren worden elke 5 minuten bijgewerkt en direct na elke wijziging.

### Voorbeeld: melding bij achterstallig onderhoud

Controleer de exacte entity-id onder **Instellingen → Apparaten → MQTT**. Met de titel "Onderhoud boot" is dat meestal `sensor.onderhoud_boot_achterstallige_taken`.

```yaml
automation:
  - alias: Onderhoud boot achterstallig
    triggers:
      - trigger: numeric_state
        entity_id: sensor.onderhoud_boot_achterstallige_taken
        above: 0
    actions:
      - action: notify.mobile_app_jouw_telefoon
        data:
          title: Onderhoud boot
          message: >
            Achterstallig: {{ state_attr('sensor.onderhoud_boot_achterstallige_taken', 'achterstallig') | join(', ') }}
```

## Problemen

- **Foto kan niet gelezen worden (iPhone)**: de browser zet HEIC-foto's meestal zelf om naar JPEG. Lukt dat niet, zet dan **Instellingen › Camera › Formaten** op **Meest compatibel**.
- **Geen sensoren in HA**: kijk in het **Logboek**-tabblad van de add-on. Daar staat of de MQTT-verbinding gelukt is.
- **Motoruren worden niet getoond**: controleer of `engine_hours_entity` bestaat en een getal als status heeft.
