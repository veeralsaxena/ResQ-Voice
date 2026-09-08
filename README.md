# ResQ-Voice

Hands-busy field emergency and triage **voice** copilot for DataForge 2026 (Rime track).

If you mute the speaker, a medic with both hands on the patient has no product. That is the point.

## What LiveKit is (and why we need a URL)

LiveKit is **not** the voice AI. It is the **realtime audio pipe**.

| Piece | Job |
| --- | --- |
| Your mic | Captures speech |
| **LiveKit** | Moves that audio (and Rime’s reply) over **WebRTC** between browser and agent. The `LIVEKIT_URL` is just “where is that pipe?” — `ws://127.0.0.1:7880` locally or `wss://….livekit.cloud` in Cloud. |
| Groq | Understands you and decides what to say / which tool to call |
| **Rime** | Speaks. This is the only TTS. Judges score this. |
| Deepgram (optional) | Alternative STT. If unset, Groq Whisper is used |

Without LiveKit (or `agent.py console`), the browser cannot join a voice room.

### Local vs Cloud — recommendation

**Use local LiveKit for this hackathon.** It is already configured:

- URL: `ws://127.0.0.1:7880`
- API key / secret: LiveKit’s official **dev** pair `devkey` / `secret` (not a personal secret)

Start the server (needs Docker):

```bash
docker compose up -d
```

Or without Docker: `brew install livekit` then `livekit-server --dev`.

**LiveKit Cloud** is optional if you want a public `wss://` URL for a teammate to join. Same product. Swap the three env vars. For a laptop demo, local is simpler and totally valid.

## You still must paste

1. **`GROQ_API_KEY`** in `.env` (unlimited LLM + Whisper fallback).
2. **`RIME_API_KEY`** — already in local `.env` if you added it. Do not commit it.

Then two processes:

```bash
docker compose up -d
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python agent.py dev

# other terminal
cd frontend && npm install && npm run dev
```

http://localhost:3000 · headphones · Start live session.

## Exact Rime specs (judged)

Model `mistv3` · speaker `astra` · `en` · `https://users.rime.ai/v1/rime-tts` · WS `wss://users-ws.rime.ai` · PCM 24 kHz · transport WebRTC.

## Demo (≤ 5 min)

Hands busy → “cue airway” → “epi for 70 kg” → “Wait, stop. Forty kilograms.” → show INTERRUPTING, fence, latency, Rime chip.

## Submit

Git repo **without** `.env`. 4–5 min recording. `README.md` + `RIME_EVIDENCE.md`.
