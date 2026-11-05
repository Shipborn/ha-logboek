#!/usr/bin/env python3
"""Nep-Google voor het lokaal testen van de Google-agendakoppeling (alleen wat de app gebruikt).

Start: python tools/nep_google.py   (poort 8124)
App starten met:
  GOOGLE_API=http://127.0.0.1:8124/calendar/v3 GOOGLE_TOKEN_URL=http://127.0.0.1:8124/token
  GOOGLE_AUTH_URL=http://127.0.0.1:8124/auth GOOGLE_REVOKE_URL=http://127.0.0.1:8124/revoke  en opties google_client_id/google_client_secret (willekeurig).
Koppelen: /auth stuurt meteen door naar http://localhost/?code=testcode&state=… (zoals Google na toestemming).
Testhulp: GET /test/events/<kal> (alles), PATCH/DELETE als "gebruiker" via de gewone API zonder If-Match.
"""
import itertools
import secrets
from urllib.parse import urlencode

from flask import Flask, abort, jsonify, redirect, request

app = Flask(__name__)
TELLER = itertools.count(1)
TOKENS = set()
KALENDERS = [{"id": "boot@example.com", "summary": "Boot", "primary": True, "backgroundColor": "#0b8043",
              "accessRole": "owner"},
             {"id": "familie#nl@group.v.calendar.google.com", "summary": "Familie", "accessRole": "writer"},
             {"id": "feestdagen", "summary": "Feestdagen", "accessRole": "reader"}]
EVENTS = {k["id"]: {} for k in KALENDERS}   # kal -> id -> event


def etag():
    return f'"{next(TELLER)}"'


def auth():
    h = request.headers.get("Authorization", "")
    if not h.startswith("Bearer ") or h[7:] not in TOKENS:
        abort(401)


@app.get("/auth")
def oauth_auth():
    assert request.args["code_challenge_method"] == "S256"
    return redirect(request.args["redirect_uri"] + "/?" + urlencode({"state": request.args["state"], "code": "testcode",
                                                                     "scope": request.args["scope"]}))


@app.post("/token")
def token():
    f = request.form
    if f.get("client_secret") != "geheim":
        return jsonify(error="invalid_client"), 401
    if f["grant_type"] == "authorization_code":
        if f["code"] != "testcode" or not f.get("code_verifier"):
            return jsonify(error="invalid_grant"), 400
        t = secrets.token_hex(8)
        TOKENS.add(t)
        return jsonify(access_token=t, refresh_token="ververs-" + secrets.token_hex(4), expires_in=3600)
    if f["grant_type"] == "refresh_token":
        if not f["refresh_token"].startswith("ververs-"):
            return jsonify(error="invalid_grant"), 400
        t = secrets.token_hex(8)
        TOKENS.add(t)
        return jsonify(access_token=t, expires_in=3600)
    return jsonify(error="unsupported_grant_type"), 400


@app.post("/revoke")
def revoke():
    return "", 200


@app.get("/calendar/v3/users/me/calendarList")
def calendar_list():
    auth()
    items = KALENDERS if request.args.get("minAccessRole") != "writer" else \
        [k for k in KALENDERS if k["accessRole"] in ("writer", "owner")]
    return jsonify(items=items)


def kal_events(kal):
    if kal not in EVENTS:
        abort(404)
    return EVENTS[kal]


def start_key(e):
    return e["start"].get("dateTime") or e["start"]["date"]


@app.get("/calendar/v3/calendars/<path:kal>/events")
def list_events(kal):
    auth()
    lo, hi = request.args["timeMin"][:10], request.args["timeMax"][:10]
    items = [e for e in kal_events(kal).values() if e["status"] != "cancelled" and lo <= start_key(e)[:10] <= hi]
    return jsonify(items=sorted(items, key=start_key))


@app.post("/calendar/v3/calendars/<path:kal>/events/import")
def import_event(kal):
    auth()
    b = request.get_json()
    evs = kal_events(kal)
    e = next((x for x in evs.values() if x["iCalUID"] == b["iCalUID"]), None)
    if e is None:
        e = {"id": "ev" + secrets.token_hex(6), "kind": "calendar#event"}
        evs[e["id"]] = e
    e.update(b, etag=etag(), status="confirmed")
    return jsonify(e)


@app.post("/calendar/v3/calendars/<path:kal>/events")
def insert_event(kal):
    """Afspraak van de 'gebruiker' (extern), bijv. met recurringEventId voor een herhaling."""
    auth()
    b = request.get_json()
    e = {"id": b.get("id") or "ev" + secrets.token_hex(6), "iCalUID": b.get("iCalUID") or secrets.token_hex(6) + "@google.com",
         "status": "confirmed", **b, "etag": etag()}
    kal_events(kal)[e["id"]] = e
    return jsonify(e)


@app.route("/calendar/v3/calendars/<path:kal>/events/<eid>", methods=["GET", "PATCH", "DELETE"])
def event(kal, eid):
    auth()
    evs = kal_events(kal)
    e = evs.get(eid)
    if e is None:
        abort(404)
    if request.method == "GET":
        return jsonify(e)
    if request.headers.get("If-Match") and request.headers["If-Match"] != e["etag"]:
        return jsonify(error={"message": "Precondition Failed"}), 412
    if request.method == "DELETE":
        if e["status"] == "cancelled":
            return jsonify(error={"message": "Resource has been deleted"}), 410
        e["status"] = "cancelled"
        e["etag"] = etag()
        return "", 204
    b = request.get_json()
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(e.get(k), dict):
            e[k] = {x: y for x, y in {**e[k], **v}.items() if y is not None}
        else:
            e[k] = v
    e["etag"] = etag()
    return jsonify(e)


@app.get("/test/events/<path:kal>")
def test_events(kal):
    return jsonify(list(kal_events(kal).values()))


if __name__ == "__main__":
    app.run(port=8124)
