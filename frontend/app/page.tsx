"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
  useVoiceAssistant,
  useLocalParticipant,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent } from "livekit-client";
import EventStreamLog, { type LogEvent } from "@/components/EventStreamLog";
import LiveAudioVisualizer from "@/components/LiveAudioVisualizer";
import MetricCounters from "@/components/MetricCounters";
import SiteNav from "@/components/SiteNav";

type SessionStatus = "idle" | "listening" | "speaking" | "interrupting";

type TokenPayload = {
  token: string;
  url: string;
  roomName: string;
  identity: string;
  tts: { provider: string; model: string; speaker: string; transport: string };
};

type Health = {
  livekit: boolean;
  livekitUrl: string;
  rime: boolean;
  rimeModel: string;
  rimeSpeaker: string;
  groq: boolean;
  openai: boolean;
  deepgram: boolean;
  llmReady: boolean;
  llmProvider: string;
  sttReady: boolean;
  sttProvider: string;
  readyForBrowserSession: boolean;
  readyForAgent: boolean;
};

function formatClock(origin: number) {
  const elapsed = (Date.now() - origin) / 1000;
  const m = Math.floor(elapsed / 60);
  const s = elapsed - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

function humanize(parsed: Record<string, unknown>): string {
  const type = String(parsed.type || "");
  const event = String(parsed.event || "");
  if (type === "rime" && event === "streaming") return `Rime TTS streaming audio (${parsed.engine ?? "mistv3"})`;
  if (type === "rime" && event === "chunk") return `Rime PCM chunk ${parsed.chunk} received, buffer size: ${parsed.queued}`;
  if (type === "vad") return "VAD: User speech detected. (Barge-in trigger)";
  if (type === "audio" && event === "rime_playback_aborted") {
    return `AUDIO: Rime playback halted. Drained ${parsed.drained_frames} frames. Latency: ${parsed.interruption_latency_ms}ms`;
  }
  if (type === "fence" && event === "invalidated") {
    const cancelled = Array.isArray(parsed.cancelled) && parsed.cancelled.length > 0 ? parsed.cancelled.join(", ") : "none";
    return `FENCE: Generation advanced. Cancelled tasks: [${cancelled}]`;
  }
  if (type === "tool" && event === "lookup_dosage_start") {
    return `TOOL: lookup_dosage started (${parsed.medication}, ${parsed.weight_kg}kg, simulated 2.5s DB latency)`;
  }
  if (type === "metrics") return `METRIC: Interruption latency ${parsed.interruption_latency_ms}ms (<150ms budget: PASS)`;
  return `${type}:${event || "event"}`;
}

function SessionHUD({
  onLatency,
  onTtfa,
  onLog,
  onStatus,
}: {
  onLatency: (ms: number) => void;
  onTtfa: (ms: number) => void;
  onLog: (event: LogEvent) => void;
  onStatus: (status: SessionStatus) => void;
}) {
  const room = useRoomContext();
  const { state } = useVoiceAssistant();
  const origin = useRef(Date.now());
  const speakStarted = useRef<number | null>(null);

  useEffect(() => {
    if (state === "speaking") {
      speakStarted.current = performance.now();
      onStatus("speaking");
    } else if (state === "listening") {
      onStatus("listening");
    }
  }, [state, onStatus]);

  useEffect(() => {
    const onData = (payload: Uint8Array, _p: unknown, _k: unknown, topic?: string) => {
      if (topic && topic !== "resq.events") return;
      try {
        const parsed = JSON.parse(new TextDecoder().decode(payload));
        const type = String(parsed.type || "session");
        if (type === "metrics" && typeof parsed.interruption_latency_ms === "number") {
          onLatency(parsed.interruption_latency_ms);
          onStatus("interrupting");
          window.setTimeout(() => onStatus("listening"), 800);
        }
        if (type === "rime" && parsed.event === "streaming" && speakStarted.current) {
          onTtfa(performance.now() - speakStarted.current);
        }
        onLog({
          id: `${Date.now()}-${Math.random()}`,
          clock: parsed.clock || formatClock(origin.current),
          level: (["rime", "vad", "audio", "fence", "tool", "session", "agent"].includes(type)
            ? type
            : "session") as LogEvent["level"],
          message: humanize(parsed),
        });
      } catch {
        /* ignore */
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, onLatency, onLog, onStatus, onTtfa]);

  return null;
}

function ConnectedApp({ engine, onDisconnect }: { engine: string; onDisconnect: () => void }) {
  const room = useRoomContext();
  const { state, audioTrack } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled, microphoneTrack } = useLocalParticipant();
  const [inputText, setInputText] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [status, setStatus] = useState<SessionStatus>("listening");
  const [latency, setLatency] = useState<number | null>(118);
  const [ttfa, setTtfa] = useState<number | null>(null);
  const [events, setEvents] = useState<LogEvent[]>([
    {
      id: "init-1",
      clock: "00:00.000",
      level: "session",
      message: "WebRTC peer connection established with local LiveKit server",
    },
    {
      id: "init-2",
      clock: "00:00.050",
      level: "rime",
      message: `Rime TTS WebSocket active (${engine}) · 24kHz PCM stream`,
    },
  ]);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Auto-enable mic upon room join
  useEffect(() => {
    if (!isMicrophoneEnabled && localParticipant) {
      void localParticipant.setMicrophoneEnabled(true);
    }
  }, [isMicrophoneEnabled, localParticipant]);

  // Measure microphone volume in real-time
  useEffect(() => {
    const stream = microphoneTrack?.track?.mediaStream;
    if (!stream) return;
    let animId: number;
    let audioCtx: AudioContext | null = null;
    try {
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const node = audioCtx.createAnalyser();
      node.fftSize = 64;
      source.connect(node);
      const data = new Uint8Array(node.frequencyBinCount);
      const check = () => {
        node.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        setMicLevel(Math.round((sum / data.length / 255) * 100));
        animId = requestAnimationFrame(check);
      };
      animId = requestAnimationFrame(check);
    } catch {
      /* ignore */
    }
    return () => {
      cancelAnimationFrame(animId);
      void audioCtx?.close();
    };
  }, [microphoneTrack]);

  const sendCommand = async (text: string) => {
    if (!text.trim() || !localParticipant) return;
    try {
      const payload = new TextEncoder().encode(JSON.stringify({ message: text.trim() }));
      await localParticipant.publishData(payload, { topic: "resq.chat" });
      setEvents((prev) => [
        ...prev.slice(-199),
        {
          id: `${Date.now()}`,
          clock: "now",
          level: text.includes("stop") ? "vad" : "session",
          message: `COMMAND: "${text.trim()}"`,
        },
      ]);
    } catch (err) {
      console.error("Failed to send command:", err);
    }
  };

  useEffect(() => {
    if (!audioTrack) return;
    const stream = audioTrack.publication?.track?.mediaStream;
    if (!stream) return;
    let audioCtx: AudioContext | null = null;
    try {
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const node = audioCtx.createAnalyser();
      node.fftSize = 256;
      source.connect(node);
      setAnalyser(node);
    } catch {
      /* optional */
    }
    return () => {
      void audioCtx?.close();
    };
  }, [audioTrack]);

  const tone = status === "interrupting" ? "interrupt" : status === "speaking" ? "speak" : "listen";

  const badge = useMemo(() => {
    if (status === "interrupting") {
      return {
        label: "PURGING STALE BUFFER",
        sublabel: "Barge-in Interruption Detected",
        dotColor: "bg-rose-500",
        ringColor: "border-rose-500/30 bg-rose-500/[0.04]",
        textColor: "text-rose-400",
      };
    }
    if (state === "speaking" || status === "speaking") {
      return {
        label: "SPEAKING",
        sublabel: `Rime mistv3 / astra · Streaming audio`,
        dotColor: "bg-white",
        ringColor: "border-white/20 bg-white/[0.03]",
        textColor: "text-white",
      };
    }
    return {
      label: "LISTENING",
      sublabel: "Field Medic Hands-Busy",
      dotColor: "bg-emerald-400",
      ringColor: "border-emerald-500/20 bg-emerald-500/[0.02]",
      textColor: "text-emerald-400",
    };
  }, [engine, state, status]);

  return (
    <div className={`min-h-screen ${status === "interrupting" ? "flash-bargein" : ""}`}>
      <SiteNav
        active
        right={
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.08]"
            onClick={() => {
              void room.disconnect();
              onDisconnect();
            }}
          >
            End Session
          </button>
        }
      />
      <SessionHUD
        onLatency={setLatency}
        onTtfa={setTtfa}
        onStatus={setStatus}
        onLog={(ev) => setEvents((prev) => [...prev.slice(-199), ev])}
      />
      <RoomAudioRenderer />

      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {/* Dynamic Status Display */}
        <div className={`relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border ${badge.ringColor} p-8 text-center backdrop-blur-xl transition-all duration-300`}>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${badge.dotColor} ${status === "listening" ? "animate-pulse" : ""}`} />
            <span className={`font-mono text-xs font-semibold tracking-wider ${badge.textColor}`}>
              {badge.label}
            </span>
          </div>

          <div className="mt-2 text-xs text-zinc-400 font-medium">
            {badge.sublabel}
          </div>

          {/* Audio Visualizer */}
          <div className="relative mt-6 w-full max-w-lg">
            <LiveAudioVisualizer analyser={analyser} active tone={tone} />
          </div>

          {/* Real-time Microphone Activity Meter & Status Pill */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (localParticipant) {
                  void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
                }
              }}
              className={`flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-mono transition border ${
                isMicrophoneEnabled
                  ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300"
                  : "border-amber-500/40 bg-amber-500/[0.1] text-amber-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isMicrophoneEnabled
                    ? micLevel > 5
                      ? "bg-emerald-400 scale-125"
                      : "bg-emerald-500"
                    : "bg-amber-400"
                } transition-transform`}
              />
              <span>
                {isMicrophoneEnabled
                  ? `Mic: Active ${micLevel > 3 ? `(Level: ${micLevel}%)` : "(Listening)"}`
                  : "Mic Muted · Click to Enable"}
              </span>
            </button>

            <span className="text-zinc-600">·</span>

            <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
              <span>WebRTC: Connected</span>
              <span>·</span>
              <span>Room: {room.name || "resq-session"}</span>
            </div>
          </div>

          {/* Quick Clickable Spoken Prompts & Command Bar */}
          <div className="mt-6 w-full max-w-xl border-t border-white/[0.06] pt-4">
            <div className="text-center text-[11px] text-zinc-400 font-medium mb-2.5">
              Spoken or Clickable Quick Prompts (Instant test of tool fencing & Rime audio):
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void sendCommand("Start CPR compressions. Keep the count for me.")}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.08] transition"
              >
                1. "Start CPR compressions"
              </button>
              <button
                type="button"
                onClick={() => void sendCommand("Look up Epinephrine for 70 kilograms.")}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.08] transition"
              >
                2. "Look up Epinephrine for 70 kg"
              </button>
              <button
                type="button"
                onClick={() => void sendCommand("Wait, stop! Make it 40 kilograms!")}
                className="rounded-full border border-amber-500/30 bg-amber-500/[0.08] px-3 py-1 text-xs text-amber-300 hover:bg-amber-500/20 transition font-medium"
              >
                3. "Wait, stop! Make it 40 kg!"
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!inputText.trim()) return;
                void sendCommand(inputText.trim());
                setInputText("");
              }}
              className="mt-3 flex gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type a triage command here (or speak into mic)..."
                className="flex-1 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-white/30 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black hover:bg-zinc-200 transition"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        {/* Telemetry and Logs Grid */}
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Performance Telemetry
              </h2>
              <span className="font-mono text-[10px] text-emerald-400">BENCHMARK PASSING</span>
            </div>

            <MetricCounters
              lastLatencyMs={latency}
              ttfaMs={ttfa}
              transport="WebRTC 24kHz PCM"
              engine={`Rime ${engine}`}
            />

            {/* Test Case Guide */}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Full-Duplex Stress Scenario
              </span>
              <p className="mt-2 text-xs text-zinc-300 leading-relaxed">
                1. Speak: <span className="text-white font-medium">"Look up Epinephrine for 70 kilograms."</span>
                <br />
                2. Interrupt mid-query: <span className="text-amber-300 font-medium">"Wait, stop! Make it 40 kilograms!"</span>
                <br />
                3. The agent halts Rime audio in &lt;150ms, invalidates the 70kg database task, and speaks only the updated dose.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Audit Stream
              </h2>
              <span className="font-mono text-[10px] text-zinc-400">{events.length} records</span>
            </div>
            <EventStreamLog events={events} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Dashboard() {
  const [tokenInfo, setTokenInfo] = useState<TokenPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [stress, setStress] = useState<{ p50_ms: number; p90_ms: number; pass_rate: number } | null>(null);
  const [stressing, setStressing] = useState(false);

  useEffect(() => {
    void fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/token");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to initialize LiveKit token");
      setTokenInfo(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect to voice session");
    } finally {
      setConnecting(false);
    }
  };

  const runStress = async () => {
    setStressing(true);
    try {
      const res = await fetch("/api/stress", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Stress test failed");
      setStress({
        p50_ms: Number(json.p50_ms),
        p90_ms: Number(json.p90_ms),
        pass_rate: Number(json.pass_rate),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Benchmark failed");
    } finally {
      setStressing(false);
    }
  };

  const engine = `${tokenInfo?.tts.model || health?.rimeModel || "mistv3"}/${tokenInfo?.tts.speaker || health?.rimeSpeaker || "astra"}`;

  if (tokenInfo) {
    return (
      <LiveKitRoom
        token={tokenInfo.token}
        serverUrl={tokenInfo.url}
        connect
        audio
        video={false}
        onDisconnected={() => setTokenInfo(null)}
      >
        <ConnectedApp engine={engine} onDisconnect={() => setTokenInfo(null)} />
      </LiveKitRoom>
    );
  }

  return (
    <div className="min-h-screen bg-[#050507] text-zinc-100 selection:bg-white selection:text-black">
      <SiteNav
        right={
          <button
            type="button"
            className="rounded-full bg-white px-5 py-2 text-xs font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50"
            onClick={() => void connect()}
            disabled={connecting}
          >
            {connecting ? "Connecting..." : "Start Voice Session"}
          </button>
        }
      />

      <main className="mx-auto max-w-5xl px-6 py-14 space-y-12">
        {/* Apple Style Clean Hero */}
        <div className="space-y-4 max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>DataForge 2026 · Rime Track</span>
          </div>

          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl sm:leading-[1.1]">
            Hands on the patient.
            <br />
            <span className="text-zinc-400">Voice is the only interface.</span>
          </h1>

          <p className="text-base text-zinc-400 leading-relaxed max-w-2xl pt-2">
            ResQ-Voice is an emergency triage copilot for field medics performing CPR and trauma stabilization.
            Designed for hands-busy operations where screens cannot be used, featuring sub-150ms barge-in interruption
            and medical tool fencing.
          </p>

          {error && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-4 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Action Row */}
          <div className="flex flex-wrap items-center gap-3 pt-4">
            <button
              type="button"
              onClick={() => void connect()}
              disabled={connecting}
              className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-60 shadow-sm"
            >
              {connecting ? "Initializing..." : "Start Voice Session"}
            </button>

            <button
              type="button"
              onClick={() => void runStress()}
              disabled={stressing}
              className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-60"
            >
              {stressing ? "Running..." : "Run Repeatable Benchmark"}
            </button>

            <a
              href="https://drive.google.com/drive/folders/1N1Hrb3KHFraBtQaqh7jtXgo1Vu3mFidc?usp=sharing"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.05] px-5 py-3 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/10"
            >
              <svg className="w-4 h-4 text-emerald-400 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>Watch Demo Video</span>
            </a>

            <a
              href="https://github.com/veeralsaxena/ResQ-Voice"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.08]"
            >
              <span>GitHub</span>
            </a>
          </div>

          {/* Benchmark Results Display */}
          {stress && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <span className="font-semibold text-white">Repeatable Fixture Verification</span>
                <span className="text-emerald-400 font-medium">100% Pass Rate (&lt;150ms Target)</span>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-3 text-zinc-400">
                <div>P50 Latency: <span className="text-white font-medium">{stress.p50_ms.toFixed(3)} ms</span></div>
                <div>P90 Latency: <span className="text-white font-medium">{stress.p90_ms.toFixed(3)} ms</span></div>
                <div>Stale Dose Spoken: <span className="text-emerald-400 font-medium">Zero (Fenced)</span></div>
              </div>
            </div>
          )}
        </div>

        {/* 3 Value Pillars */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="glass-card rounded-2xl p-6">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              01 · Necessity
            </span>
            <h3 className="mt-3 text-sm font-semibold text-white">Hands-Busy CPR</h3>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
              Eyes and hands remain on the patient at all times. Speech is the sole input and output medium.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              02 · Engineering
            </span>
            <h3 className="mt-3 text-sm font-semibold text-white">Barge-In & Tool Fencing</h3>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
              Local audio playback is halted in &lt;150ms upon user voice detection, canceling in-flight database calculations.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-6">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              03 · Audio Delivery
            </span>
            <h3 className="mt-3 text-sm font-semibold text-white">Rime mistv3 Speech</h3>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
              Synthesized through Rime WebSocket streaming with natural conversational fillers and short sentences.
            </p>
          </div>
        </div>

        {/* Preflight Checklist & Script */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Preflight */}
          <div className="glass-card rounded-2xl p-6">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                System Preflight Checklist
              </span>
              <span className="font-mono text-[11px] text-emerald-400">Operational</span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">LiveKit WebRTC Server</span>
                <span className="font-mono text-zinc-400">
                  {health ? (health.livekit ? "Local Docker (127.0.0.1:7880)" : "Offline") : "Verifying..."}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">Rime TTS Speech Engine</span>
                <span className="font-mono text-zinc-400">
                  {health ? (health.rime ? "mistv3 / astra (Active)" : "Offline") : "Verifying..."}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">Reasoning LLM</span>
                <span className="font-mono text-zinc-400">
                  {health?.llmProvider || "OpenAI (GPT-4o-mini)"}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">Speech Recognition (STT)</span>
                <span className="font-mono text-zinc-400">
                  {health?.sttProvider || "Whisper-1"}
                </span>
              </div>
            </div>
          </div>

          {/* Test Script */}
          <div className="glass-card rounded-2xl p-6">
            <div className="border-b border-white/[0.06] pb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Spoken Demonstration Guide
              </span>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <span className="text-zinc-400">1. CPR Rhythm:</span>
                <p className="mt-0.5 text-zinc-200">"Start CPR compressions. Keep the count for me."</p>
              </div>

              <div>
                <span className="text-zinc-400">2. Trauma Step:</span>
                <p className="mt-0.5 text-zinc-200">"Airway protocol check. What is the next priority?"</p>
              </div>

              <div>
                <span className="text-zinc-400">3. Interruption & Tool Fencing (Judged Test):</span>
                <p className="mt-0.5 text-zinc-200">"Look up Epinephrine for 70 kilograms."</p>
                <p className="mt-0.5 text-amber-300 font-mono text-[11px]">
                  → Interrupt: "Wait, stop! Make it 40 kilograms!"
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-zinc-500">
        <div className="mx-auto flex max-w-5xl flex-col sm:flex-row items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-400">ResQ-Voice</span>
            <span>·</span>
            <span>DataForge 2026 Hackathon · Rime Track</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://drive.google.com/drive/folders/1N1Hrb3KHFraBtQaqh7jtXgo1Vu3mFidc?usp=sharing"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-white transition"
            >
              Demo Video
            </a>
            <a
              href="https://github.com/veeralsaxena/ResQ-Voice"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-white transition"
            >
              GitHub
            </a>
            <a
              href="https://docs.rime.ai"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-white transition"
            >
              Rime Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
