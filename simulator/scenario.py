import random
from dataclasses import dataclass

HOURS = 72
RESERVE = 0.30


@dataclass
class Farm:
    id: str
    name: str
    crop: str
    cap: float
    level: float
    demand: float
    pump_flow: float
    pump_kw: float
    priority: int


def make_farms():
    rows = [
        ("f1", "Ferme Ben Salah", "Élevage + eau potable", 40, 0.80, 0.9, 6, 1.5, 1),
        ("f2", "Ferme El Amri", "Tomates sous serre", 60, 0.70, 1.6, 8, 2.2, 2),
        ("f3", "Domaine Trabelsi", "Oliviers", 80, 0.65, 1.1, 10, 3.0, 3),
        ("f4", "Ferme Jlassi", "Maraîchage", 35, 0.55, 1.4, 6, 1.5, 2),
        ("f5", "Coopérative Sidi Mansour", "Grenadiers", 100, 0.75, 1.5, 12, 3.7, 3),
        ("f6", "Ferme Gharbi", "Piments", 30, 0.50, 1.3, 5, 1.1, 2),
        ("f7", "Ferme Chaabane", "Élevage + eau potable", 45, 0.85, 1.0, 6, 1.5, 1),
        ("f8", "Verger Kammoun", "Amandiers", 70, 0.60, 1.0, 9, 2.2, 3),
    ]
    return [Farm(*r) for r in rows]


def temperature(h):
    d = h % 24
    base = 31 + 11 * max(0.0, 1 - abs(d - 15) / 9)
    boost = 2.5 if h // 24 == 1 else 0
    return round(base + boost, 1)


OUTAGES = list(range(13, 17)) + list(range(36, 43)) + list(range(60, 63))
ANNOUNCED_AHEAD = 5


def grid_on(h):
    return h not in OUTAGES


def announced(h):
    return any((h + k) in OUTAGES for k in range(1, ANNOUNCED_AHEAD + 1))


def reports(h):
    rnd = random.Random(h * 7 + 3)
    base = 3 if announced(h) or not grid_on(h) else 0
    return base + rnd.randint(0, 2)


def demand_factor(h):
    d = h % 24
    t = temperature(h)
    shape = 0.35 if d < 5 else 1.4 if 5 <= d < 9 else 1.0 if d < 18 else 1.3 if d < 21 else 0.6
    return shape * (1 + max(0, t - 30) * 0.03)
