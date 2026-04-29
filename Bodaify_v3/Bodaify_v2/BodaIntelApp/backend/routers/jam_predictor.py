"""
Kampala Jam Predictor — ML-style heuristic model
Predicts congestion level by area, hour, and day.
"""

import math
import random
from fastapi import APIRouter
from sys import path as syspath
import os
syspath.insert(0, os.path.dirname(os.path.dirname(__file__)))

from models.schemas import JamRequest, JamResponse
from data.kampala_graph import JAM_PROFILES, KAMPALA_NODES

router = APIRouter()

DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]

def sigmoid(x):
    return 1 / (1 + math.exp(-x))

def predict_congestion(area: str, hour: int, dow: int) -> float:
    profile = JAM_PROFILES.get(area, {
        "morning_peak": (7, 9), "evening_peak": (17, 19),
        "base_congestion": 0.40, "peak_congestion": 0.80
    })
    base  = profile["base_congestion"]
    peak  = profile["peak_congestion"]
    mp_s, mp_e = profile["morning_peak"]
    ep_s, ep_e = profile["evening_peak"]

    # Peak multiplier
    in_morning = mp_s <= hour <= mp_e
    in_evening = ep_s <= hour <= ep_e
    peak_mult  = peak / base if (in_morning or in_evening) else 1.0

    # Weekend reduction
    weekend_factor = 0.65 if dow >= 5 else 1.0

    # Late night reduction
    night_factor = 0.30 if hour < 5 or hour > 22 else 1.0

    raw = base * peak_mult * weekend_factor * night_factor
    # Add small stochastic noise ±5%
    noise = random.uniform(-0.05, 0.05)
    return min(1.0, max(0.0, raw + noise))

def congestion_label(level: float) -> str:
    if level < 0.3:  return "Low"
    if level < 0.55: return "Moderate"
    if level < 0.80: return "High"
    return "Gridlock"

def avg_speed(level: float) -> float:
    """Approximate average speed given congestion 0–1."""
    return max(5, 45 * (1 - level))

def predicted_clear(hour: int, level: float) -> str:
    if level < 0.3:
        return "Roads are clear now"
    extra_hours = int(level * 3)
    clear_h = (hour + extra_hours) % 24
    return f"~{clear_h:02d}:00"

def generate_hotspots(area: str, level: float):
    base_node = KAMPALA_NODES.get(area, {"lat": 0.33, "lon": 32.58})
    spots = []
    for i in range(3):
        offset_lat = random.uniform(-0.008, 0.008)
        offset_lon = random.uniform(-0.008, 0.008)
        severity   = max(0.1, level + random.uniform(-0.15, 0.15))
        spots.append({
            "lat":      round(base_node["lat"] + offset_lat, 6),
            "lon":      round(base_node["lon"] + offset_lon, 6),
            "severity": round(severity, 2),
            "label":    f"Hotspot {i+1}",
        })
    return spots

@router.post("/predict", response_model=JamResponse)
async def predict_jam(req: JamRequest):
    level = predict_congestion(req.area, req.hour_of_day, req.day_of_week)
    return JamResponse(
        area=req.area,
        congestion_level=round(level, 3),
        label=congestion_label(level),
        avg_speed_kmh=round(avg_speed(level), 1),
        predicted_clear=predicted_clear(req.hour_of_day, level),
        hotspots=generate_hotspots(req.area, level),
    )

@router.get("/heatmap")
async def jam_heatmap(hour: int = 8, dow: int = 0):
    """Full-city congestion heatmap for given hour + day."""
    heatmap = []
    for area, node in KAMPALA_NODES.items():
        level = predict_congestion(area, hour, dow)
        heatmap.append({
            "area":      area,
            "lat":       node["lat"],
            "lon":       node["lon"],
            "level":     round(level, 3),
            "label":     congestion_label(level),
            "speed_kmh": round(avg_speed(level), 1),
        })
    return {"hour": hour, "dow": DAY_NAMES[dow], "heatmap": heatmap}

@router.get("/areas")
async def list_areas():
    return {"areas": list(KAMPALA_NODES.keys())}

@router.get("/weekly/{area}")
async def weekly_forecast(area: str):
    """Hour-by-hour congestion forecast for the full week."""
    forecast = []
    for dow in range(7):
        for hour in range(24):
            level = predict_congestion(area, hour, dow)
            forecast.append({
                "day":   DAY_NAMES[dow],
                "hour":  hour,
                "level": round(level, 3),
            })
    return {"area": area, "forecast": forecast}
