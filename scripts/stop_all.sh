#!/usr/bin/env bash
# ResQ-Voice: Master Stop Script
# Safely terminates all local background services (LiveKit Docker, Next.js UI, Python Agent).

echo "=========================================================="
echo "🛑 Shutting Down All ResQ-Voice Local Services..."
echo "=========================================================="

echo "[1/3] Terminating Python Voice Agent..."
pkill -9 -f "agent.py" 2>/dev/null || true
pkill -9 -f "livekit.agents" 2>/dev/null || true
echo "      ✓ Agent stopped."

echo "[2/3] Terminating Next.js Web Dashboard (Port 3000)..."
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
echo "      ✓ Port 3000 cleared."

echo "[3/3] Stopping LiveKit Docker Container..."
docker compose stop livekit 2>/dev/null || true
docker stop rime-livekit-1 2>/dev/null || true
echo "      ✓ LiveKit container stopped."

echo "=========================================================="
echo "✅ All ResQ-Voice services successfully stopped."
echo "=========================================================="
