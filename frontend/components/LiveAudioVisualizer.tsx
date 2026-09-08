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
    const bins = 42;
    const data = new Uint8Array(bins);
    const color = tone === "interrupt" ? "#e07a5f" : tone === "speak" ? "#e8b86d" : "#7dba8a";

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      if (analyser && active) {
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(buffer);
        for (let i = 0; i < bins; i += 1) {
          data[i] = buffer[Math.floor((i / bins) * buffer.length)] || 0;
        }
      } else {
        for (let i = 0; i < bins; i += 1) {
          data[i] = Math.max(10, data[i] * 0.88);
        }
      }
      const gap = 4;
      const barW = (width - gap * (bins - 1)) / bins;
      data.forEach((v, i) => {
        const h = Math.max(6, (v / 255) * height * 0.92);
        ctx.globalAlpha = 0.4 + (v / 255) * 0.6;
        ctx.fillStyle = color;
        ctx.fillRect(i * (barW + gap), (height - h) / 2, barW, h);
      });
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser, active, tone]);

  return <canvas ref={ref} width={720} height={110} className="h-24 w-full" />;
}
