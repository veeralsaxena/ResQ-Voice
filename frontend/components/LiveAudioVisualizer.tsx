"use client";

import { useEffect, useRef } from "react";

type Props = {
  analyser: AnalyserNode | null;
  active: boolean;
  tone: "listen" | "speak" | "interrupt" | "idle";
};

export default function LiveAudioVisualizer({ analyser, active, tone }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const barsCount = 48;
    const energy = new Uint8Array(barsCount);

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (analyser && active) {
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(buffer);
        for (let i = 0; i < barsCount; i += 1) {
          const sample = buffer[Math.floor((i / barsCount) * (buffer.length * 0.75))] || 0;
          energy[i] = sample;
        }
      } else {
        const time = performance.now() * 0.003;
        for (let i = 0; i < barsCount; i += 1) {
          if (active) {
            const idleWave = Math.sin(time + i * 0.25) * 14 + 18;
            energy[i] = Math.max(8, idleWave);
          } else {
            energy[i] = Math.max(4, energy[i] * 0.9);
          }
        }
      }

      const barWidth = 3.5;
      const gap = (w - barsCount * barWidth) / (barsCount - 1);

      for (let i = 0; i < barsCount; i += 1) {
        const val = energy[i] / 255;
        const barHeight = Math.max(4, val * (h * 0.85));
        const x = i * (barWidth + gap);
        const y = (h - barHeight) / 2;

        if (tone === "interrupt") {
          ctx.fillStyle = "rgba(244, 63, 94, 0.95)";
        } else if (tone === "speak") {
          ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + val * 0.6})`;
        } else if (tone === "listen") {
          ctx.fillStyle = `rgba(161, 161, 170, ${0.35 + val * 0.65})`;
        } else {
          ctx.fillStyle = "rgba(113, 113, 122, 0.3)";
        }

        // Apple style rounded capsule bars
        ctx.beginPath();
        const r = barWidth / 2;
        ctx.roundRect(x, y, barWidth, barHeight, [r, r, r, r]);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, active, tone]);

  return (
    <canvas
      ref={ref}
      width={760}
      height={80}
      className="h-20 w-full"
    />
  );
}
