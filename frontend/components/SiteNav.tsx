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

        <div className="hidden md:flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="font-mono text-[11px]">Rime mistv3</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-xs text-zinc-400">
            <span className="font-mono text-[11px]">WebRTC 24kHz</span>
          </div>
          <a
            href="https://drive.google.com/drive/folders/1N1Hrb3KHFraBtQaqh7jtXgo1Vu3mFidc?usp=sharing"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.08] transition"
          >
            <span>Demo Video</span>
            <svg className="w-3 h-3 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <a
            href="https://github.com/veeralsaxena/ResQ-Voice"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.08] transition"
          >
            <span>GitHub</span>
            <svg className="w-3 h-3 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>

        <div className="flex items-center gap-3">{right}</div>
      </div>
    </header>
  );
}
