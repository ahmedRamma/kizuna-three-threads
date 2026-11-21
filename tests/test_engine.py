from fastapi.testclient import TestClient
from backend.main import app
from backend import engine
from simulator.scenario import HOURS, OUTAGES, grid_on, make_farms

client = TestClient(app)
SIM = engine.simulate()
PLAT = SIM["platform"]


def test_platform_beats_baseline():
    i = SIM["impact"]
    assert i["unmet_with"] < i["unmet_without"]
    assert i["dry_hours_with"] <= i["dry_hours_without"]
    assert i["trades"] > 0


def test_market_beats_platform_alone():
    assert SIM["impact"]["unmet_with"] < SIM["impact"]["unmet_no_market"]


def test_levels_stay_valid():
    for s in PLAT["series"]:
        assert all(0 <= v <= 100 for v in s["levels"].values())


def test_no_transfer_without_debt():
    ledger = {d["id"]: d for d in PLAT["ledger"]}
    assert len(PLAT["trades"]) == len(ledger)
    for t in PLAT["trades"]:
        d = ledger[t["debt"]]
        assert (d["lender"], d["borrower"]) == (t["from"], t["to"])
        assert engine.RATE_MIN <= d["rate"] <= engine.RATE_MAX
        assert d["due_m3"] >= d["m3"] * engine.RATE_MIN - 0.01


def test_lender_keeps_safety_margin():
    for t in PLAT["trades"]:
        assert t["lender_left_m3"] >= t["lender_margin_m3"] - 1e-6


def test_debts_repaid_after_outage():
    assert all(grid_on(r["hour"]) for r in PLAT["repayments"])
    last_cut = max(h for h in OUTAGES if h - 1 not in OUTAGES)
    for d in PLAT["ledger"]:
        if d["hour"] < last_cut:
            assert d["closed"] is not None and d["closed"] > d["hour"]
            assert abs(d["repaid_m3"] - d["due_m3"]) <= 0.01


def test_both_sides_gain():
    for a in SIM["accounts"].values():
        if a["lent_m3"] or a["borrowed_m3"]:
            assert a["net_gain_m3"] > 0


def test_borrower_only_if_worth_it():
    prio = {f.id: f.priority for f in make_farms()}
    for t in PLAT["trades"]:
        assert t["rate"] < engine.LOSS_VALUE[prio[t["to"]]]


def test_dynamic_rate():
    f = make_farms()[4]
    f.level = 0.95
    calm, scarce = engine.offer_rate(f, 36, 10), engine.offer_rate(f, 36, 100)
    assert engine.RATE_MIN <= calm < scarce <= engine.RATE_MAX
    assert engine.borrower_rate(1.2, 0.6) > engine.borrower_rate(1.2, 1.0)


def test_unreliable_or_indebted_refused():
    farms = make_farms()
    m = engine.Market(farms)
    f6 = next(f for f in farms if f.id == "f6")
    assert m.refusal(f6, 1.0) is None
    assert m.refusal(f6, f6.cap) == "trop endettée"
    m.reliability["f6"] = 0.2
    assert m.refusal(f6, 1.0) == "fiabilité trop faible"


def test_late_repayment_lowers_reliability():
    farms = make_farms()
    m = engine.Market(farms)
    m.ledger.append({"id": 1, "hour": 13, "lender": "f3", "borrower": "f6", "m3": 3, "rate": 1.3,
                     "due_m3": 3.9, "repaid_m3": 0.0, "due_hour": 20, "closed": None, "late": False})
    m.review(21)
    assert m.reliability["f6"] < 1.0 and m.ledger[0]["late"]


def test_no_money():
    text = str(SIM).lower()
    assert "dinar" not in text and "prix" not in text and "tnd" not in text


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
    assert len(PLAT["series"]) == HOURS
