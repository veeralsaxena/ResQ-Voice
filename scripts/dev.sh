#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> LiveKit (local WebRTC). Needs Docker."
if command -v docker >/dev/null 2>&1; then
  docker compose up -d livekit
else
  echo "Docker not found. Install Docker, or run: brew install livekit && livekit-server --dev"
fi

echo "==> Waiting for ws://127.0.0.1:7880"
for i in {1..30}; do
  if nc -z 127.0.0.1 7880 2>/dev/null; then
    echo "LiveKit is up."
    break
  fi
  sleep 1
done

echo "Next, in two terminals:"
echo "  1. cd backend && source .venv/bin/activate && python agent.py dev"
echo "  2. cd frontend && npm run dev"
echo "Then open http://localhost:3000"
