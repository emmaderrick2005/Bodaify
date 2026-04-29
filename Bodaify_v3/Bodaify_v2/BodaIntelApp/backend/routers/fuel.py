"""Fuel-to-Weight Ratio Optimizer"""
from fastapi import APIRouter
from sys import path as syspath
import os
syspath.insert(0, os.path.dirname(os.path.dirname(__file__)))
from models.schemas import FuelRequest, FuelResponse
from data.kampala_graph import BIKE_MODELS

router = APIRouter()
FUEL_PRICE = 5200  # UGX/litre 2026

@router.post("/optimize", response_model=FuelResponse)
async def optimize_fuel(req: FuelRequest):
    specs = BIKE_MODELS.get(req.bike_model, BIKE_MODELS["Bajaj Boxer"])
    total_w = req.rider_weight_kg + req.load_kg + specs["weight_kg"]
    
    weight_pen  = 1 + max(0, (total_w - 200)) / 400
    incline_pen = 1 + req.incline_avg / 15
    eff_kpl     = specs["base_kpl"] / (weight_pen * incline_pen)
    range_km    = req.fuel_liters * eff_kpl
    fuel_used   = req.distance_km / eff_kpl
    fwr         = (fuel_used / total_w) * 100  # L per 100 kg per 100 km

    if eff_kpl >= 45:   grade = "A"
    elif eff_kpl >= 38: grade = "B"
    elif eff_kpl >= 28: grade = "C"
    else:               grade = "D"

    # Find optimal load
    optimal_load = 0.0
    best_score   = float("inf")
    for test_load in range(0, 80, 5):
        tw  = req.rider_weight_kg + test_load + specs["weight_kg"]
        wp  = 1 + max(0, (tw - 200)) / 400
        eff = specs["base_kpl"] / (wp * incline_pen)
        score = test_load / eff  # fuel per kg of cargo
        if score < best_score:
            best_score   = score
            optimal_load = test_load

    tips = {
        "A": "Excellent efficiency! Maintain tyre pressure and service schedule.",
        "B": "Good efficiency. Reduce load by 5–10 kg to reach grade A.",
        "C": "Consider lightening load. Steep inclines are costing extra fuel.",
        "D": "Heavy overload detected. Reduce cargo or split trip for best economy.",
    }

    return FuelResponse(
        total_weight_kg=round(total_w, 1),
        fuel_to_weight_ratio=round(fwr, 4),
        range_km=round(range_km, 1),
        efficiency_grade=grade,
        savings_tip=tips[grade],
        optimal_load_kg=float(optimal_load),
        cost_per_km_ugx=round((FUEL_PRICE / eff_kpl), 0),
    )

@router.get("/bikes")
async def list_bikes():
    return {"bikes": [
        {"model": k, "base_kpl": v["base_kpl"], "engine_cc": v["engine_cc"]}
        for k, v in BIKE_MODELS.items()
    ]}
