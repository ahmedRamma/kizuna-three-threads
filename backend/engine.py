import copy
import statistics
from simulator.scenario import (HOURS, RESERVE, make_farms, temperature, grid_on,
                                announced, reports, demand_factor, OUTAGES)

BACKUP_KW = 6.0
TRANSFER_RATE = 3.0
DEMAND_SCALE = 2.8


def risk_score(h):
    t = temperature(h)
    score = max(0, (t - 30)) * 2.2
    if announced(h):
        score += 40
    if not grid_on(h):
        score += 30
    score += reports(h) * 4
    if 18 <= h % 24 <= 22 or 12 <= h % 24 <= 15:
        score += 8
    score = min(100, round(score))
    label = "élevé" if score >= 60 else "moyen" if score >= 30 else "faible"
    return score, label


def zone_autonomy(farms, h):
    stock = sum(f.cap * max(0.0, f.level - RESERVE) for f in farms)
    use = sum(f.demand * demand_factor(h) * DEMAND_SCALE for f in farms)
    return round(stock / use, 1) if use else 0.0


def step(farms, h, platform):
    log = []
    dry = {}
    on = grid_on(h)
    score, label = risk_score(h)
    budget = BACKUP_KW
    order = sorted(farms, key=lambda f: (f.priority, f.level))
    for f in order:
        want = False
        if platform:
            want = f.level < 0.95 and (announced(h) or label != "faible" or f.level < 0.6)
        else:
            want = f.level < RESERVE
        if want and on:
            add = min(f.pump_flow, f.cap * (1 - f.level))
            f.level += add / f.cap
            if add > 0.01:
                log.append((f.id, "pompe", round(add, 1)))
        elif platform and not on and f.priority == 1 and f.level < 0.5 and budget >= f.pump_kw:
            budget -= f.pump_kw
            add = min(f.pump_flow * 0.5, f.cap * (1 - f.level))
            f.level += add / f.cap
            log.append((f.id, "secours solaire", round(add, 1)))
    transfers = []
    if platform and not on:
        givers = sorted([f for f in farms if f.level > 0.55], key=lambda f: -f.level)
        takers = sorted([f for f in farms if f.level < RESERVE + 0.05], key=lambda f: (f.priority, f.level))
        for t in takers:
            for g in givers:
                if g.id == t.id or g.level <= 0.5:
                    continue
                q = min(TRANSFER_RATE, g.cap * (g.level - 0.5), t.cap * (1 - t.level))
                if q > 0.2:
                    g.level -= q / g.cap
                    t.level += q / t.cap
                    transfers.append({"from": g.id, "to": t.id, "m3": round(q, 1), "hour": h})
                    break
    unmet = 0.0
    for f in farms:
        need = f.demand * demand_factor(h) * DEMAND_SCALE
        have = f.cap * f.level
        used = min(need, have)
        f.level = (have - used) / f.cap
        if used < need - 0.01:
            dry[f.id] = round(need - used, 2)
            unmet += need - used
    return {"dry": dry, "unmet": unmet, "transfers": transfers, "log": log}


def run(platform):
    farms = make_farms()
    out = []
    dry_hours = 0
    unmet_total = 0.0
    transfers_all = []
    for h in range(HOURS):
        score, label = risk_score(h)
        res = step(farms, h, platform)
        dry_hours += len(res["dry"])
        unmet_total += res["unmet"]
        transfers_all += res["transfers"]
        out.append({
            "hour": h,
            "temp": temperature(h),
            "grid": grid_on(h),
            "risk": score,
            "risk_label": label,
            "autonomy": zone_autonomy(farms, h),
            "stock_pct": round(100 * sum(f.cap * f.level for f in farms) / sum(f.cap for f in farms), 1),
            "levels": {f.id: round(f.level * 100) for f in farms},
            "dry": res["dry"],
            "transfers": res["transfers"],
            "log": res["log"],
        })
    return {"series": out, "dry_hours": dry_hours, "unmet_m3": round(unmet_total, 1),
            "transfers": transfers_all, "min_autonomy": min(s["autonomy"] for s in out)}


def simulate():
    base = run(False)
    plat = run(True)
    saved = base["unmet_m3"] - plat["unmet_m3"]
    impact = {
        "dry_hours_without": base["dry_hours"],
        "dry_hours_with": plat["dry_hours"],
        "unmet_without": base["unmet_m3"],
        "unmet_with": plat["unmet_m3"],
        "saved_m3": round(saved, 1),
        "transfers": len(plat["transfers"]),
        "transferred_m3": round(sum(t["m3"] for t in plat["transfers"]), 1),
        "reduction_pct": round(100 * saved / base["unmet_m3"]) if base["unmet_m3"] else 0,
    }
    return {"baseline": base, "platform": plat, "impact": impact,
            "outages": OUTAGES, "farms": [vars(f) for f in make_farms()]}


def alerts(plat_series):
    out = []
    prev = None
    for s in plat_series:
        h = s["hour"]
        if announced(h) and prev != "ann":
            out.append({"hour": h, "level": "moyen", "channel": "WhatsApp",
                        "text": "Coupure probable dans quelques heures. Remplir les cuves maintenant, réserve minimale 30 %."})
            prev = "ann"
        if not s["grid"] and prev != "cut":
            out.append({"hour": h, "level": "élevé", "channel": "SMS",
                        "text": f"Coupure en cours. Autonomie de la zone : {s['autonomy']} h. Entraide activée."})
            prev = "cut"
        if s["grid"] and prev == "cut":
            out.append({"hour": h, "level": "faible", "channel": "WhatsApp",
                        "text": "Courant rétabli. Remplissage progressif des cuves."})
            prev = None
        for fid, v in s["levels"].items():
            if v <= 20 and s["hour"] % 24 == 0:
                pass
    return out


MONTHS = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"]


def monthly_data():
    elec = [310, 295, 320, 335, 380, 450, 520, 760, 540, 400, 340, 320]
    water = [210, 200, 230, 260, 340, 430, 520, 560, 880, 400, 270, 220]
    night = [4, 4, 5, 5, 6, 6, 7, 7, 31, 7, 5, 4]
    return {"months": MONTHS, "electricity_kwh": elec, "water_m3": water, "night_flow_pct": night}


def detect_anomalies(data):
    found = []
    for key, label, unit in (("electricity_kwh", "Électricité", "kWh"), ("water_m3", "Eau", "m³")):
        vals = data[key]
        for i, v in enumerate(vals):
            near = [vals[j] for j in (i - 1, i + 1) if 0 <= j < 12]
            ref = statistics.mean(near)
            ratio = v / ref if ref else 1
            if ratio > 1.3:
                kind = "Saut de consommation électrique" if key == "electricity_kwh" else "Consommation d'eau anormale"
                found.append({"month": data["months"][i], "index": i, "metric": label, "value": v,
                              "unit": unit, "ratio": round(ratio, 2), "type": kind,
                              "cause": "Pompe active hors coupure ou moteur en surcharge" if key == "electricity_kwh"
                              else "Fuite probable : débit nocturne élevé"})
    for i, n in enumerate(data["night_flow_pct"]):
        if n > 15:
            found.append({"month": data["months"][i], "index": i, "metric": "Débit nocturne", "value": n,
                          "unit": "%", "ratio": round(n / 6, 2), "type": "Fuite de nuit",
                          "cause": "Part de l'eau consommée entre 0 h et 5 h trop élevée"})
    return found


TIPS = [
    {"icon": "sun", "title": "Pomper en milieu de journée solaire", "text": "Remplir les cuves quand le soleil produit, éviter 18 h à 22 h."},
    {"icon": "tank", "title": "Garder 30 % de réserve", "text": "Cette réserve protège l'eau potable et le bétail pendant une coupure."},
    {"icon": "drop", "title": "Réparer les fuites de nuit", "text": "Un débit nocturne élevé fait perdre de l'eau et vide la batterie virtuelle."},
    {"icon": "bolt", "title": "Réduire les démarrages de pompe", "text": "Moins de cycles courts, moins d'usure et moins de pics électriques."},
    {"icon": "leaf", "title": "Arroser tôt le matin", "text": "Moins d'évaporation, plus d'autonomie pour la zone."},
]


def analysis():
    d = monthly_data()
    anomalies = detect_anomalies(d)
    wasted_kwh = sum(a["value"] - 400 for a in anomalies if a["metric"] == "Électricité")
    wasted_m3 = sum(a["value"] - 450 for a in anomalies if a["metric"] == "Eau")
    return {"data": d, "anomalies": anomalies, "tips": TIPS,
            "potential": {"kwh": max(0, wasted_kwh), "m3": max(0, wasted_m3)}}


STATE = {"readings": []}


def ingest(reading):
    STATE["readings"].append(reading)
    STATE["readings"] = STATE["readings"][-200:]
    return {"ok": True, "count": len(STATE["readings"])}
