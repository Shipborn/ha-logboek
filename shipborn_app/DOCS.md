# Shipborn App

Eén paneel in de Home Assistant-zijbalk met modules voor je boot. Bovenin kies je de module:

- **Logboek**: logregels met foto's.
- **Onderhoud**: terugkerende onderhoudstaken (met stappenplannen) en categorieën.
- **Reizen**: in ontwikkeling.
- **Instellingen**: urentellers (hoofdmotor, generator) en logo.

## Installeren (lokale add-on)

1. Zet de map `shipborn_app` in de map `/addons` van Home Assistant. Dat kan met de **Samba share**-add-on (share `addons`) of met de **Terminal & SSH**-add-on. Het resultaat moet `/addons/shipborn_app/config.yaml` zijn.
2. Ga naar **Instellingen → Add-ons → Add-on Store**, open het menu **⋮** rechtsboven en kies **Controleren op updates**.
3. Onderaan staat nu **Lokale add-ons → Shipborn App**. Klik op **Installeren**. De eerste build duurt een paar minuten.

**Bijwerken vanaf Logboek (0.13.x)**: de interne naam (slug `logboek`) is gelijk gebleven, dus het is een gewone update en je gegevens blijven staan. Vervang de oude map `/addons/logboek` door `/addons/shipborn_app` (laat ze niet allebei staan) en kies **Controleren op updates**.
4. Stel de opties in (zie hieronder) en klik op **Starten**. Zet **Weergeven in zijbalk** aan.

## Opties

| Optie | Uitleg |
|---|---|
| `title` | Titel bovenaan het paneel en naam van het apparaat in HA. |
| `categories` | Alleen de beginlijst bij de eerste start. Daarna beheer je categorieën in het tabblad **Categorieën** van het paneel. |
| `engine_hours_entity` | Verouderd. De urentellers stel je nu in de app in (**Instellingen › Urentellers**). Een waarde hier wordt alleen bij de eerste start van 0.16.0 overgenomen als teller voor de hoofdmotor. |
| `warn_days` / `warn_hours` | Vanaf hoeveel dagen of uren vóór de deadline een taak op **Binnenkort** springt. |
| `photo_max_px` | Foto's worden verkleind tot maximaal dit aantal pixels aan de lange kant. `0` = origineel formaat bewaren. |
| `mqtt_enabled` | Sensoren in HA aanmaken via MQTT discovery. |
| `mqtt_host`, `mqtt_port`, `mqtt_username`, `mqtt_password` | Alleen nodig als je broker **niet** de Mosquitto-add-on is. Laat leeg om de broker automatisch te vinden. |
| `email_enabled` | Dagelijkse e-mail met de nieuwe logregels aan- of uitzetten. |
| `email_to` | Ontvanger(s), meerdere gescheiden door een komma. |
| `email_time` | Tijdstip van de dagmail, bijvoorbeeld `21:00` (tijdzone van Home Assistant). |
| `smtp_host`, `smtp_port`, `smtp_security` | Uitgaande mailserver. `starttls` met poort `587` werkt bij de meeste providers; `ssl` hoort bij poort `465`. |
| `smtp_username`, `smtp_password` | Inloggegevens van de mailserver. Bij Gmail en Outlook heb je een **app-wachtwoord** nodig, niet je gewone wachtwoord. |
| `smtp_from` | Afzenderadres. Leeg = de gebruikersnaam. |

## Gebruik

Het logboek is voor **alle gebruikers** van Home Assistant beschikbaar, ook zonder beheerdersrechten. Iedereen kan alles in het logboek doen. Bij elke logregel wordt automatisch vastgelegd wie hem heeft ingevoerd (en wie hem het laatst heeft gewijzigd); dat staat bij de logregel, in de PDF, de dagmail en de CSV-export. Na de update: zet **Toon in zijbalk** uit en weer aan, of herstart Home Assistant, zodat gewone gebruikers het item in hun zijbalk zien.

- **Logboek**: tik op **+** voor een nieuwe logregel. Met **Foto maken** open je de camera, met **Uit galerij** kies je bestaande foto's (ook meerdere tegelijk). Foto's worden op de telefoon al verkleind, zodat het uploaden snel gaat. Met de blauwe ✎ op een foto open je de **foto-editor**: vrij tekenen, pijlen, lijnen, rechthoeken, cirkels en tekst, in zes kleuren en drie diktes, met ongedaan maken. Bij een opgeslagen foto blijft het origineel bewaard; met **Origineel herstellen** haal je alle tekeningen weer weg. Naast elke foto kun je een omschrijving typen; die staat onder de foto als je hem groot bekijkt, en in de dagmail en de CSV-export. Tik op een regel om hem te bewerken. Tik op een foto om hem groot te bekijken. Bij **Bestede tijd** vul je in hoe lang het werk duurde, bijvoorbeeld `1:30` of `1,5` (uur) of `45 min`. Elke logregel toont ook wanneer hij is opgeslagen.
- **Onderhoud › Taken**: terugkerend onderhoud. Een taak kan een interval hebben in dagen, in uren van de hoofdmotor en/of in uren van de generator; wat het eerst bereikt is, telt. Met **Uitgevoerd** maak je een logregel aan die aan de taak gekoppeld is, en daarmee starten de tellers opnieuw. Bij elke logregel worden de standen van beide urentellers vastgelegd.
- **Stappenplan**: in **Taak bewerken › Stappenplan maken** zet je het onderhoud op als een reeks stappen. Per stap: een titel, uitleg (met **\*\*vet\*\***, *\*cursief\** en lijstjes met `-` of `1.`), uitlegafbeeldingen, en eventueel Home Assistant-entiteiten. Bij een entiteit kies je of hij in de stap **bediend** kan worden (aan/uit, of open/dicht bij kleppen) en of hij een bepaalde status **moet** hebben voordat je verder kunt (bijv. pomp uit, afsluiter dicht). Per stap stel je ook in of er tijdens het uitvoeren foto's gevraagd worden of **verplicht** zijn (met een minimum aantal). Stappen kun je toevoegen, verplaatsen en verwijderen.
- Een taak met stappenplan heeft de knop **Uitvoeren**: je loopt stap voor stap door het plan. **Volgende** werkt pas als de voorwaarden kloppen en de verplichte foto's gemaakt zijn. Per stap kun je een opmerking typen. **Afronden** maakt automatisch een logregel bij de taak met alle foto's (met de stap erbij), de opmerkingen en de bestede tijd. Let op: tot Afronden staat alles alleen in de browser; sluit je de app tussendoor, dan ben je de uitvoering kwijt.
- Tik op een taak voor de **geschiedenis**: alle keren dat hij is uitgevoerd, met de tussenpozen in dagen en motoruren, totale tijd, foto's en de notitie van de taak. Vanuit daar kun je een logregel openen, de taak bewerken of hem als uitgevoerd loggen. Oude logregels koppel je aan een taak door ze te bewerken en de taak te kiezen.
- Een nieuwe taak staat op **Nog niet gelogd** tot je de eerste keer logt. Zet dan de datum van de laatste keer dat het onderhoud gedaan is.
- **Categorieën**: tik op een categorie om al zijn logregels te zien, met de totale tijd. Daar kun je ook direct een nieuwe logregel in die categorie maken. Verder: toevoegen, hernoemen (bestaande logregels en taken gaan mee), volgorde aanpassen met ↑/↓ en verwijderen.
- **Meetwaarden uit Home Assistant**: koppel bij een taak (in **Taak bewerken**) of een categorie (tik op de categorie) één of meer entiteiten, bijvoorbeeld `sensor.accuspanning`. Bij elke nieuwe logregel met die taak of categorie wordt de actuele waarde automatisch mee opgeslagen en bij de logregel getoond. In het logregelvenster zie je vooraf welke waarden worden vastgelegd. Bewerken van een bestaande logregel verandert de opgeslagen waarden niet.
- **Dagmail**: staat `email_enabled` aan, dan krijg je elke dag op `email_time` een e-mail met alle logregels die sinds de vorige mail zijn ingevoerd, met foto's. Is er niets ingevoerd, dan komt er geen mail. Met **Testmail sturen** (boven het logboek) verstuur je direct een mail met de logregels van vandaag om de instellingen te controleren.
- **PDF**: op elke logregel in het **Logboek**, elke taak in **Taken** en elke categorie in **Categorieën** staat een knop **PDF**. Daarmee maak je een PDF van die logregel, van de taak met al zijn uitvoeringen of van alle logregels in de categorie. Met logo, foto's, omschrijvingen, meetwaarden en bestede tijd.
- **Agenda**: een maandkalender met per dag de logregels (blauw), wat je hebt ingepland (oranje; rood als het te laat is, groen als het gedaan is) en wanneer een taak volgens haar interval in dagen weer moet (grijs). Tik op een dag om alles van die dag eronder te zien. Met **+** of **Inplannen** plan je een onderhoudstaak of een los punt (bijv. "werf bellen") op een datum, met een notitie. Een ingeplande taak voer je uit vanuit de agenda; de logregel die daarbij ontstaat rondt het geplande punt af. Log je een taak ergens anders, dan wordt het oudste openstaande geplande punt van die taak afgerond. Een los punt vink je af met **Afvinken**. Bij **Vandaag** zie je ook wat eerder gepland was en nog openstaat; het aantal daarvan staat rood bij Agenda. Ook vanuit de geschiedenis van een taak kun je **Inplannen**; de geplande datum staat dan bij de taak.
- **Instellingen › Urentellers**: kies de sensoren met de draaiuren van de hoofdmotor en de generator. De standen staan bovenaan de app.
- **Instellingen › Logo**: kies een afbeelding (bij voorkeur PNG met transparante achtergrond). Het logo staat dan links naast de titel bovenaan het logboek, bovenaan elke PDF en bovenaan de dagmail. Met **Verwijderen** haal je het weer weg.
- **CSV exporteren** levert een bestand dat direct in Excel opent.

## Opslag en back-up

- Database: `/data/logboek.db` (in de back-up van de add-on).
- Foto's: `/share/logboek/photos` (in een volledige back-up, en via Samba bereikbaar).
- Logo: `/share/logboek/logo.png`.
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
- **Foto kan niet gelezen worden (Samsung)**: zet in de Camera-app **Instellingen › Geavanceerde opties › HEIF-foto's** uit.
- **Camera in de Android-app van Home Assistant**: **Foto maken** opent daar een camera in het logboek zelf. De eerste keer vraagt de app om cameratoestemming; heb je die geweigerd, zet hem dan aan via **Instellingen › Apps › Home Assistant › Machtigingen › Camera**. Dit werkt alleen als je Home Assistant via **https** opent (bijvoorbeeld Nabu Casa). In de Android-app kies je bij **Uit galerij** één foto per keer.
- **Geen dagmail**: probeer **Testmail sturen**; een foutmelding van de mailserver verschijnt dan in beeld. Gmail voorbeeld: `smtp_host` `smtp.gmail.com`, poort `587`, `starttls`, je Gmail-adres als gebruikersnaam en een app-wachtwoord (Google-account › Beveiliging › App-wachtwoorden).
- **Geen sensoren in HA**: kijk in het **Logboek**-tabblad van de add-on. Daar staat of de MQTT-verbinding gelukt is.
- **Motoruren worden niet getoond**: controleer of `engine_hours_entity` bestaat en een getal als status heeft.
