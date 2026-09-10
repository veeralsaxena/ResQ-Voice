#!/usr/bin/env bash
# ResQ-Voice: Master 1-Click Startup Script
# Starts LiveKit (Docker), Python Voice Agent, and Next.js Frontend together in the background.

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=========================================================="
echo "🚑 ResQ-Voice: Launching All Services in Background..."
echo "=========================================================="

# 1. Clean up any existing instances to avoid port conflicts
echo "[1/4] Checking and clearing old processes..."
pkill -f "backend/agent.py dev" 2>/dev/null || true
lsof -ti :3000 | xargs kill -9 2>/dev/null || true

# 2. LiveKit Docker Container
echo "[2/4] Starting LiveKit WebRTC Server (Docker)..."
if command -v docker >/dev/null 2>&1; then
  docker compose up -d livekit
  for i in {1..15}; do
    if nc -z 127.0.0.1 7880 2>/dev/null; then
      echo "      ✓ LiveKit is listening on ws://127.0.0.1:7880"
      break
    fi
    sleep 1
  done
else
  echo "      ❌ Docker not found. Please ensure Docker is running."
  exit 1
fi

# 3. Python Backend Agent (Groq + Rime + Silero VAD)
echo "[3/4] Starting ResQ-Voice Backend Agent..."
if [ -d ".venv" ]; then
  PYTHON_BIN=".venv/bin/python"
elif [ -d "backend/.venv" ]; then
  PYTHON_BIN="backend/.venv/bin/python"
elif [ -d "venv" ]; then
  PYTHON_BIN="venv/bin/python"
else
  PYTHON_BIN="python3"
fi

nohup $PYTHON_BIN backend/agent.py dev > backend/agent.log 2>&1 &
AGENT_PID=$!
echo "      ✓ Agent started (PID: $AGENT_PID, logging to backend/agent.log)"
sleep 2

# 4. Next.js Frontend (Port 3000)
echo "[4/4] Starting Next.js Web Dashboard..."
cd frontend
nohup npm run start > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd "$ROOT"
echo "      ✓ Frontend started (PID: $FRONTEND_PID, logging to frontend.log)"

echo "Waiting for web server to become healthy..."
HEALTHY=false
for i in {1..20}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health || true)
  if [ "$STATUS" = "200" ]; then
    HEALTHY=true
    break
  fi
  sleep 1
done

echo ""
echo "=========================================================="
if [ "$HEALTHY" = "true" ]; then
  echo "🚀 ALL RESQ-VOICE SERVICES ARE ONLINE & OPERATIONAL!"
  echo "=========================================================="
  echo "🌐 Frontend Dashboard : http://localhost:3000"
  echo "📡 WebRTC LiveKit URL : ws://127.0.0.1:7880"
  echo "🧠 LLM & Voice Stack  : Groq GPT-OSS-20B + Rime mistv3/astra"
  echo "🎙️ STT & VAD Engine   : Groq Whisper Large v3 Turbo + Silero"
  echo ""
  echo "System Health Payload:"
  curl -s http://localhost:3000/api/health | jq . 2>/dev/null || curl -s http://localhost:3000/api/health
  echo ""
else
  echo "⚠️ Warning: Frontend health endpoint did not respond with 200 within 20s."
  echo "Check frontend.log or backend/agent.log for details."
fi
