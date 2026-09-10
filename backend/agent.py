"""ResQ-Voice agent: LiveKit + Rime mistv3, barge-in, and tool fencing.

Hard voice problem (judged):
  When the medic interrupts, truncate Rime playback quickly, cancel in-flight
  dosage lookups, and never speak a stale tool result.

Rime is the only TTS path. Speech recognition, LLM, VAD, and transport are
owned by this application.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv

from fence import ToolFence
from metrics import MetricsBus
from playback import RimePlaybackBuffer
from tools import lookup_dosage, protocol_step

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv()

from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    RunContext,
    TurnHandlingOptions,
    UserStateChangedEvent,
    function_tool,
    room_io,
)
from livekit.agents.voice import AgentStateChangedEvent
from livekit.plugins import deepgram, openai, rime, silero

logger = logging.getLogger("resq.agent")
logging.basicConfig(level=logging.INFO)

RIME_MODEL = os.getenv("RIME_MODEL", "mistv3")
RIME_SPEAKER = os.getenv("RIME_SPEAKER", "astra")
RIME_LANG = os.getenv("RIME_LANG", "en")
RIME_ENDPOINT = os.getenv("RIME_ENDPOINT", "https://users.rime.ai/v1/rime-tts")
DEEPGRAM_MODEL = os.getenv("DEEPGRAM_MODEL", "nova-2")

INSTRUCTIONS = """
You are ResQ-Voice, an emergency triage voice assistant. Your user is a field
medic or solo paramedic. Their hands and eyes are on the patient. Speech is the
only interface.

VOICE OUTPUT GUIDELINES
You are generating text that will be spoken aloud by a Rime text-to-speech
engine. Write for the ear, not the page.

- Keep spoken sentences under 20 words. Under 15 is better.
- Use plain text conversational fillers naturally when starting a turn or
  confirming a step: Um, Right, Understood, Okay, Yeah.
- Sprinkle fillers. Do not stack them.
- Never use SSML, markdown lists, bullet points, asterisks, or formatting tags.
  Speak pure colloquial English.
- Punctuation is your only prosody tool. Commas pause. Periods fall. Question
  marks rise. Ellipses trail.
- If interrupted, drop the previous instruction immediately. Do not finish the
  old sentence. Do not mention that you were interrupted unless asked.
- Never read a dosage, protocol, or number that came from a cancelled lookup.
  If a tool says cancelled or stale, do not invent the old number.
- This is a training copilot with simulated tables only. Say that once when
  giving a dose. You are not a licensed clinician.
- For medication identifiers that must be spelled, wrap them in spell().
- When the medic asks for a weight-based dose, call lookup_dosage.
- When they ask for the next step, call cue_protocol.

Examples:
Bad: I can certainly assist you with calculating an appropriate epinephrine dose.
Good: Um, one sec. I'll look up that epi dose.

Bad: Unfortunately I am required to inform you that...
Good: Understood. Stopping. What do you need instead?
""".strip()


GROQ_BASE_URL = "https://api.groq.com/openai/v1"


def _present(value: str | None) -> bool:
    if not value:
        return False
    lowered = value.lower()
    return "your_" not in lowered and "your-" not in lowered


def build_llm():
    if os.getenv("USE_LOCAL_LLM", "").lower() in ("true", "1", "yes"):
        model = os.getenv("OLLAMA_MODEL", "qwen3:8b")
        logger.info("LLM: Local Ollama OSS model %s", model)
        return openai.LLM(
            model=model,
            api_key="ollama",
            base_url="http://localhost:11434/v1",
        )
    groq_key = os.getenv("GROQ_API_KEY")
    if _present(groq_key):
        raw_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b").strip()
        if raw_model in ("gpt-oss-20b", "gpt oss 20b", "gpt-oss", "oss-20b", "llama-3.3-70b-versatile"):
            model = "openai/gpt-oss-20b"
        elif raw_model in ("gpt-oss-120b", "gpt oss 120b"):
            model = "openai/gpt-oss-120b"
        else:
            model = raw_model
        logger.info("LLM: Groq model %s", model)
        return openai.LLM(
            model=model,
            api_key=groq_key,
            base_url=GROQ_BASE_URL,
        )
    return openai.LLM(model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"))


def build_stt():
    dg = os.getenv("DEEPGRAM_API_KEY")
    if _present(dg):
        return deepgram.STT(model=DEEPGRAM_MODEL)
    groq_key = os.getenv("GROQ_API_KEY")
    if _present(groq_key):
        logger.info("STT: Groq whisper-large-v3-turbo (no Deepgram key)")
        return openai.STT(
            model=os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo"),
            api_key=groq_key,
            base_url=GROQ_BASE_URL,
        )
    openai_key = os.getenv("OPENAI_API_KEY")
    if _present(openai_key):
        logger.info("STT: OpenAI whisper-1")
        return openai.STT(model="whisper-1")
    raise RuntimeError(
        "Set DEEPGRAM_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY for speech recognition before the demo."
    )


def _load_vad():
    try:
        return silero.VAD.load(min_speech_duration=0.1, min_silence_duration=0.3)
    except TypeError:
        return silero.VAD.load()


def build_tts() -> rime.TTS:
    return rime.TTS(
        model=RIME_MODEL,
        speaker=RIME_SPEAKER,
        speed_alpha=1.0,
        use_websocket=True,
        segment="immediate",
        lang="eng",
    )


class ResQAgent(Agent):
    def __init__(self, fence: ToolFence, bus: MetricsBus, playback: RimePlaybackBuffer) -> None:
        super().__init__(instructions=INSTRUCTIONS)
        self.fence = fence
        self.bus = bus
        self.playback = playback

    @function_tool()
    async def lookup_dosage(
        self,
        context: RunContext,
        patient_weight_kg: float,
        medication: str,
    ) -> str:
        """Look up a simulated weight-based medication dose.

        Args:
            patient_weight_kg: Patient mass in kilograms.
            medication: Medication name such as epinephrine, naloxone, midazolam.
        """
        await self.bus.emit(
            {
                "type": "tool",
                "event": "lookup_dosage_start",
                "medication": medication,
                "weight_kg": patient_weight_kg,
            }
        )
        result = await lookup_dosage(self.fence, patient_weight_kg, medication)
        await self.bus.emit(
            {
                "type": "tool",
                "event": "lookup_dosage_end",
                "ok": result.get("ok"),
                "cancelled": result.get("cancelled"),
                "stale": result.get("stale"),
            }
        )
        if result.get("cancelled") or result.get("stale"):
            return result["spoken"]
        return result.get("spoken") or "I lost that lookup. Ask me again."

    @function_tool()
    async def cue_protocol(self, context: RunContext, step: str) -> str:
        """Speak the next trauma or CPR checklist cue.

        Args:
            step: One of scene, airway, breathing, circulation, disability,
                exposure, cpr, bleed.
        """
        result = await protocol_step(step)
        return result["spoken"]


server = AgentServer()


@server.rtc_session()
async def resq_session(ctx: JobContext) -> None:
    bus = MetricsBus()
    fence = ToolFence()
    playback = RimePlaybackBuffer()

    async def emit(payload: dict) -> None:
        await bus.emit(payload)

    fence.set_emitter(emit)
    playback.set_emitter(emit)

    agent = ResQAgent(fence=fence, bus=bus, playback=playback)

    agent_speaking = False

    session = AgentSession(
        vad=_load_vad(),
        stt=build_stt(),
        llm=build_llm(),
        tts=build_tts(),
        turn_handling=TurnHandlingOptions(
            interruption={
                "enabled": True,
                "mode": "vad",
                "min_duration": 0.1,
                "resume_false_interruption": False,
            }
        ),
    )

    barge_in_lock = asyncio.Lock()

    async def handle_barge_in(source: str) -> None:
        async with barge_in_lock:
            vad_trigger = time.monotonic()
            await bus.emit(
                {
                    "type": "vad",
                    "event": "user_speech_detected",
                    "source": source,
                    "vad_trigger_time": vad_trigger,
                }
            )
            halt = await playback.abort(vad_trigger)
            snapshot = await fence.invalidate(reason="barge_in")
            try:
                session.interrupt()
            except Exception:
                logger.exception("session.interrupt failed")
            await bus.emit(
                {
                    "type": "metrics",
                    "event": "interruption",
                    "vad_trigger_time": halt.vad_trigger_time,
                    "rime_audio_halt_time": halt.rime_audio_halt_time,
                    "interruption_latency_ms": round(halt.interruption_latency_ms, 2),
                    "drained_frames": halt.drained_frames,
                    "cancelled_tools": snapshot.cancelled_names,
                }
            )

    @session.on("user_state_changed")
    def on_user_state(ev: UserStateChangedEvent) -> None:
        if ev.new_state != "speaking":
            return
        if not (agent_speaking or playback.speaking or fence.has_inflight):
            return
        asyncio.create_task(handle_barge_in("user_state_changed"))

    @session.on("agent_state_changed")
    def on_agent_state(ev: AgentStateChangedEvent) -> None:
        nonlocal agent_speaking
        agent_speaking = ev.new_state == "speaking"

        async def _sync() -> None:
            await bus.emit(
                {
                    "type": "agent",
                    "event": "state",
                    "state": ev.new_state,
                    "rime_model": RIME_MODEL,
                    "rime_speaker": RIME_SPEAKER,
                }
            )
            if ev.new_state == "speaking":
                await playback.start_utterance()
            elif ev.new_state in ("listening", "idle", "thinking"):
                playback._speaking = False

        asyncio.create_task(_sync())

    @session.on("speech_created")
    def on_speech_created(ev) -> None:
        asyncio.create_task(playback.start_utterance())
        asyncio.create_task(
            bus.emit(
                {
                    "type": "rime",
                    "event": "streaming",
                    "source": getattr(ev, "source", None),
                    "engine": f"{RIME_MODEL}/{RIME_SPEAKER}",
                }
            )
        )

    await session.start(
        room=ctx.room,
        agent=agent,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(),
        ),
    )
    bus.attach(ctx.room)

    await bus.emit(
        {
            "type": "session",
            "event": "started",
            "tts": {
                "provider": "rime",
                "model": RIME_MODEL,
                "speaker": RIME_SPEAKER,
                "lang": RIME_LANG,
                "endpoint": RIME_ENDPOINT,
                "audio_format": "pcm",
                "sample_rate_hz": 24000,
                "transport": "webrtc",
                "streaming": "websocket",
            },
            "stt": {
                "provider": "deepgram" if _present(os.getenv("DEEPGRAM_API_KEY")) else ("groq-whisper" if _present(os.getenv("GROQ_API_KEY")) else "openai-whisper"),
                "model": DEEPGRAM_MODEL if _present(os.getenv("DEEPGRAM_API_KEY")) else (os.getenv("GROQ_STT_MODEL", "whisper-large-v3-turbo") if _present(os.getenv("GROQ_API_KEY")) else "whisper-1"),
            },
            "llm": {
                "provider": "groq" if _present(os.getenv("GROQ_API_KEY")) else "openai",
            },
        }
    )

    await session.generate_reply(
        instructions=(
            "One short greeting only. Say you are ResQ-Voice. Ask what they need. "
            "Do not list options. Keep it under 12 words to save TTS credits."
        )
    )


if __name__ == "__main__":
    from livekit import agents

    agents.cli.run_app(server)
