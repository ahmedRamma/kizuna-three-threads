from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from backend import engine

app = FastAPI(title="Kizuna - Batterie virtuelle d'eau")
APP_DIR = Path(__file__).resolve().parent.parent / "app"


class Reading(BaseModel):
    farm_id: str
    level_pct: float
    pump_on: bool = False
    flow_lpm: float = 0.0
    power_w: float = 0.0


@app.get("/api/simulation")
def simulation():
    sim = engine.simulate()
    sim["alerts"] = engine.alerts(sim["platform"]["series"])
    return sim


@app.get("/api/analysis")
def analysis():
    return engine.analysis()


@app.post("/api/ingest")
def ingest(r: Reading):
    return engine.ingest(r.model_dump())


@app.get("/api/readings")
def readings():
    return engine.STATE["readings"]


@app.get("/")
def index():
    return FileResponse(APP_DIR / "index.html")


app.mount("/static", StaticFiles(directory=APP_DIR), name="static")
