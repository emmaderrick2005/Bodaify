"""Digital Elevation Model (DEM) Integration Router"""
import math, random
from fastapi import APIRouter
from sys import path as syspath
import os
syspath.insert(0, os.path.dirname(os.path.dirname(__file__)))
from models.schemas import ElevationPoint, DEMResponse

router = APIRouter()

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lon2 - lon1)
    a = math.sin(d_phi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(d_lam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def simulate_elevation(lat: float, lon: float) -> float:
    """
    Simulates DEM query for Kampala (would use SRTM/Copernicus DEM in production).
    Kampala sits on hills ~1150–1310m. We model as a smooth terrain function.
    """
    base = 1190
    hill = 60 * math.sin((lat - 0.28) * 80) * math.cos((lon - 32.54) * 60)
    noise = random.gauss(0, 5)
    return round(base + hill + noise, 1)

@router.get("/profile")
async def elevation_profile(
    lat1: float = 0.3476, lon1: float = 32.5825,
    lat2: float = 0.2700, lon2: float = 32.5600,
    steps: int = 20
):
    """Return elevation profile between two coordinates."""
    points = []
    total_climb = 0.0
    total_descent = 0.0
    prev_elev = None

    for i in range(steps + 1):
        t   = i / steps
        lat = lat1 + (lat2 - lat1) * t
        lon = lon1 + (lon2 - lon1) * t
        elev = simulate_elevation(lat, lon)

        grade = 0.0
        if prev_elev is not None and i > 0:
            d_lat = (lat2 - lat1) / steps
            d_lon = (lon2 - lon1) / steps
            seg_m = haversine(lat - d_lat, lon - d_lon, lat, lon)
            if seg_m > 0:
                grade = (elev - prev_elev) / seg_m * 100
            if elev > prev_elev:
                total_climb   += max(0, elev - prev_elev)
            else:
                total_descent += max(0, prev_elev - elev)

        points.append(ElevationPoint(
            lat=round(lat, 6), lon=round(lon, 6),
            elevation=elev, grade=round(grade, 2)
        ))
        prev_elev = elev

    elevations = [p.elevation for p in points]
    grades     = [abs(p.grade) for p in points[1:]]

    return DEMResponse(
        points=points,
        min_elevation=min(elevations),
        max_elevation=max(elevations),
        total_climb_m=round(total_climb, 1),
        total_descent_m=round(total_descent, 1),
        avg_grade=round(sum(grades) / len(grades) if grades else 0, 2),
    )

@router.get("/point")
async def single_point(lat: float = 0.3476, lon: float = 32.5825):
    elev = simulate_elevation(lat, lon)
    return {"lat": lat, "lon": lon, "elevation_m": elev}

@router.get("/kampala-terrain")
async def kampala_terrain(resolution: int = 30):
    """Grid elevation map of Kampala for 3D visualisation."""
    lat_min, lat_max = 0.25, 0.45
    lon_min, lon_max = 32.52, 32.70
    grid = []
    step_lat = (lat_max - lat_min) / resolution
    step_lon = (lon_max - lon_min) / resolution
    for i in range(resolution):
        for j in range(resolution):
            lat  = lat_min + i * step_lat
            lon  = lon_min + j * step_lon
            elev = simulate_elevation(lat, lon)
            grid.append({"lat": round(lat, 5), "lon": round(lon, 5), "elevation": elev})
    return {"resolution": resolution, "grid": grid}
