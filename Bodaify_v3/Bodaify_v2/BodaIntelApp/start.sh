#!/usr/bin/env bash
# ─── BodaIntel Platform ── Startup Script ───────────────────────────────────
set -e

echo ""
echo "  ██████╗  ██████╗ ██████╗  █████╗ ██╗███╗   ██╗████████╗███████╗██╗     "
echo "  ██╔══██╗██╔═══██╗██╔══██╗██╔══██╗██║████╗  ██║╚══██╔══╝██╔════╝██║     "
echo "  ██████╔╝██║   ██║██║  ██║███████║██║██╔██╗ ██║   ██║   █████╗  ██║     "
echo "  ██╔══██╗██║   ██║██║  ██║██╔══██║██║██║╚██╗██║   ██║   ██╔══╝  ██║     "
echo "  ██████╔╝╚██████╔╝██████╔╝██║  ██║██║██║ ╚████║   ██║   ███████╗███████╗"
echo "  ╚═════╝  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚══════╝"
echo ""
echo "  Fleet Intelligence Platform · Kampala, Uganda · 2026"
echo "  ──────────────────────────────────────────────────────"
echo ""

# Check Python
if ! command -v python3 &>/dev/null && ! command -v python &>/dev/null; then
  echo "  ✗ Python not found. Please install Python 3.9+ from https://python.org"
  exit 1
fi

PYTHON=$(command -v python3 || command -v python)
echo "  ✓ Python: $($PYTHON --version)"

# Install dependencies
echo "  → Installing dependencies..."
cd backend
$PYTHON -m pip install -r requirements.txt --quiet

echo ""
echo "  ✓ Starting BodaIntel on http://localhost:8000"
echo "  ✓ API docs: http://localhost:8000/api/docs"
echo "  Press Ctrl+C to stop."
echo ""

$PYTHON main.py
