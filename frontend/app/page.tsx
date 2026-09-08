"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useRoomContext,
  useVoiceAssistant,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent } from "livekit-client";
import { Mic, PhoneOff, Radio, ShieldAlert } from "lucide-react";
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
  rime: boolean;
  groq: boolean;
  deepgram: boolean;
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
  if (type === "rime" && event === "streaming") return `Rime streaming ${parsed.engine ?? ""}`;
  if (type === "vad") return "User speech detected (barge-in)";
  if (type === "audio" && event === "rime_playback_aborted") {
    return `Rime playback aborted. Drained ${parsed.drained_frames} frames. Latency ${parsed.interruption_latency_ms}ms`;
  }
  if (type === "fence" && event === "invalidated") {
    const cancelled = Array.isArray(parsed.cancelled) ? parsed.cancelled.join(", ") : "";
    return cancelled ? `Cancelled tool [${cancelled}]` : "Fence advanced";
  }
  if (type === "tool" && event === "lookup_dosage_start") {
    return `lookup_dosage ${parsed.medication} ${parsed.weight_kg} kg`;
  }
  if (type === "metrics") return `Interruption ${parsed.interruption_latency_ms} ms`;
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
          window.setTimeout(() => onStatus("listening"), 700);
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
  const [status, setStatus] = useState<SessionStatus>("listening");
  const [latency, setLatency] = useState<number | null>(null);
  const [ttfa, setTtfa] = useState<number | null>(null);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

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
      return { label: "INTERRUPTING / PURGING", ring: "border-cut text-cut", icon: "cut" as const };
    }
    if (state === "speaking" || status === "speaking") {
      return {
        label: `SPEAKING  ·  RIME ${engine}`,
        ring: "border-amber text-amber",
        icon: "speak" as const,
      };
    }
    return { label: "LISTENING", ring: "border-moss text-moss", icon: "listen" as const };
  }, [engine, state, status]);

  return (
    <div className={`min-h-screen ${status === "interrupting" ? "flash-cut" : ""}`}>
      <SiteNav
        right={
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              void room.disconnect();
              onDisconnect();
            }}
          >
            <PhoneOff className="h-4 w-4" />
            End
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

      <main className="mx-auto max-w-6xl space-y-8 px-5 pb-16 sm:px-8">
        <div className={`relative flex flex-col items-center rounded-3xl border bg-panel px-6 py-10 ${badge.ring}`}>
          <div className={`pulse-ring absolute h-44 w-44 rounded-full border ${badge.ring}`} />
          <div className={`relative flex h-36 w-36 items-center justify-center rounded-full border-2 bg-night ${badge.ring}`}>
            {badge.icon === "cut" ? (
              <ShieldAlert className="h-10 w-10" />
            ) : badge.icon === "speak" ? (
              <Radio className="h-10 w-10" />
            ) : (
              <Mic className="h-10 w-10" />
            )}
          </div>
          <p className="relative mt-8 font-mono text-sm tracking-wide">{badge.label}</p>
          <div className="relative mt-6 w-full max-w-2xl">
            <LiveAudioVisualizer analyser={analyser} active tone={tone} />
          </div>
          <p className="relative mt-3 text-xs text-mist">
            {room.state === ConnectionState.Connected ? "WebRTC connected" : room.state}
            {room.name ? ` · ${room.name}` : ""}
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm uppercase tracking-[0.18em] text-mist">Live metrics</h2>
            <MetricCounters
              lastLatencyMs={latency}
              ttfaMs={ttfa}
              transport="WebRTC 24 kHz PCM"
              engine={`Rime ${engine}`}
            />
            <p className="mt-4 rounded-2xl border border-line bg-panel p-4 text-sm text-mist">
              Stress line: ask for epi at 70 kg, then say{" "}
              <span className="text-amber">Wait, stop. Make it 40 kilograms.</span> The first lookup
              must never be spoken.
            </p>
          </div>
          <div>
            <h2 className="mb-3 text-sm uppercase tracking-[0.18em] text-mist">Event log</h2>
            <EventStreamLog events={events} />
          </div>
        </div>
      </main>
    </div>
  );
}

function Dot({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${on ? "bg-moss" : "bg-cut"}`} />
      <span className="text-mist">{label}</span>
      <span className="text-[#e8eee9]">{on ? "ready" : "missing"}</span>
    </div>
  );
}

export default function Dashboard() {
  const [tokenInfo, setTokenInfo] = useState<TokenPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [stress, setStress] = useState<string | null>(null);
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
      if (!res.ok) throw new Error(json.error || "Token request failed");
      setTokenInfo(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start session");
    } finally {
      setConnecting(false);
    }
  };

  const runStress = async () => {
    setStressing(true);
    setStress(null);
    try {
      const res = await fetch("/api/stress", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.detail || "Stress run failed");
      setStress(
        `P50 ${Number(json.p50_ms).toFixed(3)} ms · P90 ${Number(json.p90_ms).toFixed(3)} ms · pass ${(json.pass_rate * 100).toFixed(0)}%`,
      );
    } catch (err) {
      setStress(err instanceof Error ? err.message : "Stress run failed");
    } finally {
      setStressing(false);
    }
  };

  const engine = `${tokenInfo?.tts.model || "mistv3"}/${tokenInfo?.tts.speaker || "astra"}`;

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
    <div className="min-h-screen">
      <SiteNav
        right={
          <button type="button" className="btn-primary" onClick={() => void connect()} disabled={connecting}>
            <Mic className="h-4 w-4" />
            {connecting ? "Connecting…" : "Start live session"}
          </button>
        }
      />

      <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <p className="text-xs uppercase tracking-[0.24em] text-amber">Field emergency copilot</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight sm:text-6xl">
          Hands on the patient. Voice is the only interface.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-mist">
          ResQ-Voice is a triage copilot for a solo medic doing CPR or hemorrhage control. If you
          mute the speaker, there is nothing left to use. Interrupt mid-sentence. Change the weight.
          The old dose is fenced and never spoken.
        </p>
        {error ? <p className="mt-4 text-sm text-cut">{error}</p> : null}

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {[
            { k: "You speak", d: "Microphone → LiveKit WebRTC room (local server or Cloud)." },
            { k: "The copilot thinks", d: "Groq hears and reasons. Tools look up simulated doses." },
            { k: "Rime answers", d: "Only spoken output. Interrupt and the old audio + dose die." },
          ].map((item) => (
            <div key={item.k} className="rounded-2xl border border-line bg-panel p-4">
              <div className="text-sm font-medium text-amber">{item.k}</div>
              <p className="mt-2 text-sm text-mist">{item.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          <section className="rounded-3xl border border-line bg-panel p-6 lg:col-span-2">
            <h2 className="text-sm uppercase tracking-[0.18em] text-mist">Demo script · 4 minutes</h2>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed text-[#d7e0dc]">
              <li>
                <span className="font-mono text-amber">1.</span> User: solo medic, both hands occupied.
                Mute the speaker and the product is gone.
              </li>
              <li>
                <span className="font-mono text-amber">2.</span> Normal: “Cue me airway, then
                compressions.” Hear short spoken lines. No lists. No SSML.
              </li>
              <li>
                <span className="font-mono text-amber">3.</span> Stress: “Epi for 70 kilograms.” While it
                talks or looks up, say “Wait, stop. Forty kilograms.”
              </li>
              <li>
                <span className="font-mono text-amber">4.</span> Prove it: status goes INTERRUPTING,
                fence cancels lookup_dosage, latency under 150 ms, Rime stays the mouth.
              </li>
            </ol>
          </section>
          <section className="rounded-3xl border border-line bg-panel p-6">
            <h2 className="text-sm uppercase tracking-[0.18em] text-mist">Preflight</h2>
            <div className="mt-4 space-y-2">
              <Dot on={Boolean(health?.livekit)} label="LiveKit WebRTC" />
              <Dot on={Boolean(health?.rime)} label="Rime TTS key" />
              <Dot on={Boolean(health?.groq)} label="Groq LLM" />
              <Dot on={Boolean(health?.deepgram)} label="Deepgram STT" />
            </div>
            <p className="mt-4 text-xs text-mist">
              LiveKit is already set to local <code>ws://127.0.0.1:7880</code> (devkey). Start it with{" "}
              <code>docker compose up -d</code>. Paste Groq into repo-root <code>.env</code>. Deepgram is
              optional.
            </p>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-line bg-panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm uppercase tracking-[0.18em] text-mist">Repeatable stress fixture</h2>
              <p className="mt-2 text-sm text-mist">
                Runs the same fence + playback abort the agent uses. No LiveKit required. Paste into
                evidence if you re-run before recording.
              </p>
            </div>
            <button type="button" className="btn-ghost" onClick={() => void runStress()} disabled={stressing}>
              {stressing ? "Running…" : "Run 3 trials"}
            </button>
          </div>
          {stress ? <p className="mt-4 font-mono text-sm text-amber">{stress}</p> : null}
        </section>
      </main>
    </div>
  );
}
