#!/usr/bin/env python3
"""Logboek add-on voor Home Assistant.

Onderhoudslogboek met foto's en terugkerende onderhoudstaken.
Opslag: SQLite in /data, foto's in /share/logboek/photos.
Koppeling naar HA: motoruren via de Core API, taakstatus via MQTT discovery.
"""
import csv
import io
import json
import logging
import os
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta

import requests
from flask import Flask, Response, abort, jsonify, request, send_from_directory
from PIL import Image, ImageOps

VERSION = "0.3.1"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("logboek")

OPTIONS_FILE = os.environ.get("OPTIONS_FILE", "/data/options.json")
DATA_DIR = os.environ.get("DATA_DIR", "/data")
PHOTO_DIR = os.environ.get("PHOTO_DIR", "/share/logboek/photos")
HA_API = os.environ.get("HA_API", "http://supervisor/core/api")
SUPERVISOR_API = os.environ.get("SUPERVISOR_API", "http://supervisor")
SUPERVISOR_TOKEN = os.environ.get("SUPERVISOR_TOKEN")
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

DEFAULT_OPTIONS = {
    "title": "Onderhoud boot",
    "categories": ["Motor", "Elektra", "Romp & onderwaterschip", "Tuigage & zeilen",
                   "Sanitair & water", "Veiligheid", "Overig"],
    "engine_hours_entity": "",
    "warn_days": 14,
    "warn_hours": 10,
    "photo_max_px": 2000,
    "mqtt_enabled": True,
    "mqtt_host": "",
    "mqtt_port": 1883,
    "mqtt_username": "",
    "mqtt_password": "",
}


def load_options():
    opts = dict(DEFAULT_OPTIONS)
    try:
        with open(OPTIONS_FILE, encoding="utf-8") as f:
            opts.update({k: v for k, v in json.load(f).items() if v is not None})
    except FileNotFoundError:
        log.warning("Geen %s gevonden, standaardinstellingen gebruikt", OPTIONS_FILE)
    return opts


OPT = load_options()
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(PHOTO_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "logboek.db")
BACKUP_DIR = os.environ.get("BACKUP_DIR", os.path.join(os.path.dirname(PHOTO_DIR), "backup"))
BACKUP_PATH = os.path.join(BACKUP_DIR, "logboek.db")
BACKUP_LOCK = threading.Lock()
MQTT = None  # wordt gezet in main()

# --------------------------------------------------------------------------- database

SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    naam TEXT NOT NULL,
    categorie TEXT,
    interval_dagen INTEGER,
    interval_uren REAL,
    notitie TEXT,
    actief INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY,
    datum TEXT NOT NULL,
    categorie TEXT,
    titel TEXT NOT NULL,
    omschrijving TEXT,
    motoruren REAL,
    kosten REAL,
    uitgevoerd_door TEXT,
    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    created_at TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    bestand TEXT NOT NULL,
    thumb TEXT NOT NULL,
    created_at TEXT
);
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    naam TEXT NOT NULL UNIQUE COLLATE NOCASE,
    volgorde INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_entries_datum ON entries(datum);
CREATE INDEX IF NOT EXISTS idx_entries_task ON entries(task_id);
CREATE INDEX IF NOT EXISTS idx_photos_entry ON photos(entry_id);
"""


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def backup_db():
    """Kopie van de database naar /share, zodat een nieuwe installatie hem kan overnemen."""
    with BACKUP_LOCK:
        try:
            os.makedirs(BACKUP_DIR, exist_ok=True)
            tmp = BACKUP_PATH + ".tmp"
            src = sqlite3.connect(DB_PATH, timeout=15)
            dst = sqlite3.connect(tmp)
            with dst:
                src.backup(dst)
            dst.close()
            src.close()
            os.replace(tmp, BACKUP_PATH)
        except Exception:  # noqa: BLE001
            log.exception("Back-up naar %s mislukt", BACKUP_PATH)


def import_backup_if_new():
    """Nieuwe installatie (geen database) + back-up in /share → back-up overnemen."""
    if os.path.exists(DB_PATH) or not os.path.exists(BACKUP_PATH):
        return
    src = sqlite3.connect(BACKUP_PATH)
    dst = sqlite3.connect(DB_PATH)
    with dst:
        src.backup(dst)
    dst.close()
    src.close()
    log.info("Database overgenomen uit %s", BACKUP_PATH)


def init_db():
    import_backup_if_new()
    with get_db() as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 0:
            # eerste start: vullen met de categorieën uit de instellingen + alles wat al gebruikt is
            names = list(OPT.get("categories") or [])
            for (n,) in conn.execute(
                    "SELECT categorie FROM entries WHERE categorie IS NOT NULL "
                    "UNION SELECT categorie FROM tasks WHERE categorie IS NOT NULL"):
                names.append(n)
            seen = set()
            for n in names:
                n = (n or "").strip()
                if n and n.lower() not in seen:
                    seen.add(n.lower())
                    conn.execute("INSERT INTO categories (naam, volgorde) VALUES (?, ?)", (n, len(seen)))


def category_names(conn):
    return [r["naam"] for r in conn.execute("SELECT naam FROM categories ORDER BY volgorde, id")]


def now():
    return datetime.now().isoformat(timespec="seconds")


# --------------------------------------------------------------------------- Home Assistant

def ha_headers():
    return {"Authorization": f"Bearer {SUPERVISOR_TOKEN}"}


def engine_hours():
    """Huidige motoruren uit de ingestelde HA-entiteit, of None."""
    entity = (OPT.get("engine_hours_entity") or "").strip()
    if not entity or not SUPERVISOR_TOKEN:
        return None
    try:
        r = requests.get(f"{HA_API}/states/{entity}", headers=ha_headers(), timeout=5)
        r.raise_for_status()
        return round(float(r.json()["state"]), 1)
    except Exception as e:  # noqa: BLE001
        log.debug("Motoruren niet beschikbaar: %s", e)
        return None


# --------------------------------------------------------------------------- helpers

def num(value):
    if value is None:
        return None
    s = str(value).strip().replace(",", ".")
    if s == "":
        return None
    try:
        return float(s)
    except ValueError:
        abort(400, f"Ongeldig getal: {value}")


def text(value):
    s = (value or "").strip() if isinstance(value, str) or value is None else str(value).strip()
    return s or None


def entry_from_form(form):
    titel = text(form.get("titel"))
    if not titel:
        abort(400, "Titel is verplicht")
    datum = text(form.get("datum")) or date.today().isoformat()
    try:
        date.fromisoformat(datum)
    except ValueError:
        abort(400, "Ongeldige datum")
    task_id = text(form.get("task_id"))
    return {
        "datum": datum,
        "categorie": text(form.get("categorie")),
        "titel": titel,
        "omschrijving": text(form.get("omschrijving")),
        "motoruren": num(form.get("motoruren")),
        "kosten": num(form.get("kosten")),
        "uitgevoerd_door": text(form.get("uitgevoerd_door")),
        "task_id": int(task_id) if task_id else None,
    }


def task_from_json(d):
    naam = text(d.get("naam"))
    if not naam:
        abort(400, "Naam is verplicht")
    dagen = num(d.get("interval_dagen"))
    uren = num(d.get("interval_uren"))
    return {
        "naam": naam,
        "categorie": text(d.get("categorie")),
        "interval_dagen": int(dagen) if dagen else None,
        "interval_uren": uren if uren else None,
        "notitie": text(d.get("notitie")),
        "actief": 1 if d.get("actief", True) else 0,
    }


def load_images(files):
    """Lees en valideer alle foto's vóór er iets in de database komt."""
    images = []
    for fs in files:
        if not fs or not fs.filename:
            continue
        try:
            img = Image.open(fs.stream)
            img = ImageOps.exif_transpose(img)
            images.append(img.convert("RGB"))
        except Exception as e:  # noqa: BLE001
            log.warning("Foto %s niet leesbaar: %s", fs.filename, e)
            abort(400, f"Kan foto '{fs.filename}' niet lezen. Gebruik JPEG of PNG "
                       "(op iPhone: Instellingen › Camera › Formaten › Meest compatibel).")
    return images


def save_images(conn, entry_id, images):
    max_px = int(OPT.get("photo_max_px") or 0)
    for img in images:
        name = uuid.uuid4().hex
        big = img.copy()
        if max_px > 0:
            big.thumbnail((max_px, max_px))
        big.save(os.path.join(PHOTO_DIR, f"{name}.jpg"), "JPEG", quality=85, optimize=True)
        thumb = img.copy()
        thumb.thumbnail((480, 480))
        thumb.save(os.path.join(PHOTO_DIR, f"{name}_t.jpg"), "JPEG", quality=75)
        conn.execute(
            "INSERT INTO photos (entry_id, bestand, thumb, created_at) VALUES (?,?,?,?)",
            (entry_id, f"{name}.jpg", f"{name}_t.jpg", now()),
        )


def remove_photo_files(rows):
    for p in rows:
        for fn in (p["bestand"], p["thumb"]):
            try:
                os.remove(os.path.join(PHOTO_DIR, fn))
            except FileNotFoundError:
                pass


def entries_with_photos(conn, where="", args=()):
    rows = conn.execute(
        "SELECT e.*, t.naam AS taak_naam FROM entries e "
        f"LEFT JOIN tasks t ON t.id = e.task_id {where} "
        "ORDER BY e.datum DESC, e.id DESC",
        args,
    ).fetchall()
    ids = [r["id"] for r in rows]
    photos = {}
    if ids:
        q = f"SELECT * FROM photos WHERE entry_id IN ({','.join('?' * len(ids))}) ORDER BY id"
        for p in conn.execute(q, ids):
            photos.setdefault(p["entry_id"], []).append(
                {"id": p["id"], "bestand": p["bestand"], "thumb": p["thumb"]})
    return [dict(r, fotos=photos.get(r["id"], [])) for r in rows]


def task_status(conn, t, hours_now, today):
    s = dict(t)
    last = conn.execute(
        "SELECT datum, motoruren FROM entries WHERE task_id = ? ORDER BY datum DESC, id DESC LIMIT 1",
        (t["id"],),
    ).fetchone()
    last_hours = conn.execute(
        "SELECT motoruren FROM entries WHERE task_id = ? AND motoruren IS NOT NULL "
        "ORDER BY datum DESC, id DESC LIMIT 1",
        (t["id"],),
    ).fetchone()
    s.update(laatst_datum=last["datum"] if last else None,
             laatst_uren=last_hours["motoruren"] if last_hours else None,
             volgende_datum=None, dagen_rest=None, volgende_uren=None, uren_rest=None,
             motoruren_nu=hours_now)

    if t["interval_dagen"] and last:
        volgende = date.fromisoformat(last["datum"]) + timedelta(days=t["interval_dagen"])
        s["volgende_datum"] = volgende.isoformat()
        s["dagen_rest"] = (volgende - today).days
    if t["interval_uren"] and last_hours:
        s["volgende_uren"] = round(last_hours["motoruren"] + t["interval_uren"], 1)
        if hours_now is not None:
            s["uren_rest"] = round(s["volgende_uren"] - hours_now, 1)

    late = (s["dagen_rest"] is not None and s["dagen_rest"] < 0) or \
           (s["uren_rest"] is not None and s["uren_rest"] < 0)
    soon = (s["dagen_rest"] is not None and s["dagen_rest"] <= int(OPT["warn_days"])) or \
           (s["uren_rest"] is not None and s["uren_rest"] <= float(OPT["warn_hours"]))
    if not t["actief"]:
        status = "inactief"
    elif late:
        status = "achterstallig"
    elif soon:
        status = "binnenkort"
    elif s["dagen_rest"] is None and s["uren_rest"] is None:
        status = "onbekend"
    else:
        status = "ok"
    s["status"] = status
    s["achterstallig"] = status == "achterstallig"
    return s


def all_task_status(conn, hours_now):
    today = date.today()
    tasks = conn.execute("SELECT * FROM tasks ORDER BY naam COLLATE NOCASE").fetchall()
    return [task_status(conn, t, hours_now, today) for t in tasks]


def changed():
    threading.Thread(target=backup_db, daemon=True).start()
    if MQTT:
        threading.Thread(target=MQTT.publish_all, daemon=True).start()


# --------------------------------------------------------------------------- web app

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024


@app.errorhandler(400)
@app.errorhandler(404)
@app.errorhandler(413)
def json_error(e):
    return jsonify(error=getattr(e, "description", str(e))), e.code


@app.get("/")
def index():
    resp = send_from_directory(STATIC_DIR, "index.html")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.get("/photos/<path:name>")
def photo(name):
    return send_from_directory(PHOTO_DIR, name, max_age=31536000)


@app.get("/api/config")
def api_config():
    with get_db() as conn:
        cats = category_names(conn)
    return jsonify(
        title=OPT["title"],
        categories=cats,
        motoruren=engine_hours(),
        engine_entity=text(OPT.get("engine_hours_entity")),
        mqtt=bool(MQTT and MQTT.connected),
        version=VERSION,
    )


@app.get("/api/entries")
def api_entries():
    clauses, args = [], []
    q = text(request.args.get("q"))
    if q:
        clauses.append("(e.titel LIKE ? OR e.omschrijving LIKE ? OR e.uitgevoerd_door LIKE ? OR t.naam LIKE ?)")
        args += [f"%{q}%"] * 4
    cat = text(request.args.get("categorie"))
    if cat:
        clauses.append("e.categorie = ?")
        args.append(cat)
    task = text(request.args.get("task_id"))
    if task:
        clauses.append("e.task_id = ?")
        args.append(int(task))
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    with get_db() as conn:
        return jsonify(entries_with_photos(conn, where, args))


@app.post("/api/entries")
def api_entry_create():
    data = entry_from_form(request.form)
    images = load_images(request.files.getlist("fotos"))
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO entries (datum, categorie, titel, omschrijving, motoruren, kosten, "
            "uitgevoerd_door, task_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (data["datum"], data["categorie"], data["titel"], data["omschrijving"], data["motoruren"],
             data["kosten"], data["uitgevoerd_door"], data["task_id"], now(), now()),
        )
        eid = cur.lastrowid
        save_images(conn, eid, images)
        result = entries_with_photos(conn, "WHERE e.id = ?", (eid,))[0]
    changed()
    return jsonify(result), 201


@app.put("/api/entries/<int:eid>")
def api_entry_update(eid):
    data = entry_from_form(request.form)
    images = load_images(request.files.getlist("fotos"))
    with get_db() as conn:
        cur = conn.execute(
            "UPDATE entries SET datum=?, categorie=?, titel=?, omschrijving=?, motoruren=?, kosten=?, "
            "uitgevoerd_door=?, task_id=?, updated_at=? WHERE id=?",
            (data["datum"], data["categorie"], data["titel"], data["omschrijving"], data["motoruren"],
             data["kosten"], data["uitgevoerd_door"], data["task_id"], now(), eid),
        )
        if cur.rowcount == 0:
            abort(404, "Logregel niet gevonden")
        save_images(conn, eid, images)
        result = entries_with_photos(conn, "WHERE e.id = ?", (eid,))[0]
    changed()
    return jsonify(result)


@app.delete("/api/entries/<int:eid>")
def api_entry_delete(eid):
    with get_db() as conn:
        photos = conn.execute("SELECT * FROM photos WHERE entry_id = ?", (eid,)).fetchall()
        if conn.execute("DELETE FROM entries WHERE id = ?", (eid,)).rowcount == 0:
            abort(404, "Logregel niet gevonden")
    remove_photo_files(photos)
    changed()
    return jsonify(ok=True)


@app.delete("/api/photos/<int:pid>")
def api_photo_delete(pid):
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM photos WHERE id = ?", (pid,)).fetchall()
        if not rows:
            abort(404, "Foto niet gevonden")
        conn.execute("DELETE FROM photos WHERE id = ?", (pid,))
    remove_photo_files(rows)
    changed()
    return jsonify(ok=True)


@app.get("/api/tasks")
def api_tasks():
    with get_db() as conn:
        return jsonify(all_task_status(conn, engine_hours()))


@app.post("/api/tasks")
def api_task_create():
    d = task_from_json(request.get_json(force=True) or {})
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO tasks (naam, categorie, interval_dagen, interval_uren, notitie, actief) "
            "VALUES (?,?,?,?,?,?)",
            (d["naam"], d["categorie"], d["interval_dagen"], d["interval_uren"], d["notitie"], d["actief"]),
        )
        tid = cur.lastrowid
    changed()
    return jsonify(id=tid), 201


@app.put("/api/tasks/<int:tid>")
def api_task_update(tid):
    d = task_from_json(request.get_json(force=True) or {})
    with get_db() as conn:
        cur = conn.execute(
            "UPDATE tasks SET naam=?, categorie=?, interval_dagen=?, interval_uren=?, notitie=?, actief=? "
            "WHERE id=?",
            (d["naam"], d["categorie"], d["interval_dagen"], d["interval_uren"], d["notitie"],
             d["actief"], tid),
        )
        if cur.rowcount == 0:
            abort(404, "Taak niet gevonden")
    changed()
    return jsonify(ok=True)


@app.delete("/api/tasks/<int:tid>")
def api_task_delete(tid):
    with get_db() as conn:
        if conn.execute("DELETE FROM tasks WHERE id = ?", (tid,)).rowcount == 0:
            abort(404, "Taak niet gevonden")
    if MQTT:
        MQTT.remove_task(tid)
    changed()
    return jsonify(ok=True)


@app.get("/api/categories")
def api_categories():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT c.id, c.naam, c.volgorde, "
            "(SELECT COUNT(*) FROM entries e WHERE e.categorie = c.naam) AS logregels, "
            "(SELECT COUNT(*) FROM tasks t WHERE t.categorie = c.naam) AS taken "
            "FROM categories c ORDER BY c.volgorde, c.id").fetchall()
    return jsonify([dict(r) for r in rows])


def category_name_from_json():
    naam = text((request.get_json(force=True) or {}).get("naam"))
    if not naam:
        abort(400, "Naam is verplicht")
    if len(naam) > 60:
        abort(400, "Naam is te lang (max. 60 tekens)")
    return naam


@app.post("/api/categories")
def api_category_create():
    naam = category_name_from_json()
    with get_db() as conn:
        if conn.execute("SELECT 1 FROM categories WHERE naam = ?", (naam,)).fetchone():
            abort(400, f"Categorie '{naam}' bestaat al")
        nxt = conn.execute("SELECT COALESCE(MAX(volgorde), 0) + 1 FROM categories").fetchone()[0]
        cid = conn.execute("INSERT INTO categories (naam, volgorde) VALUES (?, ?)", (naam, nxt)).lastrowid
    changed()
    return jsonify(id=cid), 201


@app.put("/api/categories/<int:cid>")
def api_category_rename(cid):
    naam = category_name_from_json()
    with get_db() as conn:
        row = conn.execute("SELECT naam FROM categories WHERE id = ?", (cid,)).fetchone()
        if not row:
            abort(404, "Categorie niet gevonden")
        if conn.execute("SELECT 1 FROM categories WHERE naam = ? AND id != ?", (naam, cid)).fetchone():
            abort(400, f"Categorie '{naam}' bestaat al")
        old = row["naam"]
        conn.execute("UPDATE categories SET naam = ? WHERE id = ?", (naam, cid))
        # bestaande logregels en taken meenemen
        conn.execute("UPDATE entries SET categorie = ? WHERE categorie = ?", (naam, old))
        conn.execute("UPDATE tasks SET categorie = ? WHERE categorie = ?", (naam, old))
    changed()
    return jsonify(ok=True)


@app.put("/api/categories/order")
def api_category_order():
    ids = (request.get_json(force=True) or {}).get("ids") or []
    with get_db() as conn:
        for i, cid in enumerate(ids, start=1):
            conn.execute("UPDATE categories SET volgorde = ? WHERE id = ?", (i, int(cid)))
    changed()
    return jsonify(ok=True)


@app.delete("/api/categories/<int:cid>")
def api_category_delete(cid):
    with get_db() as conn:
        row = conn.execute("SELECT naam FROM categories WHERE id = ?", (cid,)).fetchone()
        if not row:
            abort(404, "Categorie niet gevonden")
        conn.execute("DELETE FROM categories WHERE id = ?", (cid,))
        conn.execute("UPDATE entries SET categorie = NULL WHERE categorie = ?", (row["naam"],))
        conn.execute("UPDATE tasks SET categorie = NULL WHERE categorie = ?", (row["naam"],))
    changed()
    return jsonify(ok=True)


@app.get("/api/export.csv")
def api_export():
    with get_db() as conn:
        rows = entries_with_photos(conn)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Datum", "Categorie", "Titel", "Taak", "Omschrijving", "Motoruren", "Kosten",
                "Uitgevoerd door", "Foto's"])
    for r in rows:
        w.writerow([
            r["datum"], r["categorie"] or "", r["titel"], r["taak_naam"] or "", r["omschrijving"] or "",
            "" if r["motoruren"] is None else str(r["motoruren"]).replace(".", ","),
            "" if r["kosten"] is None else f"{r['kosten']:.2f}".replace(".", ","),
            r["uitgevoerd_door"] or "", ", ".join(p["bestand"] for p in r["fotos"]),
        ])
    return Response(
        "\ufeff" + buf.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=logboek-{date.today().isoformat()}.csv"},
    )


# --------------------------------------------------------------------------- MQTT

def mqtt_config():
    if text(OPT.get("mqtt_host")):
        return {"host": OPT["mqtt_host"], "port": OPT.get("mqtt_port") or 1883,
                "username": text(OPT.get("mqtt_username")), "password": text(OPT.get("mqtt_password"))}
    if SUPERVISOR_TOKEN:
        try:
            r = requests.get(f"{SUPERVISOR_API}/services/mqtt", headers=ha_headers(), timeout=5)
            if r.ok:
                d = r.json()["data"]
                return {"host": d["host"], "port": d["port"],
                        "username": d.get("username"), "password": d.get("password")}
            log.warning("Geen MQTT-service gevonden via Supervisor (%s)", r.status_code)
        except Exception as e:  # noqa: BLE001
            log.warning("MQTT-service opvragen mislukt: %s", e)
    return None


class MqttBridge:
    PREFIX = "homeassistant"
    BASE = "logboek"

    def __init__(self, cfg):
        import paho.mqtt.client as mqtt

        self.connected = False
        self.known = set()
        self.lock = threading.Lock()
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,
                                  client_id=f"logboek-addon-{uuid.uuid4().hex[:6]}")
        if cfg.get("username"):
            self.client.username_pw_set(cfg["username"], cfg.get("password"))
        self.client.will_set(f"{self.BASE}/status", "offline", retain=True)
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        self.client.reconnect_delay_set(min_delay=2, max_delay=60)
        self.client.connect_async(cfg["host"], int(cfg["port"]))
        self.client.loop_start()
        log.info("MQTT: verbinden met %s:%s", cfg["host"], cfg["port"])

    # -- callbacks
    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code.is_failure:
            log.error("MQTT-verbinding geweigerd: %s", reason_code)
            return
        log.info("MQTT verbonden")
        self.connected = True
        client.publish(f"{self.BASE}/status", "online", retain=True)
        client.subscribe(f"{self.PREFIX}/status")
        threading.Thread(target=self.publish_all, daemon=True).start()

    def _on_disconnect(self, client, userdata, flags, reason_code, properties):
        self.connected = False
        log.warning("MQTT verbroken: %s", reason_code)

    def _on_message(self, client, userdata, msg):
        if msg.topic == f"{self.PREFIX}/status" and msg.payload == b"online":
            threading.Thread(target=self.publish_all, daemon=True).start()

    # -- discovery
    def _device(self):
        return {"identifiers": ["logboek_addon"], "name": OPT["title"],
                "manufacturer": "Logboek add-on", "model": "Onderhoudslogboek", "sw_version": VERSION}

    def _config(self, component, object_id, payload):
        topic = f"{self.PREFIX}/{component}/logboek/{object_id}/config"
        self.client.publish(topic, json.dumps(payload) if payload else "", retain=True)

    def _publish_task(self, s):
        tid = s["id"]
        st = f"{self.BASE}/taak/{tid}"
        base = {"state_topic": st, "device": self._device(),
                "availability_topic": f"{self.BASE}/status"}
        self._config("sensor", f"taak{tid}_status", {
            **base, "name": f"{s['naam']} status", "unique_id": f"logboek_taak{tid}_status",
            "value_template": "{{ value_json.status }}", "json_attributes_topic": st,
            "icon": "mdi:wrench-clock"})
        self._config("binary_sensor", f"taak{tid}_achterstallig", {
            **base, "name": f"{s['naam']} achterstallig", "unique_id": f"logboek_taak{tid}_achterstallig",
            "device_class": "problem",
            "value_template": "{{ 'ON' if value_json.achterstallig else 'OFF' }}"})
        self._config("sensor", f"taak{tid}_dagen", {
            **base, "name": f"{s['naam']} dagen resterend", "unique_id": f"logboek_taak{tid}_dagen",
            "unit_of_measurement": "d", "icon": "mdi:calendar-clock",
            "value_template": "{{ value_json.dagen_rest }}"} if s["interval_dagen"] else None)
        self._config("sensor", f"taak{tid}_uren", {
            **base, "name": f"{s['naam']} uren resterend", "unique_id": f"logboek_taak{tid}_uren",
            "unit_of_measurement": "h", "icon": "mdi:engine",
            "value_template": "{{ value_json.uren_rest }}"} if s["interval_uren"] else None)
        state = {k: s[k] for k in ("naam", "categorie", "status", "achterstallig", "laatst_datum",
                                   "laatst_uren", "volgende_datum", "dagen_rest", "volgende_uren",
                                   "uren_rest", "interval_dagen", "interval_uren")}
        self.client.publish(st, json.dumps(state), retain=True)

    def remove_task(self, tid):
        for comp, obj in (("sensor", "status"), ("binary_sensor", "achterstallig"),
                          ("sensor", "dagen"), ("sensor", "uren")):
            self._config(comp, f"taak{tid}_{obj}", None)
        self.client.publish(f"{self.BASE}/taak/{tid}", "", retain=True)
        self.known.discard(tid)

    def publish_all(self):
        if not self.connected:
            return
        try:
            with self.lock:
                with get_db() as conn:
                    statuses = all_task_status(conn, engine_hours())
                    last = conn.execute(
                        "SELECT datum, titel FROM entries ORDER BY datum DESC, id DESC LIMIT 1").fetchone()
                active = [s for s in statuses if s["actief"]]
                for s in active:
                    self._publish_task(s)
                ids = {s["id"] for s in active}
                for tid in self.known - ids:
                    self.remove_task(tid)
                # inactieve taken die na een herstart nog in HA staan ook opruimen
                for s in statuses:
                    if not s["actief"] and s["id"] not in self.known:
                        self.remove_task(s["id"])
                self.known = ids
                self._publish_overview(active, last)
        except Exception:  # noqa: BLE001
            log.exception("MQTT publiceren mislukt")

    def _publish_overview(self, active, last):
        st = f"{self.BASE}/overzicht"
        base = {"state_topic": st, "device": self._device(), "availability_topic": f"{self.BASE}/status"}
        self._config("sensor", "achterstallig", {
            **base, "name": "Achterstallige taken", "unique_id": "logboek_achterstallig",
            "icon": "mdi:alert-circle-outline", "value_template": "{{ value_json.achterstallig }}",
            "json_attributes_topic": st, "json_attributes_template": "{{ value_json.details | tojson }}"})
        self._config("sensor", "binnenkort", {
            **base, "name": "Taken binnenkort", "unique_id": "logboek_binnenkort",
            "icon": "mdi:clock-alert-outline", "value_template": "{{ value_json.binnenkort }}"})
        self._config("sensor", "laatste", {
            **base, "name": "Laatste logregel", "unique_id": "logboek_laatste",
            "icon": "mdi:notebook-edit", "value_template": "{{ value_json.laatste_titel }}"})
        late = [s["naam"] for s in active if s["status"] == "achterstallig"]
        soon = [s["naam"] for s in active if s["status"] == "binnenkort"]
        self.client.publish(st, json.dumps({
            "achterstallig": len(late), "binnenkort": len(soon),
            "laatste_titel": last["titel"] if last else "None",
            "details": {"achterstallig": late, "binnenkort": soon,
                        "laatste_datum": last["datum"] if last else None},
        }), retain=True)


def start_mqtt():
    if not OPT.get("mqtt_enabled"):
        log.info("MQTT uitgeschakeld in de instellingen")
        return None
    cfg = mqtt_config()
    if not cfg:
        log.warning("Geen MQTT-broker gevonden; sensoren in HA worden niet aangemaakt")
        return None
    try:
        return MqttBridge(cfg)
    except Exception:  # noqa: BLE001
        log.exception("MQTT starten mislukt")
        return None


def periodic_refresh():
    while True:
        time.sleep(300)
        if MQTT:
            MQTT.publish_all()


if __name__ == "__main__":
    init_db()
    backup_db()
    MQTT = start_mqtt()
    threading.Thread(target=periodic_refresh, daemon=True).start()
    from waitress import serve

    port = int(os.environ.get("PORT", "8099"))
    log.info("Logboek %s draait op poort %s", VERSION, port)
    serve(app, host="0.0.0.0", port=port, threads=8, max_request_body_size=300 * 1024 * 1024)
