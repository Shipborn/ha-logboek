"""Agenda-koppelingen voor de module Agenda: CalDAV (iCloud, Nextcloud, Radicale …) en Google Agenda.

Beide diensten hebben dezelfde methoden (kalenders, afspraken, ophalen, opslaan, verwijderen) en geven
afspraken als gewone dicts:
    {uid, ref, etag, titel, omschrijving, locatie, start, eind, basis}
start/eind: date (hele dag, eind exclusief) of datetime (met tijdzone; zonder = zwevend, lokale tijd).
ref: waar de afspraak staat (CalDAV: URL, Google: event-id). basis: wat nodig is om bij te werken
zonder iets kwijt te raken (CalDAV: de hele agenda-tekst, zodat bijv. herinneringen blijven staan).
Opslaan krijgt velden {titel, datum, tijd, duur, omschrijving}.
"""
import html
import json
import os
import re
import xml.etree.ElementTree as ET
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import quote, urlencode, urljoin, urlsplit

import icalendar
import recurring_ical_events
import requests

VOET = "\n\n— Shipborn App"


class AgendaFout(Exception):
    pass


class VerbindingsFout(AgendaFout):
    """Inloggen mislukt of dienst niet bereikbaar: de hele synchronisatieronde stopt."""


class Conflict(AgendaFout):
    """De afspraak is intussen in de agenda gewijzigd (ETag klopt niet meer)."""


# --------------------------------------------------------------------------- algemeen

def _lokaal(dt, tz):
    return dt.replace(tzinfo=tz) if dt.tzinfo is None else dt.astimezone(tz)


def tijden(a, tz):
    """{datum, tijd, einddatum, eindtijd, duur_minuten} van een afspraak in lokale tijd (tijd None = hele dag)."""
    start, eind = a["start"], a["eind"]
    if not isinstance(start, datetime):
        if not (isinstance(eind, date) and not isinstance(eind, datetime) and eind > start):
            eind = start + timedelta(days=1)
        return {"datum": start.isoformat(), "tijd": None, "einddatum": (eind - timedelta(days=1)).isoformat(),
                "eindtijd": None, "duur_minuten": None}
    s = _lokaal(start, tz)
    e = _lokaal(eind, tz) if isinstance(eind, datetime) else s
    return {"datum": s.date().isoformat(), "tijd": s.strftime("%H:%M"), "einddatum": e.date().isoformat(),
            "eindtijd": e.strftime("%H:%M"), "duur_minuten": max(0, int((e - s).total_seconds() // 60)) or None}


def start_eind(v, tz):
    """Begin en eind (UTC-datetimes, of datums bij een hele dag) uit de velden datum/tijd/duur."""
    d = date.fromisoformat(v["datum"])
    if not v.get("tijd"):
        return d, d + timedelta(days=1)
    h, m = map(int, v["tijd"].split(":"))
    s = datetime.combine(d, time(h, m), tz).astimezone(timezone.utc)
    return s, s + timedelta(minutes=v.get("duur") or 60)


def zonder_voet(omschrijving):
    i = (omschrijving or "").find(VOET.strip())
    return (omschrijving[:i] if i >= 0 else omschrijving or "").strip()


def utc_dag(d, tz):
    return datetime.combine(d, time(0), tz).astimezone(timezone.utc)


# --------------------------------------------------------------------------- iCalendar

def lees(ics):
    try:
        return icalendar.Calendar.from_ical(ics)
    except Exception:  # noqa: BLE001
        return None


def hoofd(cal):
    """De eigenlijke afspraak (niet een losse wijziging van een herhaling)."""
    evs = list(cal.walk("VEVENT"))
    for ev in evs:
        if "RECURRENCE-ID" not in ev:
            return ev
    return evs[0] if evs else None


def _tekst(ev, veld):
    v = ev.get(veld)
    return str(v).strip() if v is not None else ""


def _uit_vevent(ev, ref="", etag="", basis=None):
    if ev is None or ev.get("DTSTART") is None:
        return None
    start = ev["DTSTART"].dt
    if ev.get("DTEND") is not None:
        eind = ev["DTEND"].dt
    elif ev.get("DURATION") is not None:
        eind = start + ev["DURATION"].dt
    else:
        eind = start if isinstance(start, datetime) else start + timedelta(days=1)
    return {"uid": _tekst(ev, "UID"), "ref": ref, "etag": etag, "titel": _tekst(ev, "SUMMARY"),
            "omschrijving": _tekst(ev, "DESCRIPTION"), "locatie": _tekst(ev, "LOCATION"),
            "start": start, "eind": eind, "basis": basis}


def maak_ics(uid, v, tz, basis=None):
    """iCalendar-tekst van een afspraak. Met basis (bestaande agenda) blijven o.a. herinneringen behouden."""
    cal = basis
    ev = hoofd(cal) if cal is not None else None
    if ev is None:
        cal = icalendar.Calendar()
        cal.add("prodid", "-//Shipborn App//NL")
        cal.add("version", "2.0")
        ev = icalendar.Event()
        ev.add("uid", uid)
        cal.add_component(ev)
    for k in ("DTSTART", "DTEND", "DURATION", "SUMMARY", "DESCRIPTION", "DTSTAMP", "LAST-MODIFIED",
              "RRULE", "RDATE", "EXDATE"):
        while k in ev:
            del ev[k]
    # losse wijzigingen van een herhaling horen er niet meer bij
    cal.subcomponents = [c for c in cal.subcomponents if not (c.name == "VEVENT" and c is not ev)]
    s, e = start_eind(v, tz)
    ev.add("dtstart", s)
    ev.add("dtend", e)
    ev.add("summary", v["titel"])
    if v.get("omschrijving"):
        ev.add("description", v["omschrijving"])
    stamp = datetime.now(timezone.utc).replace(microsecond=0)
    ev.add("dtstamp", stamp)
    ev.add("last-modified", stamp)
    return cal.to_ical().decode("utf-8")


# --------------------------------------------------------------------------- CalDAV

D, C = "{DAV:}", "{urn:ietf:params:xml:ns:caldav}"
XMLNS = 'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:ic="http://apple.com/ns/ical/"'


class CalDav:
    """Kleine CalDAV-client met requests. Redirects worden zelf gevolgd, zodat de PROPFIND/REPORT-body en het
    inloggen behouden blijven (iCloud stuurt door naar pNN-caldav.icloud.com)."""
    naam = "CalDAV"

    def __init__(self, url, gebruiker, wachtwoord, tz=timezone.utc, timeout=30):
        self.url = url if url.endswith("/") else url + "/"
        self.auth = (gebruiker, wachtwoord)
        self.tz = tz
        self.s = requests.Session()
        self.s.headers["User-Agent"] = "ShipbornApp"
        self.timeout = timeout

    def _req(self, method, url, body=None, depth=None, headers=None, ok=(200, 207)):
        h = dict(headers or {})
        if body is not None:
            h.setdefault("Content-Type", 'application/xml; charset="utf-8"')
            body = body.encode("utf-8")
        if depth is not None:
            h["Depth"] = str(depth)
        for _ in range(6):
            try:
                r = self.s.request(method, url, data=body, headers=h, auth=self.auth,
                                   timeout=self.timeout, allow_redirects=False)
            except requests.RequestException as e:
                raise VerbindingsFout(f"Agenda niet bereikbaar ({urlsplit(url).netloc}): {e.__class__.__name__}") from e
            if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("Location"):
                url = urljoin(url, r.headers["Location"])
                continue
            break
        if r.status_code == 401:
            raise VerbindingsFout("Inloggen bij de agenda mislukt: controleer gebruikersnaam en (app-specifiek) wachtwoord")
        if r.status_code == 412:
            raise Conflict("De afspraak is intussen in de agenda gewijzigd")
        if r.status_code not in ok:
            raise AgendaFout(f"Agenda gaf een fout bij {method}: HTTP {r.status_code}")
        return r

    def _propfind(self, url, props, depth):
        body = f'<?xml version="1.0" encoding="utf-8"?><d:propfind {XMLNS}><d:prop>{props}</d:prop></d:propfind>'
        return self._req("PROPFIND", url, body, depth)

    @staticmethod
    def _multistatus(r):
        """[(absolute href, {tag: element})] met alleen de eigenschappen die status 200 hebben."""
        try:
            root = ET.fromstring(r.content)
        except ET.ParseError as e:
            raise AgendaFout("Onverwacht antwoord van de agenda") from e
        out = []
        for resp in root.iter(D + "response"):
            href = resp.findtext(D + "href")
            if not href:
                continue
            props = {}
            for ps in resp.findall(D + "propstat"):
                if " 200" not in (ps.findtext(D + "status") or ""):
                    continue
                prop = ps.find(D + "prop")
                for p in (list(prop) if prop is not None else []):
                    props[p.tag] = p
            out.append((urljoin(r.url, href.strip()), props))
        return out

    def _href_prop(self, url, prop, depth=0):
        r = self._propfind(url, prop, depth)
        tag = D + prop[3:-2] if prop.startswith("<d:") else C + prop[3:-2]
        for _, props in self._multistatus(r):
            el = props.get(tag)
            h = el.findtext(D + "href") if el is not None else None
            if h:
                return urljoin(r.url, h.strip())
        return None

    def kalenders(self):
        """[{href, naam, kleur}] van de kalenders waarin afspraken (VEVENT) kunnen."""
        principal = None
        for url in (self.url, urljoin(self.url, "/.well-known/caldav")):
            try:
                principal = self._href_prop(url, "<d:current-user-principal/>")
            except AgendaFout as e:
                if "Inloggen" in str(e):
                    raise
                continue
            if principal:
                break
        if not principal:
            raise AgendaFout("Geen CalDAV-account gevonden op deze URL")
        home = self._href_prop(principal, "<c:calendar-home-set/>") or principal
        r = self._propfind(home, "<d:resourcetype/><d:displayname/><c:supported-calendar-component-set/>"
                                 "<ic:calendar-color/>", 1)
        out = []
        for href, props in self._multistatus(r):
            rt = props.get(D + "resourcetype")
            if rt is None or rt.find(C + "calendar") is None:
                continue
            comps = props.get(C + "supported-calendar-component-set")
            namen = {c.get("name") for c in comps} if comps is not None else set()
            if namen and "VEVENT" not in namen:
                continue
            naam = (props[D + "displayname"].text if D + "displayname" in props else None) or \
                href.rstrip("/").rsplit("/", 1)[-1]
            kleur = props.get("{http://apple.com/ns/ical/}calendar-color")
            out.append({"href": href, "naam": naam.strip(), "kleur": (kleur.text or "")[:7] if kleur is not None else ""})
        return sorted(out, key=lambda k: k["naam"].lower())

    def afspraken(self, kal, van, tot):
        """(hoofdafspraken per uid, alle voorkomens incl. herhalingen) die (deels) tussen de datums van en tot vallen."""
        f = "%Y%m%dT%H%M%SZ"
        body = (f'<?xml version="1.0" encoding="utf-8"?><c:calendar-query {XMLNS}>'
                '<d:prop><d:getetag/><c:calendar-data/></d:prop>'
                '<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">'
                f'<c:time-range start="{utc_dag(van, self.tz).strftime(f)}" end="{utc_dag(tot, self.tz).strftime(f)}"/>'
                '</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>')
        r = self._req("REPORT", kal, body, 1)
        hoofden, voorkomens = {}, []
        for href, props in self._multistatus(r):
            data = props.get(C + "calendar-data")
            cal = lees(data.text) if data is not None and data.text else None
            if cal is None:
                continue
            etag = (props[D + "getetag"].text if D + "getetag" in props else "") or ""
            a = _uit_vevent(hoofd(cal), href, etag, cal)
            if not a or not a["uid"]:
                continue
            hoofden[a["uid"]] = a
            try:
                evs = recurring_ical_events.of(cal).between(van, tot)
            except Exception:  # noqa: BLE001
                evs = [hoofd(cal)]
            voorkomens += [x for x in (_uit_vevent(ev) for ev in evs) if x]
        return hoofden, voorkomens

    def ophalen(self, kal, ref):
        """De afspraak op ref, of None als hij niet (meer) bestaat."""
        r = self._req("GET", ref, ok=(200, 404, 410))
        cal = lees(r.text) if r.status_code == 200 else None
        return _uit_vevent(hoofd(cal), ref, r.headers.get("ETag", ""), cal) if cal is not None else None

    def opslaan(self, kal, uid, v, bestaand=None):
        """Afspraak opslaan (nieuw, of bestaand bijwerken als hij intussen niet gewijzigd is); geeft {ref, etag}."""
        ics = maak_ics(uid, v, self.tz, bestaand["basis"] if bestaand else None)
        h = {"Content-Type": "text/calendar; charset=utf-8"}
        if bestaand:
            href = bestaand["ref"]
            if bestaand.get("etag"):
                h["If-Match"] = bestaand["etag"]
        else:
            href = urljoin(kal if kal.endswith("/") else kal + "/", uid + ".ics")
            h["If-None-Match"] = "*"
        r = self._req("PUT", href, ics, headers=h, ok=(200, 201, 204))
        etag = r.headers.get("ETag") or ((self.ophalen(kal, href) or {}).get("etag") or "")
        return {"ref": href, "etag": etag}

    def verwijderen(self, kal, ref):
        self._req("DELETE", ref, ok=(200, 204, 404, 410))


# --------------------------------------------------------------------------- Google Agenda

GOOGLE_API = os.environ.get("GOOGLE_API", "https://www.googleapis.com/calendar/v3")
GOOGLE_TOKEN_URL = os.environ.get("GOOGLE_TOKEN_URL", "https://oauth2.googleapis.com/token")
GOOGLE_AUTH_URL = os.environ.get("GOOGLE_AUTH_URL", "https://accounts.google.com/o/oauth2/v2/auth")
GOOGLE_REVOKE_URL = os.environ.get("GOOGLE_REVOKE_URL", "https://oauth2.googleapis.com/revoke")
GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar"
# Google staat voor agenda's geen koppeling via een code op een ander apparaat toe; daarom een "desktop-app"-
# client met een loopback-adres: na toestemming opent de browser http://localhost/?code=…, en dat adres plak je
# in de app.
GOOGLE_REDIRECT = "http://localhost"


def _google_tijd(t):
    if "date" in t and t["date"]:
        return date.fromisoformat(t["date"])
    return datetime.fromisoformat(t["dateTime"].replace("Z", "+00:00"))


def _platte_tekst(s):
    """Google maakt van een omschrijving soms HTML (bij bewerken in de webversie)."""
    if not s or "<" not in s:
        return html.unescape(s or "")
    s = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>", "\n", s)
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


class Google:
    naam = "Google"

    def __init__(self, client_id, client_secret, token_pad, tz=timezone.utc, timeout=30):
        self.client_id, self.client_secret, self.token_pad = client_id, client_secret, token_pad
        self.tz = tz
        self.timeout = timeout
        self.s = requests.Session()

    # ---- koppelen
    def koppel_url(self, state, challenge):
        return GOOGLE_AUTH_URL + "?" + urlencode({
            "client_id": self.client_id, "redirect_uri": GOOGLE_REDIRECT, "response_type": "code",
            "scope": GOOGLE_SCOPE, "access_type": "offline", "prompt": "consent", "state": state,
            "code_challenge": challenge, "code_challenge_method": "S256"})

    def koppel_af(self, code, verifier):
        r = self._token_req({"grant_type": "authorization_code", "code": code, "code_verifier": verifier,
                             "redirect_uri": GOOGLE_REDIRECT})
        if not r.get("refresh_token"):
            raise AgendaFout("Google gaf geen vernieuwingssleutel; ontkoppel de app in je Google-account en probeer opnieuw")
        self._bewaar(r)

    def gekoppeld(self):
        return bool(self._lees().get("refresh_token"))

    def ontkoppel(self):
        t = self._lees()
        if t.get("refresh_token"):
            try:
                requests.post(GOOGLE_REVOKE_URL, data={"token": t["refresh_token"]}, timeout=10)
            except requests.RequestException:
                pass
        try:
            os.remove(self.token_pad)
        except FileNotFoundError:
            pass

    def _lees(self):
        try:
            with open(self.token_pad, encoding="utf-8") as f:
                return json.load(f)
        except (FileNotFoundError, ValueError):
            return {}

    def _bewaar(self, r, oud=None):
        t = dict(oud or {})
        t["access_token"] = r["access_token"]
        t["verloopt"] = (datetime.now(timezone.utc) + timedelta(seconds=int(r.get("expires_in", 3600)) - 60)).isoformat()
        if r.get("refresh_token"):
            t["refresh_token"] = r["refresh_token"]
        tmp = self.token_pad + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(t, f)
        os.chmod(tmp, 0o600)
        os.replace(tmp, self.token_pad)
        return t

    def _token_req(self, data):
        try:
            r = requests.post(GOOGLE_TOKEN_URL, data={**data, "client_id": self.client_id,
                                                      "client_secret": self.client_secret}, timeout=self.timeout)
        except requests.RequestException as e:
            raise VerbindingsFout(f"Google niet bereikbaar: {e.__class__.__name__}") from e
        try:
            body = r.json()
        except ValueError:
            body = {}
        if r.status_code != 200:
            fout = body.get("error", f"HTTP {r.status_code}")
            if fout == "invalid_grant":
                raise VerbindingsFout("De koppeling met Google is verlopen of ingetrokken; koppel opnieuw in Instellingen › Agenda")
            if fout in ("invalid_client", "unauthorized_client"):
                raise VerbindingsFout("Google weigert de client-ID of het client-secret; controleer de opties google_client_id en google_client_secret")
            raise AgendaFout(f"Google gaf een fout: {body.get('error_description') or fout}")
        return body

    def _token(self, vernieuw=False):
        t = self._lees()
        if not t.get("refresh_token"):
            raise VerbindingsFout("Nog niet gekoppeld met Google (Instellingen › Agenda)")
        if vernieuw or not t.get("access_token") or datetime.fromisoformat(t["verloopt"]) <= datetime.now(timezone.utc):
            t = self._bewaar(self._token_req({"grant_type": "refresh_token", "refresh_token": t["refresh_token"]}), t)
        return t["access_token"]

    def _req(self, method, pad, params=None, body=None, headers=None, ok=(200,)):
        for poging in range(2):
            h = {"Authorization": "Bearer " + self._token(vernieuw=poging > 0), **(headers or {})}
            try:
                r = self.s.request(method, GOOGLE_API + pad, params=params, json=body, headers=h, timeout=self.timeout)
            except requests.RequestException as e:
                raise VerbindingsFout(f"Google niet bereikbaar: {e.__class__.__name__}") from e
            if r.status_code != 401:
                break
        if r.status_code == 412:
            raise Conflict("De afspraak is intussen in de agenda gewijzigd")
        if r.status_code not in ok:
            try:
                msg = r.json()["error"]["message"]
            except (ValueError, KeyError, TypeError):
                msg = f"HTTP {r.status_code}"
            if r.status_code == 403 and "has not been used" in msg:
                msg = "de Google Calendar API staat nog niet aan in je Google Cloud-project"
            raise AgendaFout(f"Google Agenda gaf een fout bij {method}: {msg}")
        return r

    @staticmethod
    def _afspraak(e):
        if e.get("status") == "cancelled" or "start" not in e:
            return None
        return {"uid": e.get("iCalUID") or e["id"], "ref": e["id"], "etag": e.get("etag", ""),
                "titel": e.get("summary", ""), "omschrijving": _platte_tekst(e.get("description")),
                "locatie": e.get("location", ""), "start": _google_tijd(e["start"]), "eind": _google_tijd(e["end"]),
                "basis": None}

    def _kal(self, kal):
        return "/calendars/" + quote(kal, safe="")

    def kalenders(self):
        r = self._req("GET", "/users/me/calendarList", {"minAccessRole": "writer"}).json()
        items = sorted(r.get("items", []), key=lambda k: (not k.get("primary"), (k.get("summary") or "").lower()))
        return [{"href": k["id"], "naam": k.get("summaryOverride") or k.get("summary") or k["id"],
                 "kleur": k.get("backgroundColor", "")} for k in items]

    def afspraken(self, kal, van, tot):
        """(hoofdafspraken per uid, alle voorkomens); herhalingen worden door Google al uitgeschreven."""
        params = {"timeMin": utc_dag(van, self.tz).isoformat(), "timeMax": utc_dag(tot, self.tz).isoformat(),
                  "singleEvents": "true", "maxResults": 2500}
        hoofden, voorkomens = {}, []
        while True:
            r = self._req("GET", self._kal(kal) + "/events", params).json()
            for e in r.get("items", []):
                a = self._afspraak(e)
                if a:
                    voorkomens.append(a)
                    if not e.get("recurringEventId"):
                        hoofden[a["uid"]] = a
            if not r.get("nextPageToken"):
                return hoofden, voorkomens
            params["pageToken"] = r["nextPageToken"]

    def ophalen(self, kal, ref):
        r = self._req("GET", f"{self._kal(kal)}/events/{quote(ref, safe='')}", ok=(200, 404, 410))
        return self._afspraak(r.json()) if r.status_code == 200 else None

    def opslaan(self, kal, uid, v, bestaand=None):
        s, e = start_eind(v, self.tz)
        tijd = (lambda x: {"date": x.isoformat(), "dateTime": None, "timeZone": None}) if not isinstance(s, datetime) \
            else (lambda x: {"dateTime": x.isoformat().replace("+00:00", "Z"), "date": None, "timeZone": None})
        body = {"summary": v["titel"], "description": v.get("omschrijving") or "", "start": tijd(s), "end": tijd(e)}
        if bestaand:   # alleen deze velden wijzigen; herinneringen e.d. blijven staan
            h = {"If-Match": bestaand["etag"]} if bestaand.get("etag") else {}
            r = self._req("PATCH", f"{self._kal(kal)}/events/{quote(bestaand['ref'], safe='')}", body=body, headers=h)
        else:          # import: maakt aan, of zet een eerder verwijderde afspraak met deze uid terug
            for k in ("start", "end"):
                body[k] = {x: y for x, y in body[k].items() if y is not None}
            r = self._req("POST", self._kal(kal) + "/events/import", body={**body, "iCalUID": uid, "status": "confirmed"})
        e = r.json()
        return {"ref": e["id"], "etag": e.get("etag", "")}

    def verwijderen(self, kal, ref):
        self._req("DELETE", f"{self._kal(kal)}/events/{quote(ref, safe='')}", ok=(200, 204, 404, 410))
