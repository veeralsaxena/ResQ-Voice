"""Simulated Rime PCM playback ring used for barge-in halt measurement.

Live sessions still play through LiveKit WebRTC. This buffer mirrors the
local playout queue so we can:
  1. Count drained frames on interrupt.
  2. Timestamp rime_audio_halt_time independently of LLM text.
  3. Run the benchmark harness without a physical speaker.
"""

from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

SAMPLE_RATE_HZ = 24_000
FRAME_DURATION_S = 0.02  # 20 ms PCM frames, typical WebRTC ptime
SAMPLES_PER_FRAME = int(SAMPLE_RATE_HZ * FRAME_DURATION_S)


@dataclass
class HaltReport:
    vad_trigger_time: float
    rime_audio_halt_time: float
    interruption_latency_ms: float
    drained_frames: int
    speaking: bool


class RimePlaybackBuffer:
    def __init__(self, sample_rate: int = SAMPLE_RATE_HZ) -> None:
        self.sample_rate = sample_rate
        self._queue: deque[bytes] = deque()
        self._speaking = False
        self._halt = asyncio.Event()
        self._lock = asyncio.Lock()
        self._chunk_index = 0
        self.last_halt: Optional[HaltReport] = None
        self._on_event: Optional[Callable[[dict], Awaitable[None] | None]] = None

    def set_emitter(self, callback: Callable[[dict], Awaitable[None] | None]) -> None:
        self._on_event = callback

    @property
    def speaking(self) -> bool:
        return self._speaking

    @property
    def queued_frames(self) -> int:
        return len(self._queue)

    async def _emit(self, payload: dict) -> None:
        if self._on_event is None:
            return
        result = self._on_event(payload)
        if asyncio.iscoroutine(result):
            await result

    async def start_utterance(self) -> None:
        async with self._lock:
            self._queue.clear()
            self._speaking = True
            self._halt.clear()
            self._chunk_index = 0
        await self._emit({"type": "rime", "event": "utterance_start"})

    async def push_chunk(self, pcm: bytes | None = None) -> None:
        if pcm is None:
            pcm = b"\x00\x00" * SAMPLES_PER_FRAME
        async with self._lock:
            if not self._speaking:
                return
            self._chunk_index += 1
            idx = self._chunk_index
            self._queue.append(pcm)
        await self._emit(
            {
                "type": "rime",
                "event": "chunk",
                "chunk": idx,
                "queued": len(self._queue),
            }
        )

    async def simulate_stream(self, duration_s: float) -> None:
        """Enqueue a timed stream of silent PCM frames (benchmark / tests)."""
        await self.start_utterance()
        frames = max(1, int(duration_s / FRAME_DURATION_S))
        for _ in range(frames):
            if self._halt.is_set() or not self._speaking:
                return
            await self.push_chunk()
            try:
                await asyncio.wait_for(self._halt.wait(), timeout=FRAME_DURATION_S)
                return
            except asyncio.TimeoutError:
                continue

    async def abort(self, vad_trigger_time: float) -> HaltReport:
        """Truncate playback. Target: halt within 150 ms of VAD trigger."""
        async with self._lock:
            drained = len(self._queue)
            self._queue.clear()
            self._speaking = False
            self._halt.set()
            halt_at = time.monotonic()
            latency_ms = (halt_at - vad_trigger_time) * 1000.0
            report = HaltReport(
                vad_trigger_time=vad_trigger_time,
                rime_audio_halt_time=halt_at,
                interruption_latency_ms=latency_ms,
                drained_frames=drained,
                speaking=False,
            )
            self.last_halt = report

        await self._emit(
            {
                "type": "audio",
                "event": "rime_playback_aborted",
                "drained_frames": drained,
                "interruption_latency_ms": round(latency_ms, 2),
                "vad_trigger_time": vad_trigger_time,
                "rime_audio_halt_time": halt_at,
            }
        )
        return report
