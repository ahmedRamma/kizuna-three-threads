import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from simulator.scenario import make_farms

DEFAULT_PATH = Path(__file__).resolve().parent.parent / "kizuna.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS farms (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, crop TEXT NOT NULL, cap REAL NOT NULL,
    level REAL NOT NULL, demand REAL NOT NULL, pump_flow REAL NOT NULL,
    pump_kw REAL NOT NULL, priority INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, farm_id TEXT NOT NULL REFERENCES farms(id),
    ts REAL NOT NULL, level_pct REAL NOT NULL, pump_on INTEGER NOT NULL DEFAULT 0,
    flow_lpm REAL NOT NULL DEFAULT 0, power_w REAL NOT NULL DEFAULT 0,
    grid_on INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_readings_farm_ts ON readings(farm_id, ts);
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, kind TEXT NOT NULL,
    level TEXT NOT NULL, channel TEXT NOT NULL, farm_id TEXT, text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS water_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('pret', 'remboursement')),
    lender TEXT NOT NULL REFERENCES farms(id), borrower TEXT NOT NULL REFERENCES farms(id),
    m3 REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS monthly_stats (
    year INTEGER NOT NULL, month INTEGER NOT NULL, electricity_kwh REAL NOT NULL DEFAULT 0,
    water_m3 REAL NOT NULL DEFAULT 0, water_night_m3 REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (year, month)
);
"""

SEED_ELEC = [310, 295, 320, 335, 380, 450, 520, 760, 540, 400, 340, 320]
SEED_WATER = [210, 200, 230, 260, 340, 430, 520, 560, 880, 400, 270, 220]
SEED_NIGHT_PCT = [4, 4, 5, 5, 6, 6, 7, 7, 31, 7, 5, 4]

_ready = set()


def path():
    return os.environ.get("KIZUNA_DB", str(DEFAULT_PATH))


def init(p=None):
    p = p or path()
    with sqlite3.connect(p) as c:
        c.executescript(SCHEMA)
        if not c.execute("SELECT COUNT(*) FROM farms").fetchone()[0]:
            seed(c)
    _ready.add(p)


def seed(c):
    c.executemany("INSERT INTO farms VALUES (?,?,?,?,?,?,?,?,?)",
                  [tuple(vars(f).values()) for f in make_farms()])
    year = datetime.now().year
    c.executemany("INSERT OR IGNORE INTO monthly_stats VALUES (?,?,?,?,?)",
                  [(year, m + 1, SEED_ELEC[m], SEED_WATER[m], SEED_WATER[m] * SEED_NIGHT_PCT[m] / 100)
                   for m in range(12)])


@contextmanager
def connect():
    p = path()
    if p not in _ready:
        init(p)
    c = sqlite3.connect(p, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    try:
        with c:
            yield c
    finally:
        c.close()


def farms():
    with connect() as c:
        return [dict(r) for r in c.execute("SELECT * FROM farms ORDER BY id")]


def add_reading(r, ts=None):
    ts = ts or time.time()
    with connect() as c:
        prev = c.execute("SELECT ts FROM readings WHERE farm_id = ? ORDER BY ts DESC LIMIT 1",
                         (r["farm_id"],)).fetchone()
        cur = c.execute(
            "INSERT INTO readings (farm_id, ts, level_pct, pump_on, flow_lpm, power_w, grid_on) VALUES (?,?,?,?,?,?,?)",
            (r["farm_id"], ts, r["level_pct"], int(r.get("pump_on", False)), r.get("flow_lpm", 0.0),
             r.get("power_w", 0.0), int(r.get("grid_on", True))))
        if prev:
            accumulate(c, ts, min(max(0.0, ts - prev["ts"]), 60.0), r)
        return cur.lastrowid


def accumulate(c, ts, dt, r):
    # Intègre puissance et débit sur l'intervalle depuis la mesure précédente (60 s max).
    d = datetime.fromtimestamp(ts)
    kwh = r.get("power_w", 0.0) * dt / 3.6e6
    m3 = r.get("flow_lpm", 0.0) * dt / 60 / 1000
    night = m3 if d.hour < 5 else 0.0
    c.execute("INSERT OR IGNORE INTO monthly_stats (year, month) VALUES (?, ?)", (d.year, d.month))
    c.execute("UPDATE monthly_stats SET electricity_kwh = electricity_kwh + ?, water_m3 = water_m3 + ?, "
              "water_night_m3 = water_night_m3 + ? WHERE year = ? AND month = ?",
              (kwh, m3, night, d.year, d.month))


def latest_readings():
    with connect() as c:
        rows = c.execute("SELECT r.* FROM readings r JOIN (SELECT farm_id, MAX(id) AS id FROM readings "
                         "GROUP BY farm_id) last ON last.id = r.id")
        return {r["farm_id"]: dict(r) for r in rows}


def recent_readings(limit=200):
    with connect() as c:
        return [dict(r) for r in c.execute("SELECT * FROM readings ORDER BY id DESC LIMIT ?", (limit,))]


def monthly_stats(limit=12):
    with connect() as c:
        rows = c.execute("SELECT * FROM monthly_stats ORDER BY year DESC, month DESC LIMIT ?", (limit,))
        return [dict(r) for r in rows][::-1]


def add_alert(kind, level, channel, text, farm_id=None, ts=None):
    with connect() as c:
        c.execute("INSERT INTO alerts (ts, kind, level, channel, farm_id, text) VALUES (?,?,?,?,?,?)",
                  (ts or time.time(), kind, level, channel, farm_id, text))


def last_alert(kinds, farm_id=None):
    q = f"SELECT * FROM alerts WHERE kind IN ({','.join('?' * len(kinds))})"
    args = list(kinds)
    if farm_id:
        q += " AND farm_id = ?"
        args.append(farm_id)
    with connect() as c:
        r = c.execute(q + " ORDER BY id DESC LIMIT 1", args).fetchone()
        return dict(r) if r else None


def alerts(limit=30):
    with connect() as c:
        return [dict(r) for r in c.execute("SELECT * FROM alerts ORDER BY id DESC LIMIT ?", (limit,))]


def add_ledger(kind, lender, borrower, m3, ts=None):
    with connect() as c:
        c.execute("INSERT INTO water_ledger (ts, kind, lender, borrower, m3) VALUES (?,?,?,?,?)",
                  (ts or time.time(), kind, lender, borrower, round(m3, 2)))


def ledger(limit=50):
    with connect() as c:
        return [dict(r) for r in c.execute("SELECT * FROM water_ledger ORDER BY id DESC LIMIT ?", (limit,))]


def last_ledger_ts(borrower):
    with connect() as c:
        r = c.execute("SELECT MAX(ts) FROM water_ledger WHERE borrower = ?", (borrower,)).fetchone()
        return r[0] or 0.0


def debts(premium):
    # Dette = prêts reçus x (1 + prime) - remboursements déjà faits.
    with connect() as c:
        rows = c.execute(
            "SELECT lender, borrower, SUM(CASE WHEN kind = 'pret' THEN m3 * ? ELSE -m3 END) AS owed, "
            "SUM(CASE WHEN kind = 'pret' THEN m3 ELSE 0 END) AS lent "
            "FROM water_ledger GROUP BY lender, borrower HAVING owed > 0.01", (1 + premium,))
        return [dict(r) for r in rows]
