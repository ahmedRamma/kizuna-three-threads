from fastapi.testclient import TestClient
from backend.main import app
from backend import engine

client = TestClient(app)


def test_platform_beats_baseline():
    sim = engine.simulate()
    assert sim["impact"]["unmet_with"] < sim["impact"]["unmet_without"]
    assert sim["impact"]["dry_hours_with"] <= sim["impact"]["dry_hours_without"]
    assert sim["impact"]["transfers"] > 0


def test_levels_stay_valid():
    for s in engine.run(True)["series"]:
        assert all(0 <= v <= 100 for v in s["levels"].values())


def test_risk_labels():
    assert engine.risk_score(14)[1] == "élevé"
    assert engine.risk_score(3)[1] == "faible"


def test_anomalies_found():
    a = engine.analysis()["anomalies"]
    types = {x["type"] for x in a}
    assert "Saut de consommation électrique" in types
    assert "Fuite de nuit" in types


def test_api():
    assert client.get("/api/simulation").status_code == 200
    assert client.get("/api/analysis").status_code == 200
    r = client.post("/api/ingest", json={"farm_id": "f1", "level_pct": 55})
    assert r.json()["ok"]
    assert client.get("/").status_code == 200
