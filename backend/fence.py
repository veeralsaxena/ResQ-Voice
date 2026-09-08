"""Cancellation fence for in-flight medical tools and buffered TTS.

When the medic barges in, every registered lookup is invalidated so a late
dosage result cannot be spoken as if it were still current.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

logger = logging.getLogger("resq.fence")


@dataclass
class ToolTask:
    name: str
    generation: int
    created_at: float
    task: asyncio.Task[Any]
    cancelled: bool = False


@dataclass
class FenceSnapshot:
    generation: int
    cancelled_names: list[str] = field(default_factory=list)
    purged_frames: int = 0
    halt_monotonic: float = 0.0


class ToolFence:
    """Generation-counter fence plus cooperative cancellation.

    Each tool call captures the current generation at start. If the medic
    interrupts, ``invalidate()`` bumps the generation and cancels tasks.
    A tool that finishes after invalidation must drop its result.
    """

    def __init__(self) -> None:
        self._generation = 0
        self._tasks: dict[int, ToolTask] = {}
        self._seq = 0
        self._lock = asyncio.Lock()
        self._on_event: Optional[Callable[[dict[str, Any]], Awaitable[None] | None]] = None
        self.last_snapshot = FenceSnapshot(generation=0)

    def set_emitter(
        self, callback: Callable[[dict[str, Any]], Awaitable[None] | None]
    ) -> None:
        self._on_event = callback

    @property
    def generation(self) -> int:
        return self._generation

    @property
    def has_inflight(self) -> bool:
        return any(not item.task.done() for item in self._tasks.values())

    async def _emit(self, payload: dict[str, Any]) -> None:
        if self._on_event is None:
            return
        result = self._on_event(payload)
        if asyncio.iscoroutine(result):
            await result

    def capture(self) -> int:
        return self._generation

    def is_current(self, generation: int) -> bool:
        return generation == self._generation

    async def run(self, name: str, coro: Awaitable[Any]) -> Any:
        generation = self.capture()
        async with self._lock:
            self._seq += 1
            seq = self._seq
            task = asyncio.create_task(self._wrap(name, generation, coro))
            self._tasks[seq] = ToolTask(
                name=name,
                generation=generation,
                created_at=time.monotonic(),
                task=task,
            )
        try:
            return await task
        finally:
            async with self._lock:
                self._tasks.pop(seq, None)

    async def _wrap(self, name: str, generation: int, coro: Awaitable[Any]) -> Any:
        try:
            result = await coro
        except asyncio.CancelledError:
            logger.info("FENCE: cancelled in-flight tool [%s]", name)
            await self._emit(
                {
                    "type": "fence",
                    "event": "tool_cancelled",
                    "tool": name,
                    "generation": generation,
                }
            )
            raise
        if not self.is_current(generation):
            logger.info("FENCE: dropping stale result from [%s] gen=%s", name, generation)
            await self._emit(
                {
                    "type": "fence",
                    "event": "stale_result_dropped",
                    "tool": name,
                    "generation": generation,
                    "current_generation": self._generation,
                }
            )
            raise StaleToolResult(name)
        return result

    async def invalidate(self, reason: str = "barge_in") -> FenceSnapshot:
        async with self._lock:
            self._generation += 1
            cancelled: list[str] = []
            for item in list(self._tasks.values()):
                if not item.task.done():
                    item.cancelled = True
                    item.task.cancel()
                    cancelled.append(item.name)
            snapshot = FenceSnapshot(
                generation=self._generation,
                cancelled_names=cancelled,
                halt_monotonic=time.monotonic(),
            )
            self.last_snapshot = snapshot

        logger.info(
            "FENCE: generation=%s reason=%s cancelled=%s",
            snapshot.generation,
            reason,
            cancelled,
        )
        await self._emit(
            {
                "type": "fence",
                "event": "invalidated",
                "reason": reason,
                "generation": snapshot.generation,
                "cancelled": cancelled,
            }
        )
        return snapshot


class StaleToolResult(Exception):
    def __init__(self, tool_name: str) -> None:
        super().__init__(f"stale tool result discarded: {tool_name}")
        self.tool_name = tool_name
