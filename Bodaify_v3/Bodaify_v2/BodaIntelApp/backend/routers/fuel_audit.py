"""Fuel Audit Dashboard router"""
import random
from fastapi import APIRouter
from sys import path as syspath
import os
syspath.insert(0, os.path.dirname(os.path.dirname(__file__)))
from models.schemas import FuelEntry, FuelAuditSummary

router = APIRouter()

DEMO_RIDERS = [f"RIDER-{i:03d}" for i in range(1, 21)]

@router.post("/submit", response_model=FuelAuditSummary)
async def submit_fuel_entry(entry: FuelEntry):
    efficiency = entry.distance_km / entry.liters if entry.liters > 0 else 0
    anomalies  = []
    if efficiency < 25:
        anomalies.append("Unusually low fuel efficiency — possible leak or overload.")
    if efficiency > 60:
        anomalies.append("Exceptionally high efficiency — verify distance accuracy.")
    if entry.liters > 5 and entry.distance_km < 30:
        anomalies.append("High fuel volume for short distance — check odometer.")

    rank = random.uniform(30, 95)
    trend = "improving" if efficiency > 38 else ("worsening" if efficiency < 30 else "stable")

    return FuelAuditSummary(
        rider_id=entry.rider_id,
        total_fuel_l=entry.liters,
        total_cost_ugx=entry.cost_ugx,
        avg_efficiency_kpl=round(efficiency, 2),
        anomalies=anomalies,
        trend=trend,
        rank_percentile=round(rank, 1),
    )

@router.get("/dashboard")
async def dashboard_summary():
    """Full fleet fuel audit for dashboard."""
    riders = []
    for rid in DEMO_RIDERS:
        liters   = round(random.uniform(1.5, 6.0), 2)
        dist     = round(random.uniform(30, 180), 1)
        eff      = round(dist / liters, 2)
        cost     = int(liters * 5200)
        anomalies = random.randint(0, 2)
        riders.append({
            "rider_id":       rid,
            "liters":         liters,
            "distance_km":    dist,
            "efficiency_kpl": eff,
            "cost_ugx":       cost,
            "anomalies":      anomalies,
            "trend":          random.choice(["improving","stable","worsening"]),
            "rank":           round(random.uniform(10, 99), 1),
        })
    riders.sort(key=lambda x: x["efficiency_kpl"], reverse=True)

    total_fuel = sum(r["liters"] for r in riders)
    total_cost = sum(r["cost_ugx"] for r in riders)
    avg_eff    = round(sum(r["efficiency_kpl"] for r in riders) / len(riders), 2)

    return {
        "fleet_summary": {
            "total_riders":   len(riders),
            "total_fuel_l":   round(total_fuel, 2),
            "total_cost_ugx": total_cost,
            "avg_efficiency":  avg_eff,
            "anomaly_count":  sum(r["anomalies"] for r in riders),
        },
        "riders": riders,
    }

@router.get("/trends/{rider_id}")
async def rider_trends(rider_id: str, days: int = 30):
    """Daily fuel efficiency trend for a rider."""
    data = []
    eff  = 38.0
    for d in range(days):
        eff += random.uniform(-2, 2.5)
        eff  = max(20, min(60, eff))
        data.append({"day": d + 1, "efficiency_kpl": round(eff, 2),
                     "cost_ugx": int((random.uniform(1.5, 3.5) * 5200))})
    return {"rider_id": rider_id, "trends": data}
