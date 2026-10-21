# Logboek voor Home Assistant

Home Assistant-app (add-on) voor een onderhoudslogboek met foto's en terugkerende onderhoudstaken, bijvoorbeeld voor een boot.

- Logregels met datum, categorie, motoruren, kosten, uitvoerder, omschrijving en foto's
- Onderhoudstaken met interval in dagen en/of motoruren, met geschiedenis per taak
- Eigen categorieënbeheer
- Sensoren in Home Assistant via MQTT discovery (achterstallig, binnenkort, resterende dagen/uren)
- CSV-export

## Installeren

1. In Home Assistant: **Instellingen → Apps → store → ⋮ → Repositories**.
2. Voeg toe: `https://github.com/Shipborn/ha-logboek`
3. Installeer **Logboek** en start het.

Zie [logboek/DOCS.md](logboek/DOCS.md) voor de instellingen en het gebruik.
