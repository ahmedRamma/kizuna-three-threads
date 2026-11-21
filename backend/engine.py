import statistics
from simulator.scenario import (HOURS, RESERVE, make_farms, temperature, grid_on,
                                announced, reports, demand_factor, OUTAGES)

BACKUP_KW = 6.0
TRANSFER_RATE = 3.0
DEMAND_SCALE = 2.8

SAFETY_H = 2
RATE_MIN, RATE_MAX = 1.1, 1.5
LEND_CAP = 6.0
DUE_H = 6
MAX_DEBT_SHARE = 0.5
MIN_RELIABILITY = 0.5
LATE_PENALTY = 0.05
LATE_RATE = 0.3
# Valeur d'1 m³ manquant selon la priorité, exprimée en m³ à rendre plus tard.
LOSS_VALUE = {1: 3.0, 2: 2.0, 3: 1.2}


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


def need(f, h):
    return f.demand * demand_factor(h) * DEMAND_SCALE


def need_over(f, start, hours):
    return sum(need(f, k) for k in range(start, start + hours))


def zone_autonomy(farms, h):
    stock = sum(f.cap * max(0.0, f.level - RESERVE) for f in farms)
    use = sum(need(f, h) for f in farms)
    return round(stock / use, 1) if use else 0.0


def outage_end(h):
    e = h
    while e < HOURS and not grid_on(e):
        e += 1
    return e


def margin_need(f, h):
    return need_over(f, h, outage_end(h) - h + SAFETY_H)


def surplus(f, h):
    return max(0.0, f.cap * f.level - margin_need(f, h))


def deficit(f, h):
    return max(0.0, need_over(f, h, outage_end(h) - h) - f.cap * f.level)


def offer_rate(f, h, risk):
    stock = f.cap * f.level
    tight = 1 - surplus(f, h) / stock if stock else 1.0
    scarcity = 0.5 * risk / 100 + 0.3 * tight + 0.2 * min(1.0, (outage_end(h) - h) / 8)
    return round(min(RATE_MAX, RATE_MIN + (RATE_MAX - RATE_MIN) * scarcity), 2)


def borrower_rate(offer, reliability):
    return round(min(RATE_MAX, offer + LATE_RATE * (1 - reliability)), 2)


def urgency(hours_to_dry):
    return "élevée" if hours_to_dry < 1 else "moyenne" if hours_to_dry < 3 else "faible"


class Market:
    def __init__(self, farms):
        self.ledger = []
        self.reliability = {f.id: 1.0 for f in farms}

    def owed(self, fid):
        return sum(d["due_m3"] - d["repaid_m3"] for d in self.ledger if d["borrower"] == fid and d["closed"] is None)

    def refusal(self, f, due):
        if self.reliability[f.id] < MIN_RELIABILITY:
            return "fiabilité trop faible"
        if self.owed(f.id) + due > MAX_DEBT_SHARE * f.cap:
            return "trop endettée"
        return None

    def book(self, farms, h, risk):
        offers, demands = [], []
        for f in farms:
            s, d = surplus(f, h), deficit(f, h)
            if s > 0.2:
                offers.append({"farm": f.id, "m3": round(min(s, LEND_CAP), 2), "rate": offer_rate(f, h, risk)})
            elif d > 0.2:
                q = min(d, TRANSFER_RATE, f.cap * (1 - f.level))
                ttd = f.cap * f.level / need(f, h)
                demands.append({"farm": f.id, "m3": round(q, 2), "hours_to_dry": round(ttd, 1),
                                "urgency": urgency(ttd), "priority": f.priority})
        offers.sort(key=lambda o: o["rate"])
        demands.sort(key=lambda d: (d["hours_to_dry"], d["priority"]))
        return offers, demands

    def match(self, farms, h, risk):
        by_id = {f.id: f for f in farms}
        offers, demands = self.book(farms, h, risk)
        left = {o["farm"]: o["m3"] for o in offers}
        trades, refused = [], []
        for d in demands:
            b, want = by_id[d["farm"]], d["m3"]
            for o in offers:
                if want <= 0.2 or left[o["farm"]] <= 0.2:
                    continue
                rate = borrower_rate(o["rate"], self.reliability[b.id])
                q = min(want, left[o["farm"]])
                if rate * q >= LOSS_VALUE[b.priority] * q:
                    continue
                why = self.refusal(b, q * rate)
                if why:
                    refused.append({"farm": b.id, "hour": h, "reason": why})
                    break
                g = by_id[o["farm"]]
                g.level -= q / g.cap
                b.level += q / b.cap
                left[g.id] -= q
                want -= q
                self.ledger.append({"id": len(self.ledger) + 1, "hour": h, "lender": g.id, "borrower": b.id,
                                    "m3": round(q, 2), "rate": rate, "due_m3": round(q * rate, 2),
                                    "repaid_m3": 0.0, "due_hour": outage_end(h) + DUE_H,
                                    "closed": None, "late": False})
                trades.append({"hour": h, "from": g.id, "to": b.id, "m3": round(q, 1), "rate": rate,
                               "due_m3": round(q * rate, 1), "debt": len(self.ledger),
                               "lender_left_m3": round(g.cap * g.level, 2),
                               "lender_margin_m3": round(margin_need(g, h), 2)})
        return offers, demands, trades, refused

    def repay(self, f, water, by_id, h):
        paid = []
        for d in self.ledger:
            if water <= 0.01:
                break
            if d["borrower"] != f.id or d["closed"] is not None:
                continue
            lender = by_id[d["lender"]]
            room = lender.cap * (1 - lender.level)
            if room <= 0.01:
                d["due_hour"] = max(d["due_hour"], h + 1)
                continue
            q = min(water, d["due_m3"] - d["repaid_m3"], room)
            lender.level += q / lender.cap
            d["repaid_m3"] = round(d["repaid_m3"] + q, 3)
            water -= q
            if d["due_m3"] - d["repaid_m3"] <= 0.01:
                d["closed"] = h
                d["late"] = d["late"] or h > d["due_hour"]
                if not d["late"]:
                    self.reliability[f.id] = min(1.0, self.reliability[f.id] + LATE_PENALTY)
            paid.append({"hour": h, "from": f.id, "to": lender.id, "m3": round(q, 1), "debt": d["id"]})
        return paid, water

    def review(self, h):
        for d in self.ledger:
            if d["closed"] is None and h > d["due_hour"]:
                d["late"] = True
                r = self.reliability
                r[d["borrower"]] = round(max(0.0, r[d["borrower"]] - LATE_PENALTY), 2)


def step(farms, h, platform, market=None):
    log = []
    dry = {}
    on = grid_on(h)
    score, label = risk_score(h)
    budget = BACKUP_KW
    by_id = {f.id: f for f in farms}
    repayments = []
    for f in sorted(farms, key=lambda f: (f.priority, f.level)):
        if platform:
            want = f.level < 0.95 and (announced(h) or label != "faible" or f.level < 0.6)
        else:
            want = f.level < RESERVE
        debt = market.owed(f.id) if market and on else 0.0
        if debt > 0.01:
            # Ferme endettée : sa réserve d'abord, puis le remboursement, puis le reste de sa cuve.
            water = f.pump_flow
            own = min(water, max(0.0, f.cap * (RESERVE - f.level)))
            f.level += own / f.cap
            paid, water = market.repay(f, water - own, by_id, h)
            repayments += paid
            rest = min(water, f.cap * (1 - f.level)) if want else 0.0
            f.level += rest / f.cap
            log.append((f.id, "pompe + remboursement", round(own + rest + sum(p["m3"] for p in paid), 1)))
        elif want and on:
            add = min(f.pump_flow, f.cap * (1 - f.level))
            f.level += add / f.cap
            if add > 0.01:
                log.append((f.id, "pompe", round(add, 1)))
        elif platform and not on and f.priority == 1 and f.level < 0.5 and budget >= f.pump_kw:
            budget -= f.pump_kw
            add = min(f.pump_flow * 0.5, f.cap * (1 - f.level))
            f.level += add / f.cap
            log.append((f.id, "secours solaire", round(add, 1)))
    offers, demands, trades, refused = [], [], [], []
    if market and not on:
        offers, demands, trades, refused = market.match(farms, h, score)
    if market:
        market.review(h)
    unmet = 0.0
    for f in farms:
        n = need(f, h)
        have = f.cap * f.level
        used = min(n, have)
        f.level = (have - used) / f.cap
        if used < n - 0.01:
            dry[f.id] = round(n - used, 2)
            unmet += n - used
    return {"dry": dry, "unmet": unmet, "trades": trades, "repayments": repayments, "offers": offers,
            "demands": demands, "refused": refused, "log": log}


def run(platform, market=True):
    farms = make_farms()
    mk = Market(farms) if platform and market else None
    out = []
    dry_hours = 0
    unmet_total = 0.0
    dry_by = {f.id: 0 for f in farms}
    unmet_by = {f.id: 0.0 for f in farms}
    trades, repayments = [], []
    for h in range(HOURS):
        score, label = risk_score(h)
        res = step(farms, h, platform, mk)
        dry_hours += len(res["dry"])
        unmet_total += res["unmet"]
        for k, v in res["dry"].items():
            dry_by[k] += 1
            unmet_by[k] += v
        trades += res["trades"]
        repayments += res["repayments"]
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
            "trades": res["trades"],
            "repayments": res["repayments"],
            "offers": res["offers"],
            "demands": res["demands"],
            "refused": res["refused"],
            "reliability": dict(mk.reliability) if mk else {},
            "log": res["log"],
        })
    return {"series": out, "dry_hours": dry_hours, "unmet_m3": round(unmet_total, 1),
            "dry_by_farm": dry_by, "unmet_by_farm": {k: round(v, 2) for k, v in unmet_by.items()},
            "trades": trades, "repayments": repayments, "ledger": mk.ledger if mk else [],
            "reliability": dict(mk.reliability) if mk else {},
            "min_autonomy": min(s["autonomy"] for s in out)}


def accounts(plat, solo):
    # Bilan par ferme : avec marché, comparé à la même plateforme sans marché.
    out = {}
    for f in make_farms():
        lent = [d for d in plat["ledger"] if d["lender"] == f.id]
        borrowed = [d for d in plat["ledger"] if d["borrower"] == f.id]
        earned = sum(d["due_m3"] - d["m3"] for d in lent)
        paid = sum(d["due_m3"] - d["m3"] for d in borrowed)
        avoided = solo["unmet_by_farm"][f.id] - plat["unmet_by_farm"][f.id]
        out[f.id] = {
            "lent_m3": round(sum(d["m3"] for d in lent), 1),
            "borrowed_m3": round(sum(d["m3"] for d in borrowed), 1),
            "premium_earned_m3": round(earned, 1),
            "premium_paid_m3": round(paid, 1),
            "owed_m3": round(sum(d["due_m3"] - d["repaid_m3"] for d in borrowed if d["closed"] is None), 1),
            "unmet_avoided_m3": round(avoided, 1),
            "dry_hours_avoided": solo["dry_by_farm"][f.id] - plat["dry_by_farm"][f.id],
            "net_gain_m3": round(avoided + earned - paid, 1),
            "reliability": plat["reliability"][f.id],
        }
    return out


def simulate():
    base = run(False)
    solo = run(True, market=False)
    plat = run(True)
    saved = base["unmet_m3"] - plat["unmet_m3"]
    traded = sum(t["m3"] for t in plat["trades"])
    impact = {
        "dry_hours_without": base["dry_hours"],
        "dry_hours_with": plat["dry_hours"],
        "dry_hours_no_market": solo["dry_hours"],
        "unmet_without": base["unmet_m3"],
        "unmet_with": plat["unmet_m3"],
        "unmet_no_market": solo["unmet_m3"],
        "saved_m3": round(saved, 1),
        "market_saved_m3": round(solo["unmet_m3"] - plat["unmet_m3"], 1),
        "trades": len(plat["trades"]),
        "traded_m3": round(traded, 1),
        "repaid_m3": round(sum(r["m3"] for r in plat["repayments"]), 1),
        "avg_rate": round(sum(t["rate"] * t["m3"] for t in plat["trades"]) / traded, 2) if traded else 0,
        "reduction_pct": round(100 * saved / base["unmet_m3"]) if base["unmet_m3"] else 0,
    }
    return {"baseline": base, "platform": plat, "impact": impact, "accounts": accounts(plat, solo),
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
                        "text": f"Coupure en cours. Autonomie de la zone : {s['autonomy']} h. Marché de l'eau ouvert."})
            prev = "cut"
        if s["grid"] and prev == "cut":
            out.append({"hour": h, "level": "faible", "channel": "WhatsApp",
                        "text": "Courant rétabli. Remboursement des dettes d'eau, puis remplissage des cuves."})
            prev = None
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
