"use client";

type Props = {
  lastLatencyMs: number | null;
  ttfaMs: number | null;
  transport: string;
  engine: string;
};

export default function MetricCounters({ lastLatencyMs, ttfaMs, transport, engine }: Props) {
  const isPass = lastLatencyMs !== null && lastLatencyMs < 150;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* Interruption Latency */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            Interruption Latency
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                lastLatencyMs === null
                  ? "bg-zinc-600"
                  : isPass
                  ? "bg-emerald-400"
                  : "bg-rose-500"
              }`}
            />
            <span className="font-mono text-[10px] text-zinc-400">
              {lastLatencyMs === null ? "TARGET <150ms" : isPass ? "PASS (<150ms)" : "OVER BUDGET"}
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="font-mono text-3xl font-light text-white tracking-tight">
            {lastLatencyMs === null ? "—" : Math.round(lastLatencyMs)}
          </span>
          {lastLatencyMs !== null && (
            <span className="font-mono text-xs text-zinc-400">ms</span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-zinc-400 leading-normal">
          Time from VAD user voice detection to full Rime audio truncation
        </p>
      </div>

      {/* Time to First Audio */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
            Time to First Audio
          </span>
          <span className="font-mono text-[10px] text-zinc-400">TTFA</span>
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="font-mono text-3xl font-light text-white tracking-tight">
            {ttfaMs === null ? "—" : Math.round(ttfaMs)}
          </span>
          {ttfaMs !== null && (
            <span className="font-mono text-xs text-zinc-400">ms</span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-zinc-400 leading-normal">
          End of medic turn to first audible streaming chunk delivered
        </p>
      </div>

      {/* Playout Transport */}
      <div className="glass-card rounded-2xl p-5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
          Audio Transport
        </span>
        <div className="mt-3 font-mono text-lg font-normal text-white">
          {transport}
        </div>
        <p className="mt-2 text-[11px] text-zinc-400 leading-normal">
          Local LiveKit WebRTC peer connection (PCM stream)
        </p>
      </div>

      {/* Synthesis Engine */}
      <div className="glass-card rounded-2xl p-5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
          Speech Synthesis
        </span>
        <div className="mt-3 font-mono text-lg font-normal text-white">
          {engine}
        </div>
        <p className="mt-2 text-[11px] text-zinc-400 leading-normal">
          Rime WebSocket real-time voice synthesis engine
        </p>
      </div>
    </div>
  );
}
