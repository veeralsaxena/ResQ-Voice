"use client";

type Props = {
  lastLatencyMs: number | null;
  ttfaMs: number | null;
  transport: string;
  engine: string;
};

function Cell({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-mist">{label}</div>
      <div className="mt-2 font-mono text-2xl text-[#f3f7f4]">{value}</div>
      <div className="mt-1 text-xs text-mist">{hint}</div>
    </div>
  );
}

export default function MetricCounters({ lastLatencyMs, ttfaMs, transport, engine }: Props) {
  const latency =
    lastLatencyMs == null ? "—" : `${Math.round(lastLatencyMs)} ms`;
  const latencyHint =
    lastLatencyMs == null
      ? "Acceptance: halt under 150 ms after VAD"
      : lastLatencyMs < 150
        ? "Inside the 150 ms budget"
        : "Over budget — check headphones / echo";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Cell label="Last interruption" value={latency} hint={latencyHint} />
      <Cell
        label="Time to first audio"
        value={ttfaMs == null ? "—" : `${Math.round(ttfaMs)} ms`}
        hint="This turn, Rime stream start"
      />
      <Cell label="Transport" value={transport} hint="LiveKit WebRTC" />
      <Cell label="Spoken output" value={engine} hint="Rime is the only TTS" />
    </div>
  );
}
