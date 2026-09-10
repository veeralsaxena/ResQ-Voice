"use client";

import { useEffect, useRef } from "react";

export type LogEvent = {
  id: string;
  clock: string;
  level: "rime" | "vad" | "audio" | "fence" | "tool" | "session" | "agent";
  message: string;
};

const LEVEL_STYLE: Record<LogEvent["level"], { bg: string; text: string; border: string }> = {
  rime: { bg: "bg-white/[0.04]", text: "text-zinc-300", border: "border-white/10" },
  vad: { bg: "bg-amber-500/[0.08]", text: "text-amber-300", border: "border-amber-500/20" },
  audio: { bg: "bg-rose-500/[0.08]", text: "text-rose-300", border: "border-rose-500/20" },
  fence: { bg: "bg-purple-500/[0.08]", text: "text-purple-300", border: "border-purple-500/20" },
  tool: { bg: "bg-white/[0.04]", text: "text-zinc-300", border: "border-white/10" },
  session: { bg: "bg-white/[0.03]", text: "text-zinc-400", border: "border-white/5" },
  agent: { bg: "bg-white/[0.04]", text: "text-zinc-300", border: "border-white/10" },
};

export default function EventStreamLog({ events }: { events: LogEvent[] }) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#09090c] overflow-hidden shadow-sm">
      {/* Console Title Bar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 bg-white/[0.01]">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-zinc-600" />
          <span className="font-mono text-xs font-medium text-zinc-400">audit_stream.log</span>
        </div>
        <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-wider">
          resq.events
        </span>
      </div>

      {/* Console Feed */}
      <div
        ref={scroller}
        className="h-[300px] overflow-y-auto p-4 font-mono text-[11px] leading-relaxed space-y-2 select-text"
      >
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-400 text-xs">
            Awaiting realtime data channel events...
          </div>
        ) : (
          events.map((ev) => {
            const style = LEVEL_STYLE[ev.level] || LEVEL_STYLE.session;
            return (
              <div key={ev.id} className="flex items-start gap-2.5 py-0.5">
                <span className="shrink-0 text-zinc-400 select-none">[{ev.clock}]</span>
                <span
                  className={`inline-block shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase font-semibold border ${style.bg} ${style.text} ${style.border}`}
                >
                  {ev.level}
                </span>
                <span className="text-zinc-300 break-words">{ev.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
