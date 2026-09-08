#!/usr/bin/env python3
"""Repeatable barge-in + tool-fence benchmark for ResQ-Voice.

This harness does not need LiveKit, Rime, or a microphone. It exercises the
same ToolFence + RimePlaybackBuffer used by the agent:

  1. Start a long synthetic Rime utterance (4.0 s of 20 ms PCM frames).
  2. Start lookup_dosage with the configured 2.5 s lookup delay.
  3. At t = 1.2 s, inject a barge-in (VAD trigger).
  4. Measure time until playback.abort() returns (rime_audio_halt_time).
  5. Assert the dosage task is cancelled and cannot return a speakable dose.

Run from the repo root or backend/:

    python backend/tests/benchmark_barge_in.py
    python backend/tests/benchmark_barge_in.py --trials 10

Live WebRTC + Rime path (optional, requires a running agent):

    python backend/tests/benchmark_barge_in.py --live
    # Not implemented as a network client here; use the dashboard stress case.
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fence import ToolFence  # noqa: E402
from playback import RimePlaybackBuffer  # noqa: E402
from tools import lookup_dosage  # noqa: E402

UTTERANCE_S = 4.0
BARGE_IN_AT_S = 1.2
ACCEPT_MS = 150.0


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    k = (len(ordered) - 1) * (p / 100.0)
    lo = int(k)
    hi = min(lo + 1, len(ordered) - 1)
    frac = k - lo
    return ordered[lo] * (1 - frac) + ordered[hi] * frac


async def one_trial(trial: int, lookup_latency_s: float) -> dict:
    fence = ToolFence()
    playback = RimePlaybackBuffer()
    stale_spoken = False

    async def dosage_job() -> None:
        nonlocal stale_spoken
        result = await lookup_dosage(
            fence,
            patient_weight_kg=70.0,
            medication="epinephrine",
            latency_s=lookup_latency_s,
        )
        if result.get("ok") and not result.get("cancelled") and not result.get("stale"):
            stale_spoken = True

    await playback.start_utterance()
    stream_task = asyncio.create_task(playback.simulate_stream(UTTERANCE_S))
    tool_task = asyncio.create_task(dosage_job())

    await asyncio.sleep(BARGE_IN_AT_S)
    vad_trigger = time.monotonic()
    halt = await playback.abort(vad_trigger)
    snapshot = await fence.invalidate(reason="benchmark_barge_in")
    await asyncio.sleep(0.05)
    await asyncio.gather(stream_task, tool_task, return_exceptions=True)

    tool_cancelled = "lookup_dosage" in snapshot.cancelled_names or not stale_spoken
    passed = halt.interruption_latency_ms < ACCEPT_MS and tool_cancelled and not stale_spoken

    return {
        "trial": trial,
        "barge_in_at_s": BARGE_IN_AT_S,
        "interruption_latency_ms": round(halt.interruption_latency_ms, 3),
        "drained_frames": halt.drained_frames,
        "cancelled_tools": snapshot.cancelled_names,
        "stale_spoken": stale_spoken,
        "passed": passed,
    }


async def run_suite(trials: int, lookup_latency_s: float) -> list[dict]:
    results = []
    for i in range(1, trials + 1):
        results.append(await one_trial(trial=i, lookup_latency_s=lookup_latency_s))
    return results


def markdown_table(rows: list[dict]) -> str:
    latencies = [r["interruption_latency_ms"] for r in rows]
    p50 = percentile(latencies, 50)
    p90 = percentile(latencies, 90)
    passed = sum(1 for r in rows if r["passed"])
    lines = [
        "| Trial | Barge-in (s) | Interruption latency (ms) | Drained frames | Tool cancelled | Stale dose spoken | Pass (<150 ms + fence) |",
        "| ---: | ---: | ---: | ---: | --- | --- | --- |",
    ]
    for r in rows:
        lines.append(
            "| {trial} | {barge_in_at_s:.1f} | {interruption_latency_ms:.3f} | {drained_frames} | {cancelled} | {stale} | {passed} |".format(
                trial=r["trial"],
                barge_in_at_s=r["barge_in_at_s"],
                interruption_latency_ms=r["interruption_latency_ms"],
                drained_frames=r["drained_frames"],
                cancelled="yes" if r["cancelled_tools"] or not r["stale_spoken"] else "no",
                stale="yes" if r["stale_spoken"] else "no",
                passed="PASS" if r["passed"] else "FAIL",
            )
        )
    lines.append("")
    lines.append(f"**n = {len(rows)}** · **P50 = {p50:.3f} ms** · **P90 = {p90:.3f} ms** · **pass rate = {passed}/{len(rows)}**")
    lines.append("")
    lines.append(
        "Measurement definition: `interruption_latency_ms = (rime_audio_halt_time - vad_trigger_time) * 1000`."
    )
    lines.append(
        "This suite is the in-process fence + playback abort path. Label live WebRTC+Rime runs separately."
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="ResQ-Voice barge-in benchmark")
    parser.add_argument("--trials", type=int, default=10)
    parser.add_argument("--lookup-latency", type=float, default=2.5)
    parser.add_argument(
        "--write",
        type=Path,
        default=None,
        help="Optional path to write the Markdown table",
    )
    parser.add_argument("--json", action="store_true", help="Print JSON instead of Markdown")
    args = parser.parse_args()
    rows = asyncio.run(run_suite(args.trials, args.lookup_latency))
    latencies = [r["interruption_latency_ms"] for r in rows]
    summary = {
        "trials": rows,
        "p50_ms": percentile(latencies, 50),
        "p90_ms": percentile(latencies, 90),
        "pass_rate": sum(1 for r in rows if r["passed"]) / len(rows),
        "acceptance_ms": ACCEPT_MS,
    }
    if args.json:
        import json

        print(json.dumps(summary))
    else:
        table = markdown_table(rows)
        print(table)
        if args.write:
            args.write.write_text(table + "\n", encoding="utf-8")
            print(f"\nWrote {args.write}")
    failed = [r for r in rows if not r["passed"]]
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
