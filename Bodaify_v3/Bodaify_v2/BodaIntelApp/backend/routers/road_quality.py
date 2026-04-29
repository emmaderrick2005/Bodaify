"""Road Quality Mapping via accelerometer data"""
import math, random
from fastapi import APIRouter
from datetime import datetime
from sys import path as syspath
import os
syspath.insert(0, os.path.dirname(os.path.dirname(__file__)))
from models.schemas import AccelReading, RoadQualityResponse, RoadQualityMap, RoadCondition

router = APIRouter()

def compute_rqi(ax, ay, az, speed_kmh) -> float:
    magnitude  = math.sqrt(ax**2 + ay**2 + az**2)
    gravity    = 9.81
    vibration  = abs(magnitude - gravity)
    speed_norm = max(1, speed_kmh) / 30
    rqi = max(0, 100 - (vibration / speed_norm) * 12)
    return round(rqi, 1)

def condition_from_rqi(rqi: float) -> RoadCondition:
    if rqi >= 80: return RoadCondition.smooth
    if rqi >= 60: return RoadCondition.moderate
    if rqi >= 35: return RoadCondition.rough
    return RoadCondition.potholed

@router.post("/analyze", response_model=RoadQualityResponse)
async def analyze_reading(reading: AccelReading):
    rqi       = compute_rqi(reading.ax, reading.ay, reading.az, reading.speed_kmh)
    vibration = round(math.sqrt(reading.ax**2 + reading.ay**2 + reading.az**2) - 9.81, 3)
    return RoadQualityResponse(
        lat=reading.lat, lon=reading.lon, rqi=rqi,
        condition=condition_from_rqi(rqi),
        vibration=abs(vibration),
        segment=f"Seg-{abs(int(reading.lat*1000)) % 999:03d}",
    )

@router.post("/batch", response_model=RoadQualityMap)
async def batch_analysis(readings: list[AccelReading]):
    segments = []
    for r in readings:
        rqi = compute_rqi(r.ax, r.ay, r.az, r.speed_kmh)
        vibration = round(math.sqrt(r.ax**2 + r.ay**2 + r.az**2) - 9.81, 3)
        segments.append(RoadQualityResponse(
            lat=r.lat, lon=r.lon, rqi=rqi,
            condition=condition_from_rqi(rqi),
            vibration=abs(vibration),
            segment=f"Seg-{abs(int(r.lat*1000)) % 999:03d}",
        ))
    return RoadQualityMap(segments=segments, timestamp=datetime.utcnow())

@router.get("/simulate")
async def simulate_road_map():
    """Generate simulated road quality map for Kampala."""
    import sys; sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from data.kampala_graph import KAMPALA_NODES
    results = []
    for name, node in KAMPALA_NODES.items():
        rqi = random.gauss(65, 20)
        rqi = max(0, min(100, rqi))
        results.append({
            "area": name, "lat": node["lat"], "lon": node["lon"],
            "rqi": round(rqi, 1), "condition": condition_from_rqi(rqi).value,
        })
    return {"segments": results, "timestamp": datetime.utcnow().isoformat()}
