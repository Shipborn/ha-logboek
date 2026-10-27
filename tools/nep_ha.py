# Nep-Home Assistant voor lokaal testen: /api/states, /api/config en services voor schakelaars en kleppen.
from flask import Flask, jsonify, request

app = Flask(__name__)
S = {
    "switch.er_zeewaterpomp_cooling": ["on", "Zeewaterpomp glycol", None],
    "switch.dekspoelpomp": ["on", "Dekspoelpomp", None],
    "valve.wierpot_aft": ["open", "Afsluiter wierpot aft", None],
    "sensor.uren_hoofdmotor": ["1234.5", "Uren hoofdmotor", "h"],
    "sensor.uren_generator": ["567.8", "Uren generator", "h"],
}


def st(eid):
    v = S[eid]
    return {"entity_id": eid, "state": v[0], "attributes": {"friendly_name": v[1], "unit_of_measurement": v[2]}}


@app.get("/api/states")
def states():
    return jsonify([st(e) for e in S])


@app.get("/api/states/<eid>")
def state(eid):
    return (jsonify(st(eid)), 200) if eid in S else (jsonify(message="not found"), 404)


@app.get("/api/config")
def config():
    return jsonify(time_zone="Europe/Amsterdam")


@app.post("/api/services/<domein>/<service>")
def service(domein, service):
    eid = request.get_json()["entity_id"]
    S[eid][0] = {"turn_on": "on", "turn_off": "off", "open_valve": "open", "close_valve": "closed"}[service]
    return jsonify([st(eid)])


@app.post("/test/zet/<eid>/<waarde>")
def zet(eid, waarde):
    S[eid][0] = waarde
    return jsonify(st(eid))


if __name__ == "__main__":
    app.run(port=8123)
