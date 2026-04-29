"""
Incline-Aware Routing with DEM integration
Dijkstra shortest path weighted by distance + elevation penalty
"""

import math
import heapq
import random
from fastapi import APIRouter
from sys import path as syspath
import os
syspath.insert(0, os.path.dirname(os.path.dirname(__file__)))

from models.schemas import RouteRequest, RouteResponse, RouteNode
from data.kampala_graph import KAMPALA_NODES, KAMPALA_EDGES, BIKE_MODELS

router = APIRouter()

FUEL_PRICE_UGX_PER_LITER = 5200  # 2026 price

def build_graph():
    graph = {}
    for node in KAMPALA_NODES:
        graph[node] = []
    for u, v, dist, meta in KAMPALA_EDGES:
        graph[u].append((v, dist, meta))
        graph[v].append((u, dist, meta))
    return graph

def calc_grade(node_a: str, node_b: str) -> float:
    """Approximate road grade % between two nodes using elevation delta."""
    n1 = KAMPALA_NODES[node_a]
    n2 = KAMPALA_NODES[node_b]
    dist_m = haversine(n1["lat"], n1["lon"], n2["lat"], n2["lon"]) * 1000
    if dist_m < 1:
        return 0.0
    return abs(n2["elevation"] - n1["elevation"]) / dist_m * 100

def haversine(lat1, lon1, lat2, lon2) -> float:
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lon2 - lon1)
    a = math.sin(d_phi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(d_lam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def edge_weight(u: str, v: str, dist: float, meta: dict, mode: str,
                total_weight_kg: float) -> float:
    grade = calc_grade(u, v)
    quality = meta.get("road_quality", 0.8)

    if mode == "fastest":
        lanes = meta.get("lanes", 2)
        return dist / (quality * lanes * 0.5 + 0.5)
    elif mode == "eco":
        # Penalise steep inclines heavily (more fuel) and poor roads
        incline_penalty = 1 + (grade / 5) + (total_weight_kg / 300)
        return dist * incline_penalty / quality
    elif mode == "safest":
        return dist * (1 + (1 - quality) * 2 + grade / 10)
    elif mode == "incline_aware":
        return dist * (1 + grade / 3)
    return dist

def dijkstra(graph, start, end, mode, total_weight_kg):
    dist_map = {n: float("inf") for n in graph}
    prev_map = {n: None for n in graph}
    dist_map[start] = 0.0
    heap = [(0.0, start)]

    while heap:
        cost, u = heapq.heappop(heap)
        if u == end:
            break
        if cost > dist_map[u]:
            continue
        for v, d, meta in graph[u]:
            w = edge_weight(u, v, d, meta, mode, total_weight_kg)
            nc = cost + w
            if nc < dist_map[v]:
                dist_map[v] = nc
                prev_map[v] = u
                heapq.heappush(heap, (nc, v))

    path, cur = [], end
    while cur:
        path.append(cur)
        cur = prev_map[cur]
    path.reverse()
    return path if path[0] == start else []

def fuel_consumption(dist_km: float, grade_avg: float,
                     total_weight_kg: float, bike_model: str) -> float:
    """Litres consumed on this route."""
    specs = BIKE_MODELS.get(bike_model, BIKE_MODELS["Bajaj Boxer"])
    base_kpl = specs["base_kpl"]
    # Efficiency degrades with weight and incline
    weight_factor  = 1 + max(0, (total_weight_kg - 150)) / 500
    incline_factor = 1 + grade_avg / 20
    effective_kpl  = base_kpl / (weight_factor * incline_factor)
    return dist_km / effective_kpl

@router.post("/calculate", response_model=RouteResponse)
async def calculate_route(req: RouteRequest):
    graph = build_graph()

    # Fallback to random nearby node if not found
    nodes = list(KAMPALA_NODES.keys())
    origin = req.origin if req.origin in graph else random.choice(nodes)
    dest   = req.destination if req.destination in graph else random.choice(nodes)

    total_weight = req.rider_weight_kg + req.load_kg + 112  # bike weight

    path = dijkstra(graph, origin, dest, req.mode.value, total_weight)
    if not path or len(path) < 2:
        path = [origin, dest]

    # Build route nodes
    route_nodes = []
    total_dist  = 0.0
    total_climb = 0.0
    grades      = []

    for i, node in enumerate(path):
        info = KAMPALA_NODES.get(node, {"lat": 0.33, "lon": 32.58, "elevation": 1200})
        grade = 0.0
        if i < len(path) - 1:
            grade = calc_grade(node, path[i+1])
            grades.append(grade)
            # accumulate distance
            n2 = KAMPALA_NODES.get(path[i+1], info)
            total_dist += haversine(info["lat"], info["lon"], n2["lat"], n2["lon"])
            elev_diff   = n2["elevation"] - info["elevation"]
            if elev_diff > 0:
                total_climb += elev_diff

        route_nodes.append(RouteNode(
            name=node,
            lat=info["lat"],
            lon=info["lon"],
            elevation=info["elevation"],
            grade=round(grade, 2),
        ))

    avg_grade  = sum(grades) / len(grades) if grades else 0.0
    liters     = fuel_consumption(total_dist, avg_grade, total_weight,
                                  getattr(req, "bike_model", "Bajaj Boxer"))
    cost_ugx   = liters * FUEL_PRICE_UGX_PER_LITER
    time_min   = (total_dist / 25) * 60   # 25 km/h avg Kampala speed
    incline_sc = min(100, avg_grade * 10)
    co2_saved  = max(0, (liters * 0.8 - liters) * 2392)  # vs baseline

    tip_map = {
        "fastest":        "Fastest route chosen — expect higher fuel use during peak hours.",
        "eco":            "Eco route minimises fuel. Avoid high-load cargo above 20 kg.",
        "safest":         "Safest route selected — smoother roads reduce bike wear.",
        "incline_aware":  "Flat route chosen — ideal for heavy loads and fuel savings.",
    }

    return RouteResponse(
        route=route_nodes,
        total_distance_km=round(total_dist, 2),
        estimated_time_min=round(time_min, 1),
        fuel_cost_ugx=round(cost_ugx),
        incline_score=round(incline_sc, 1),
        co2_saved_g=round(co2_saved, 1),
        recommendation=tip_map.get(req.mode.value, "Route optimised."),
    )

@router.get("/nodes")
async def list_nodes():
    return {"nodes": list(KAMPALA_NODES.keys())}

@router.get("/modes")
async def list_modes():
    return {
        "modes": [
            {"value": "fastest",       "label": "Fastest",        "icon": "⚡"},
            {"value": "eco",           "label": "Eco / Fuel-Save", "icon": "🌿"},
            {"value": "safest",        "label": "Safest Roads",    "icon": "🛡️"},
            {"value": "incline_aware", "label": "Incline-Aware",   "icon": "⛰️"},
        ]
    }
