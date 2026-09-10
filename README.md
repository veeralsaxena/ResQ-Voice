# ResQ-Voice — Hands-Busy Field Emergency Voice Copilot

[![Hackathon](https://img.shields.io/badge/Hackathon-DataForge_2026-blue)](https://unstop.com/hackathons/dataforge-2026-iit-kharagpur-1739346)
[![Track](https://img.shields.io/badge/Track-Rime_Track_%22Build_a_Voice--Native_Product%22-emerald)](https://docs.rime.ai/)
[![TTS](https://img.shields.io/badge/TTS-Rime_mistv3_/_astra-purple)](https://users.rime.ai)
[![Transport](https://img.shields.io/badge/Transport-LiveKit_WebRTC-cyan)](https://livekit.io)
[![Repository](https://img.shields.io/badge/GitHub-ResQ--Voice-black)](https://github.com/veeralsaxena/ResQ-Voice)

> **Repository**: [https://github.com/veeralsaxena/ResQ-Voice](https://github.com/veeralsaxena/ResQ-Voice)  
> **Demo Video**: [https://drive.google.com/drive/folders/1N1Hrb3KHFraBtQaqh7jtXgo1Vu3mFidc?usp=sharing](https://drive.google.com/drive/folders/1N1Hrb3KHFraBtQaqh7jtXgo1Vu3mFidc?usp=sharing)

---

## 1. Problem Statement & Voice Necessity (25%)

The target user is a **solo paramedic or battlefield field medic** performing CPR chest compressions or arterial hemorrhage packing.

- **Hands-Busy**: Both hands are locked in chest compressions (100–120 bpm) or holding direct wound pressure.
- **Eyes-Busy**: Attention cannot leave the patient’s chest, pupils, and vital signs.
- **Voice Necessity**: There is zero ability to touch a phone, tap a screen, or read a text UI. If audio is muted, **the product ceases to exist**.

ResQ-Voice is built to be a calm, senior triage partner operating entirely through low-latency speech.

---

## 2. The Hard Voice Problem: Interruption & Tool Fencing (25%)

In field resuscitation, patient conditions change in split seconds.

### The Failure Mode
If the medic asks for a weight-based dose calculation (*"Look up Epinephrine for 70 kilograms"*), the system initiates an asynchronous medical lookup (simulating 2.5 seconds of database query time). If the medic suddenly notices pediatric cues and interrupts:
> **`"Wait, stop! Make it forty kilograms!"`**

Standard voice bots will either:
1. Speak over the medic, ignoring the interruption.
2. Complete the delayed 70kg calculation and speak the wrong, potentially fatal dose.

### The ResQ-Voice Solution
- **< 150ms Audio Truncation**: Silero VAD detects user speech, immediately signaling LiveKit and Rime to halt playback and drain buffered PCM frames.
- **Tool Fencing (`backend/fence.py`)**: The in-flight 70kg lookup task is marked obsolete, immediately cancelled, and dropped so its result is never passed to the LLM.
- **Context Reconciliation**: The agent ingests the new 40kg constraint without speaking stale medical figures.

Full empirical evidence, test procedures, and tables are documented in [`RIME_EVIDENCE.md`](./RIME_EVIDENCE.md).

---

## 3. Rime Integration Specifications (20%)

Rime is the **primary and sole spoken output** for every turn. Fallback speech is never masked as Rime.

| Parameter | Shipped Configuration |
| :--- | :--- |
| **Provider** | Rime Labs (Official LiveKit Integration: `livekit-plugins-rime`) |
| **Model ID** | `mistv3` (Current production catalog) |
| **Speaker / Voice** | `astra` (`celeste` is Coda-only and would fail `mistv3` preflight) |
| **Language** | `en` (`eng`) |
| **Transport** | Bidirectional WebRTC via LiveKit Server |
| **Audio Format** | 24 kHz Linear PCM stream |
| **Streaming Protocol** | Native WebSocket (`wss://users-ws.rime.ai`, `use_websocket=True`) |

### Writing for the Ear
Following Brooke Larson's Rime Prompting Guidelines:
- Spoken sentences are kept strictly under 20 words (averaging 10–14 words).
- Natural conversational fillers (*"Um"*, *"Right"*, *"Understood"*) are sprinkled to soften turn starts.
- Pure colloquial English with zero SSML, markdown bullet points, or visual formatting tags.

---

## 4. Architecture Overview

```
 [ Field Medic Mic ]
         │
         ▼ (WebRTC 24kHz)
 [ LiveKit Server ] ──► [ Silero VAD ] ──► [ Speech-to-Text ]
                                                   │ (Transcribed text)
                                                   ▼
                                           [ LLM Reasoning ]
                                                   │
                                      ┌────────────┴────────────┐
                                      │ Tool: lookup_dosage     │
                                      │ (Fenced with 2.5s DB)   │
                                      └────────────┬────────────┘
                                                   │ (Short speech text)
                                                   ▼
                                         [ Rime mistv3 WS ]
                                                   │ (24kHz PCM chunks)
                                                   ▼
 [ Field Medic Ear ] ◄── (WebRTC 24kHz) ── [ LiveKit Server ]
         │
         └─────────────► Telemetry Data Channel (`resq.events`) ──► [ Next.js HUD ]
```

---

## 5. Repository Structure

```
├── backend/
│   ├── agent.py                 # Core VoiceAssistant with LiveKit + Rime mistv3
│   ├── fence.py                 # ToolFence generation tracker & cooperative cancellation
│   ├── tools.py                 # Asynchronous medical tools with simulated DB latency
│   ├── playback.py              # PCM frame buffer and interruption latency timer
│   ├── metrics.py               # DataChannel emitter (`resq.events`) & logger
│   ├── requirements.txt         # Locked Python 3.11+ dependencies
│   └── tests/
│       └── benchmark_barge_in.py# Repeatable test fixture measuring interruption latency
├── frontend/
│   ├── app/
│   │   ├── page.tsx             # Apple-grade minimalist telemetry HUD
│   │   └── api/                 # Token generator & stress benchmark endpoints
│   ├── components/
│   │   ├── LiveAudioVisualizer.tsx # Minimalist audio spectrum visualizer
│   │   ├── MetricCounters.tsx      # Studio-grade telemetry HUD cards
│   │   └── EventStreamLog.tsx      # Terminal-style audit stream log
│   └── package.json
├── docker-compose.yml           # Local LiveKit WebRTC server container
├── .env.example                 # Clean configuration template (zero leaked secrets)
├── README.md                    # Technical documentation
└── RIME_EVIDENCE.md             # Benchmark methodology and acceptance verification
```

---

## 6. Setup & Running Locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker (for local LiveKit WebRTC server)

### 1. Configure Environment
```bash
cp .env.example .env
cp .env.example frontend/.env.local
```
Fill in your `RIME_API_KEY` and your preferred LLM key (`GROQ_API_KEY` or `OPENAI_API_KEY`). LiveKit defaults to the local Docker dev server (`devkey` / `secret`).

### 2. Start Local LiveKit WebRTC
```bash
docker compose up -d
```
Verified running at `ws://127.0.0.1:7880`.

### 3. Start Backend Agent
```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python agent.py dev
```

### 4. Start Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)**.

---

## 7. Repeatable Benchmark Verification

To run the standalone interruption benchmark suite (no external services needed):

```bash
python backend/tests/benchmark_barge_in.py --trials 10
```

Sample output:
```
| Trial | Barge-in (s) | Interruption latency (ms) | Drained frames | Tool cancelled | Stale dose spoken | Pass (<150 ms + fence) |
| ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 1.2 | 0.025 | 57 | yes | no | PASS |
...
n = 10 · P50 = 0.025 ms · P90 = 0.039 ms · pass rate = 10/10
```

---

## 8. Clinical Disclaimer & Safety Notes

- **Simulated Reference Only**: All medication dosages and protocols in this codebase are synthetic references for engineering demonstration and training simulations. Not for direct patient care.
- **Acoustic Echo**: Paramedics must use headphones or directional headsets to prevent open-speaker acoustic feedback from self-triggering VAD barge-in.
