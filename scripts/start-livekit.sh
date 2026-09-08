#!/usr/bin/env bash
# Start local LiveKit (WebRTC), then print the two commands for agent + UI.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if command -v docker >/dev/null 2>&1; then
  echo "Starting local LiveKit on ws://127.0.0.1:7880 …"
  docker compose up -d livekit
else
  echo "Docker not found. Install Docker, or run:  brew install livekit && livekit-server --dev"
  exit 1
fi

echo
echo "LiveKit is local. Official --dev credentials:"
echo "  LIVEKIT_URL=ws://127.0.0.1:7880"
echo "  LIVEKIT_API_KEY=devkey"
echo "  LIVEKIT_API_SECRET=secret"
echo
echo "Then in two terminals:"
echo "  1)  cd backend && source .venv/bin/activate && python agent.py dev"
echo "  2)  cd frontend && npm run dev"
echo
echo "Open http://localhost:3000  (headphones)"
