"""
Bodaify — Fleet Intelligence Platform
AI-powered boda boda fleet management for Kampala, Uganda
"""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import uvicorn

from routers import (
    routing, jam_predictor, road_quality, fuel,
    maintenance, fuel_audit, auth, dem, otp,
)

# ── Supabase config (injected from env or hardcoded for demo) ──────────────────
SUPABASE_URL         = os.getenv("SUPABASE_URL",  "https://bcqaduwbtfivukxqlwko.supabase.co")
SUPABASE_PUBLISHABLE = os.getenv("SUPABASE_KEY",  "sb_publishable_kLCAgaTxRAhxAcFKVEfJjA_WyaCz9E4")
SUPABASE_PROJECT_ID  = os.getenv("SUPABASE_PROJECT", "bcqaduwbtfivukxqlwko")

app = FastAPI(
    title="Bodaify Platform API",
    description="AI-powered fleet intelligence for Kampala boda boda operations",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(auth.router,          prefix="/api/auth",        tags=["Authentication"])
app.include_router(otp.router,           prefix="/api/auth",        tags=["Email OTP"])
app.include_router(routing.router,       prefix="/api/routing",     tags=["Routing"])
app.include_router(jam_predictor.router, prefix="/api/jam",         tags=["Jam Predictor"])
app.include_router(road_quality.router,  prefix="/api/road-quality",tags=["Road Quality"])
app.include_router(fuel.router,          prefix="/api/fuel",        tags=["Fuel Optimizer"])
app.include_router(maintenance.router,   prefix="/api/maintenance", tags=["Predictive Maintenance"])
app.include_router(fuel_audit.router,    prefix="/api/fuel-audit",  tags=["Fuel Audit"])
app.include_router(dem.router,           prefix="/api/dem",         tags=["DEM Elevation"])

# ── Supabase config endpoint (safe — only exposes publishable key) ─────────────
@app.get("/api/config", tags=["Config"])
async def get_config():
    return JSONResponse({
        "app":            "Bodaify",
        "version":        "2.0.0",
        "supabase_url":   SUPABASE_URL,
        "supabase_key":   SUPABASE_PUBLISHABLE,
        "project_id":     SUPABASE_PROJECT_ID,
    })

# Serve frontend
frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))
if os.path.exists(frontend_path):
    app.mount("/static",  StaticFiles(directory=os.path.join(frontend_path, "css")),    name="css")
    app.mount("/js",      StaticFiles(directory=os.path.join(frontend_path, "js")),     name="js")
    _assets = os.path.join(frontend_path, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    @app.get("/", include_in_schema=False)
    async def serve_frontend():
        return FileResponse(os.path.join(frontend_path, "index.html"))

    @app.get("/login", include_in_schema=False)
    async def serve_login():
        return FileResponse(os.path.join(frontend_path, "login.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    async def catch_all(full_path: str):
        return FileResponse(os.path.join(frontend_path, "index.html"))

@app.get("/api/health", tags=["Health"])
async def health():
    return {"status": "ok", "service": "Bodaify Platform", "version": "2.0.0"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
