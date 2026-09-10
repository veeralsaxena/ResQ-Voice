#!/usr/bin/env bash
# ResQ-Voice: Master Stop Script

echo "Stopping ResQ-Voice services..."
pkill -f "backend/agent.py dev" 2>/dev/null && echo "✓ Stopped backend agent" || echo "Agent was not running"
lsof -ti :3000 | xargs kill -9 2>/dev/null && echo "✓ Stopped frontend on port 3000" || echo "Frontend was not running"
docker compose stop livekit 2>/dev/null && echo "✓ Stopped LiveKit container" || echo "LiveKit container not running"
echo "All ResQ-Voice services stopped."
