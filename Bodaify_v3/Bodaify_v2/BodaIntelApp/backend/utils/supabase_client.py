"""
Bodaify — Supabase Integration Layer
Handles all Supabase operations: auth, database, realtime.
Falls back gracefully if Supabase is unreachable.
"""

import os
import logging

logger = logging.getLogger("bodaify.supabase")

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://bcqaduwbtfivukxqlwko.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "sb_publishable_kLCAgaTxRAhxAcFKVEfJjA_WyaCz9E4")

_client = None

def get_client():
    """Return a Supabase client, initialising it lazily."""
    global _client
    if _client is not None:
        return _client
    try:
        from supabase import create_client
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("✓ Supabase connected: %s", SUPABASE_URL)
        return _client
    except Exception as e:
        logger.warning("Supabase unavailable (%s) — running in local mode", e)
        return None


# ── USER OPERATIONS ────────────────────────────────────────────────────────────

async def upsert_user(user: dict) -> bool:
    """Sync a user record to Supabase `users` table."""
    sb = get_client()
    if not sb:
        return False
    try:
        sb.table("users").upsert({
            "email":      user["email"],
            "full_name":  user["full_name"],
            "sacco":      user["sacco"],
            "role":       user["role"],
            "rider_id":   user["rider_id"],
        }).execute()
        return True
    except Exception as e:
        logger.warning("upsert_user failed: %s", e)
        return False


async def get_user(email: str) -> dict | None:
    """Fetch a user record from Supabase."""
    sb = get_client()
    if not sb:
        return None
    try:
        res = sb.table("users").select("*").eq("email", email).single().execute()
        return res.data
    except Exception as e:
        logger.warning("get_user failed: %s", e)
        return None


# ── FUEL AUDIT ─────────────────────────────────────────────────────────────────

async def insert_fuel_entry(entry: dict) -> bool:
    """Log a fuel entry to Supabase `fuel_entries` table."""
    sb = get_client()
    if not sb:
        return False
    try:
        sb.table("fuel_entries").insert({
            "rider_id":    entry.get("rider_id"),
            "date":        entry.get("date"),
            "liters":      entry.get("liters"),
            "cost_ugx":    entry.get("cost_ugx"),
            "distance_km": entry.get("distance_km"),
            "station":     entry.get("station"),
        }).execute()
        return True
    except Exception as e:
        logger.warning("insert_fuel_entry failed: %s", e)
        return False


async def get_fuel_entries(rider_id: str) -> list:
    """Retrieve fuel entries for a rider."""
    sb = get_client()
    if not sb:
        return []
    try:
        res = sb.table("fuel_entries") \
            .select("*") \
            .eq("rider_id", rider_id) \
            .order("date", desc=True) \
            .limit(50) \
            .execute()
        return res.data or []
    except Exception as e:
        logger.warning("get_fuel_entries failed: %s", e)
        return []


# ── ROUTE HISTORY ──────────────────────────────────────────────────────────────

async def log_route(rider_id: str, route_data: dict) -> bool:
    """Persist a calculated route to Supabase `routes` table."""
    sb = get_client()
    if not sb:
        return False
    try:
        sb.table("routes").insert({
            "rider_id":        rider_id,
            "origin":          route_data.get("origin"),
            "destination":     route_data.get("destination"),
            "mode":            route_data.get("mode"),
            "distance_km":     route_data.get("total_distance_km"),
            "fuel_cost_ugx":   route_data.get("fuel_cost_ugx"),
            "incline_score":   route_data.get("incline_score"),
        }).execute()
        return True
    except Exception as e:
        logger.warning("log_route failed: %s", e)
        return False


# ── MAINTENANCE ALERTS ─────────────────────────────────────────────────────────

async def save_maintenance_alert(bike_id: str, alerts: list) -> bool:
    """Store maintenance alerts in Supabase `maintenance_alerts` table."""
    sb = get_client()
    if not sb:
        return False
    try:
        rows = [{
            "bike_id":    bike_id,
            "component":  a["component"],
            "urgency":    a["urgency"],
            "message":    a["message"],
        } for a in alerts if a["urgency"] != "ok"]
        if rows:
            sb.table("maintenance_alerts").insert(rows).execute()
        return True
    except Exception as e:
        logger.warning("save_maintenance_alert failed: %s", e)
        return False


# ── SUPABASE SQL SCHEMA (for reference) ───────────────────────────────────────
SQL_SCHEMA = """
-- Run this in your Supabase SQL editor to create the tables --

create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  full_name  text,
  sacco      text,
  role       text default 'rider',
  rider_id   text,
  created_at timestamptz default now()
);

create table if not exists fuel_entries (
  id          uuid primary key default gen_random_uuid(),
  rider_id    text not null,
  date        date,
  liters      numeric(6,2),
  cost_ugx    integer,
  distance_km numeric(8,2),
  station     text,
  created_at  timestamptz default now()
);

create table if not exists routes (
  id             uuid primary key default gen_random_uuid(),
  rider_id       text,
  origin         text,
  destination    text,
  mode           text,
  distance_km    numeric(8,2),
  fuel_cost_ugx  numeric(10,2),
  incline_score  numeric(5,2),
  created_at     timestamptz default now()
);

create table if not exists maintenance_alerts (
  id         uuid primary key default gen_random_uuid(),
  bike_id    text,
  component  text,
  urgency    text,
  message    text,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table users              enable row level security;
alter table fuel_entries       enable row level security;
alter table routes             enable row level security;
alter table maintenance_alerts enable row level security;
"""
