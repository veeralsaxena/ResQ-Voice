"""LiveKit data-channel + stdout metrics for barge-in evidence."""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

from livekit import rtc

logger = logging.getLogger("resq.metrics")

DATA_TOPIC = "resq.events"


class MetricsBus:
    def __init__(self, room: Optional[rtc.Room] = None) -> None:
        self.room = room
        self.t0 = time.monotonic()

    def attach(self, room: rtc.Room) -> None:
        self.room = room

    def elapsed_label(self) -> str:
        elapsed = time.monotonic() - self.t0
        minutes = int(elapsed // 60)
        seconds = elapsed - minutes * 60
        return f"{minutes:02d}:{seconds:06.3f}"

    async def emit(self, payload: dict[str, Any]) -> None:
        envelope = {
            **payload,
            "t": time.monotonic(),
            "clock": self.elapsed_label(),
        }
        line = json.dumps(envelope, default=str)
        logger.info("%s", line)
        if self.room is None or self.room.local_participant is None:
            return
        try:
            await self.room.local_participant.publish_data(
                line.encode("utf-8"),
                reliable=True,
                topic=DATA_TOPIC,
            )
        except Exception:
            logger.exception("failed to publish metrics on data channel")
