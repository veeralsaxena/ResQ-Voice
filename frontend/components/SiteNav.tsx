import type { ReactNode } from "react";

export default function SiteNav({ right, active }: { right?: ReactNode; active?: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#050507]/80 backdrop-blur-xl px-6 py-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <a href="/" className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white font-mono text-[11px] font-bold text-black shadow-sm">
            RV
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-tight text-white">ResQ-Voice</span>
            <span className="hidden sm:inline-block text-[11px] font-medium text-zinc-500">
              Field Emergency Triage
            </span>
          </div>
        </a>

        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="font-mono text-[11px]">Rime mistv3</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
            <span className="font-mono text-[11px]">WebRTC 24kHz</span>
          </div>
        </div>

        <div className="flex items-center gap-3">{right}</div>
      </div>
    </header>
  );
}
