from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

# ── Enums ─────────────────────────────────────────────────────────────────────

class RouteMode(str, Enum):
    fastest  = "fastest"
    eco      = "eco"
    safest   = "safest"
    incline  = "incline_aware"

class RoadCondition(str, Enum):
    smooth   = "smooth"
    moderate = "moderate"
    rough    = "rough"
    potholed = "potholed"

# ── Routing ───────────────────────────────────────────────────────────────────

class RouteRequest(BaseModel):
    origin:      str = Field(..., example="Kampala CBD")
    destination: str = Field(..., example="Entebbe Road")
    mode:        RouteMode = RouteMode.eco
    rider_weight_kg: float = Field(70.0, ge=40, le=200)
    load_kg:     float = Field(0.0,  ge=0,  le=100)
    fuel_liters: float = Field(2.0,  ge=0.1, le=20)

class RouteNode(BaseModel):
    name:      str
    lat:       float
    lon:       float
    elevation: float  # metres above sea level
    grade:     float  # % incline

class RouteResponse(BaseModel):
    route:            List[RouteNode]
    total_distance_km: float
    estimated_time_min: float
    fuel_cost_ugx:    float
    incline_score:    float   # 0–100 (lower = flatter)
    co2_saved_g:      float
    recommendation:   str

# ── Jam Predictor ─────────────────────────────────────────────────────────────

class JamRequest(BaseModel):
    area:       str = Field(..., example="Kampala CBD")
    hour_of_day: int = Field(..., ge=0, le=23)
    day_of_week: int = Field(..., ge=0, le=6)

class JamResponse(BaseModel):
    area:            str
    congestion_level: float  # 0.0 – 1.0
    label:           str     # "Low" / "Moderate" / "High" / "Gridlock"
    avg_speed_kmh:   float
    predicted_clear: str     # time string
    hotspots:        List[Dict[str, Any]]

# ── Road Quality ──────────────────────────────────────────────────────────────

class AccelReading(BaseModel):
    lat:   float
    lon:   float
    ax:    float   # m/s²
    ay:    float
    az:    float
    speed_kmh: float = 20.0

class RoadQualityResponse(BaseModel):
    lat:       float
    lon:       float
    rqi:       float       # Road Quality Index 0–100
    condition: RoadCondition
    vibration: float
    segment:   str

class RoadQualityMap(BaseModel):
    segments:  List[RoadQualityResponse]
    timestamp: datetime

# ── Fuel Optimizer ────────────────────────────────────────────────────────────

class FuelRequest(BaseModel):
    rider_weight_kg: float = Field(70.0, ge=40, le=200)
    load_kg:         float = Field(0.0,  ge=0,  le=150)
    bike_model:      str   = Field("Bajaj Boxer", example="Bajaj Boxer")
    fuel_liters:     float = Field(2.0,  ge=0.1, le=20)
    distance_km:     float = Field(10.0, ge=1,   le=200)
    incline_avg:     float = Field(2.0,  ge=0,   le=30)

class FuelResponse(BaseModel):
    total_weight_kg:    float
    fuel_to_weight_ratio: float   # L/kg per 100 km
    range_km:           float
    efficiency_grade:   str       # A / B / C / D
    savings_tip:        str
    optimal_load_kg:    float
    cost_per_km_ugx:    float

# ── Predictive Maintenance ────────────────────────────────────────────────────

class BikeData(BaseModel):
    bike_id:         str
    mileage_km:      float
    engine_hours:    float
    last_service_km: float
    avg_vibration:   float
    brake_wear_pct:  float   # 0–100
    chain_stretch_mm: float
    tire_pressure_f: float   # PSI front
    tire_pressure_r: float   # PSI rear
    oil_level_pct:   float

class MaintenanceAlert(BaseModel):
    component:   str
    urgency:     str   # critical / warning / ok
    message:     str
    due_km:      Optional[float]
    cost_est_ugx: Optional[int]

class MaintenanceResponse(BaseModel):
    bike_id:       str
    health_score:  float    # 0–100
    alerts:        List[MaintenanceAlert]
    next_service_km: float
    predicted_failure_risk: float

# ── Fuel Audit ────────────────────────────────────────────────────────────────

class FuelEntry(BaseModel):
    rider_id:   str
    date:       str
    liters:     float
    cost_ugx:   int
    distance_km: float
    station:    str

class FuelAuditSummary(BaseModel):
    rider_id:           str
    total_fuel_l:       float
    total_cost_ugx:     int
    avg_efficiency_kpl: float
    anomalies:          List[str]
    trend:              str   # "improving" / "stable" / "worsening"
    rank_percentile:    float

# ── DEM Elevation ─────────────────────────────────────────────────────────────

class ElevationPoint(BaseModel):
    lat:       float
    lon:       float
    elevation: float   # metres
    grade:     float   # % to next point

class DEMResponse(BaseModel):
    points:        List[ElevationPoint]
    min_elevation: float
    max_elevation: float
    total_climb_m: float
    total_descent_m: float
    avg_grade:     float

