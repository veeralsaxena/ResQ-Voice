"use client";

import { useEffect, useRef } from "react";

export type LogEvent = {
  id: string;
  clock: string;
  level: "rime" | "vad" | "audio" | "fence" | "tool" | "session" | "agent";
  message: string;
};

const DOT: Record<LogEvent["level"], string> = {
  rime: "bg-amber",
  vad: "bg-moss",
  audio: "bg-cut",
  fence: "bg-[#8b7ec8]",
  tool: "bg-[#6ec4d0]",
  session: "bg-mist",
  agent: "bg-[#d9c27a]",
};

export default function EventStreamLog({ events }: { events: LogEvent[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  return (
    <div
      ref={scroller}
      className="h-[300px] overflow-y-auto rounded-2xl border border-line bg-night/60 p-4 font-mono text-xs leading-6"
    >
      {events.length === 0 ? (
        <p className="text-mist">No events yet. Start a session or run the stress fixture.</p>
      ) : (
        events.map((ev) => (
          <div key={ev.id} className="flex gap-3">
            <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[ev.level]}`} />
            <span className="shrink-0 text-mist">[{ev.clock}]</span>
            <span className="uppercase text-amber/80">{ev.level}</span>
            <span className="text-[#e8eee9]">{ev.message}</span>
          </div>
        ))
      )}
    </div>
  );
}
