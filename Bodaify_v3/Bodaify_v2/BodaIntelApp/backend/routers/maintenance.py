"""Predictive Maintenance API"""
from fastapi import APIRouter
from sys import path as syspath
import os
syspath.insert(0, os.path.dirname(os.path.dirname(__file__)))
from models.schemas import BikeData, MaintenanceAlert, MaintenanceResponse

router = APIRouter()

def check_alerts(data: BikeData) -> list[MaintenanceAlert]:
    alerts = []
    km_since = data.mileage_km - data.last_service_km

    rules = [
        ("Engine Oil",     km_since > 3000,  km_since > 2500, 3000 - km_since,  35000),
        ("Brake Pads",     data.brake_wear_pct > 80, data.brake_wear_pct > 60, None, 45000),
        ("Chain",          data.chain_stretch_mm > 3.0, data.chain_stretch_mm > 2.0, None, 25000),
        ("Front Tyre",     data.tire_pressure_f < 28 or data.tire_pressure_f > 38,
                           data.tire_pressure_f < 30 or data.tire_pressure_f > 36, None, 0),
        ("Rear Tyre",      data.tire_pressure_r < 28 or data.tire_pressure_r > 42,
                           data.tire_pressure_r < 30 or data.tire_pressure_r > 40, None, 0),
        ("Engine Oil Level", data.oil_level_pct < 20, data.oil_level_pct < 40, None, 15000),
        ("Vibration/Bearings", data.avg_vibration > 3.5, data.avg_vibration > 2.5, None, 120000),
    ]

    for component, critical, warning, due_km, cost in rules:
        if critical:
            alerts.append(MaintenanceAlert(
                component=component, urgency="critical",
                message=f"{component} requires immediate attention.",
                due_km=round(due_km, 0) if due_km else None,
                cost_est_ugx=cost if cost else None,
            ))
        elif warning:
            alerts.append(MaintenanceAlert(
                component=component, urgency="warning",
                message=f"{component} approaching service threshold.",
                due_km=round(due_km, 0) if due_km else None,
                cost_est_ugx=int(cost * 0.6) if cost else None,
            ))
        else:
            alerts.append(MaintenanceAlert(
                component=component, urgency="ok",
                message=f"{component} is within normal parameters.",
                due_km=None, cost_est_ugx=None,
            ))

    return alerts

@router.post("/analyze", response_model=MaintenanceResponse)
async def analyze_bike(data: BikeData):
    alerts  = check_alerts(data)
    critical = sum(1 for a in alerts if a.urgency == "critical")
    warning  = sum(1 for a in alerts if a.urgency == "warning")
    ok       = sum(1 for a in alerts if a.urgency == "ok")

    health = max(0, 100 - (critical * 20) - (warning * 8))
    km_since = data.mileage_km - data.last_service_km
    next_svc  = data.mileage_km + max(500, 3000 - km_since)
    fail_risk = min(1.0, (critical * 0.3 + warning * 0.1 + (km_since / 10000)))

    return MaintenanceResponse(
        bike_id=data.bike_id,
        health_score=round(health, 1),
        alerts=alerts,
        next_service_km=round(next_svc, 0),
        predicted_failure_risk=round(fail_risk, 3),
    )

@router.get("/fleet-status")
async def fleet_status():
    """Mock fleet of 10 bikes for demo."""
    import random
    bikes = []
    for i in range(1, 11):
        km = random.uniform(5000, 50000)
        bikes.append({
            "bike_id":    f"BODA-{i:03d}",
            "health":     round(random.gauss(72, 18), 1),
            "mileage_km": round(km, 0),
            "risk":       round(random.uniform(0.05, 0.65), 3),
            "alerts":     random.randint(0, 4),
        })
    bikes.sort(key=lambda x: x["health"])
    return {"fleet": bikes, "total": len(bikes)}
