# RIME_EVIDENCE

## Claim

**ResQ-Voice truncates Rime playback on medic barge-in, cancels in-flight tool work, and never speaks a stale dosage as current.**

Acceptance for the abort path used by the agent:

`interruption_latency_ms = (rime_audio_halt_time - vad_trigger_time) * 1000 < 150`

and

`stale_spoken == false` after an interrupted `lookup_dosage`.

This is the official full-duplex example: introduce a fixed delay in a tool call, interrupt while the agent is speaking or waiting, change one part of the request, and prove queued Rime audio stops, the new instruction wins, and the delayed result is not applied to the wrong state.

## Acceptance criteria (defined before the demo)

| ID | Criterion | Pass if |
| --- | --- | --- |
| A1 | Voice is necessary | A medic with both hands occupied can complete the flow using only speech. Muting audio removes the product. |
| A2 | Rime is the mouth | Primary TTS is Rime `mistv3` / `astra` / `en`, PCM, LiveKit WebRTC, WebSocket stream to `wss://users-ws.rime.ai`. Fallback TTS is not used in the judged path. |
| A3 | Prompt halt | After VAD marks user speech during agent speech or tool wait, local playback abort completes in &lt; 150 ms. |
| A4 | Tool fence | `lookup_dosage` (2.5 s simulated query) is cancelled or its result is dropped. The 70 kg dose is not spoken after “make it 40 kg”. |
| A5 | Writing for the ear | Spoken turns are short plain text with optional fillers; no SSML or markdown lists. |
| A6 | Observable provider | Dashboard shows `SPEAKING [RIME TTS: mistv3/astra]` and a timestamped event log. |

## Method

Two layers. Judges asked for a repeatable command or fixture when practical. Unverified live numbers get no credit, so they are separated.

### Layer 1 — in-process fixture (repeatable, no secrets)

Same `ToolFence` and `RimePlaybackBuffer` objects the agent uses.

1. Start a 4.0 s synthetic Rime utterance (20 ms PCM frames at 24 kHz).
2. Start `lookup_dosage(70 kg, epinephrine)` with `asyncio.sleep(2.5)`.
3. At **t = 1.2 s**, fire VAD trigger → `playback.abort()` → `fence.invalidate()`.
4. Record halt latency, drained frames, whether the tool was cancelled, whether a speakable dose leaked.

Command:

```bash
python backend/tests/benchmark_barge_in.py --trials 10
```

Uncached. No TTS HTTP cache. No LiveKit.

### Layer 2 — live WebRTC + Rime (demo)

1. Run `python backend/agent.py dev` and the Next.js dashboard.
2. Ask for a long cue or a 70 kg dose lookup.
3. Interrupt at ~1.2 s with “Wait, stop.”
4. Read `interruption_latency_ms` from the `resq.events` data channel (event log + metrics card).
5. Repeat the 40 kg correction and confirm the first dose is not spoken.

Fill the live table on the machine you record. Do not paste Layer 1 milliseconds into a live WebRTC claim.

## Layer 1 results

Host: local Python 3, 2026-09-08. Ten consecutive uncached trials.

| Trial | Barge-in (s) | Interruption latency (ms) | Drained frames | Tool cancelled | Stale dose spoken | Pass (&lt;150 ms + fence) |
| ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 1.2 | 0.025 | 57 | yes | no | PASS |
| 2 | 1.2 | 0.036 | 57 | yes | no | PASS |
| 3 | 1.2 | 0.038 | 57 | yes | no | PASS |
| 4 | 1.2 | 0.021 | 57 | yes | no | PASS |
| 5 | 1.2 | 0.021 | 57 | yes | no | PASS |
| 6 | 1.2 | 0.046 | 57 | yes | no | PASS |
| 7 | 1.2 | 0.022 | 57 | yes | no | PASS |
| 8 | 1.2 | 0.034 | 57 | yes | no | PASS |
| 9 | 1.2 | 0.024 | 57 | yes | no | PASS |
| 10 | 1.2 | 0.019 | 57 | yes | no | PASS |

**n = 10 · P50 = 0.025 ms · P90 = 0.039 ms · pass rate = 10/10**

What this does and does not prove:

- Proves the fence and buffer-purge logic: 57 queued frames drained, `lookup_dosage` cancelled, zero stale spoken doses.
- Does **not** include Silero VAD time (configured `min_speech_duration=0.1` s, *before* `vad_trigger_time`).
- Does **not** include LiveKit jitter buffer, speaker hardware, or Rime WebSocket close RTT.

## Live path budget (not a measurement)

Until you paste Layer 2 numbers from a recorded session:

| Segment | Typical contribution | In the 150 ms budget? |
| --- | --- | --- |
| Silero min speech duration | 100 ms (config) | No — occurs before `vad_trigger_time` |
| Abort + fence (Layer 1 P90) | 0.04 ms | Yes |
| WebRTC playout / WS cancel | device + network dependent | Yes — this is what Layer 2 must show |

Target for Layer 2: P50 / P90 of `interruption_latency_ms` both under 150 ms. Record n, date, headphones vs speakers, and cold vs warm session.

## Stress / failure case

**Nominal:** “Look up epi for seventy kilograms.”

**Stress:** at 1.2 s, “Wait, stop. Forty kilograms.”

**Expected:** playback abort log, `FENCE: Cancelled background tool task [lookup_dosage]`, next spoken dose (if any) matches 40 kg, never 70 kg.

**Unsupported:** real patient care; treating simulated milligrams as medical orders.

## Limitations

- Acoustic echo without headphones can self-interrupt.
- Exertion breathing, suction, and sirens can trip VAD; we use VAD interruption (not adaptive) so “Wait, stop” always cuts, which raises false-interrupt risk.
- Healthcare data in this repo is synthetic.
- Catalog constraint: `celeste` is not a Mist v3 speaker. Judged combo is `mistv3` + `astra`. Switching to Coda+`celeste` is a one-env-var change after preflight.

## Rime integration checklist

- [x] Rime is not a welcome-only clip; every agent turn is Rime TTS.
- [x] Model, speaker, language, endpoint, format, transport documented.
- [x] Credentials only in `.env` / `.env.local` (see `.env.example`).
- [x] Active provider visible on the dashboard.
- [x] Repeatable fixture command in this file.
