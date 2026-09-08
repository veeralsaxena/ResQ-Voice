import type { ReactNode } from "react";

export default function SiteNav({ right }: { right?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-4 px-5 py-5 sm:px-8">
      <a href="/" className="flex items-baseline gap-2">
        <span className="text-lg font-semibold tracking-tight">ResQ</span>
        <span className="text-xs uppercase tracking-[0.22em] text-mist">Voice</span>
      </a>
      <div className="flex items-center gap-2">{right}</div>
    </header>
  );
}
