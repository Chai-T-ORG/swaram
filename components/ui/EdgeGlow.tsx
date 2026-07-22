"use client";

import { useEffect, useRef, useState } from "react";

interface EdgeGlowProps {
  active: boolean;
  micVolume?: number; // 0–1
  mood?: "thinking" | "success";
}

const STOPS_DARK = {
  thinking: [
    [145, 80, 65], // vivid emerald
    [162, 75, 75], // bright mint
    [130, 70, 60], // lime-green
    [145, 65, 45], // deep emerald
    [170, 72, 70], // cyan-green
    [145, 80, 65],
  ],
  success: [
    [162, 75, 75], // bright mint
    [145, 80, 68], // vivid emerald
    [130, 68, 62], // lime-green
    [145, 80, 68], // vivid emerald
    [162, 75, 75],
  ],
} as const;

// Light mode: rich forest green & emerald perimeter aura
const STOPS_LIGHT = {
  thinking: [
    [145, 65, 38], // rich forest green
    [158, 60, 44], // vibrant emerald
    [135, 65, 36], // deep jade
    [145, 65, 38],
  ],
  success: [
    [158, 60, 44],
    [145, 65, 38],
    [158, 60, 44],
  ],
} as const;

const EDGE_PTS = 80;

/** Wavy perimeter: each edge displaced perpendicularly by a sine + harmonic. */
function wavyPerimeter(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  phase: number,
  amplitude: number
) {
  const freq = 2.5;
  ctx.beginPath();
  for (let edge = 0; edge < 4; edge++) {
    for (let i = 0; i <= EDGE_PTS; i++) {
      const t = i / EDGE_PTS;
      const p = (edge + t) / 4;
      const base = Math.sin(p * Math.PI * 2 * freq * 4 + phase) * amplitude;
      const overtone = Math.sin(p * Math.PI * 2 * freq * 6.3 + phase * 0.7) * amplitude * 0.35;
      const w = base + overtone;

      let x: number, y: number;
      switch (edge) {
        case 0:
          x = t * W;
          y = w;
          break; // top
        case 1:
          x = W - w;
          y = t * H;
          break; // right
        case 2:
          x = W - t * W;
          y = H - w;
          break; // bottom
        default:
          x = w;
          y = H - t * H; // left
      }
      if (edge === 0 && i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

export default function EdgeGlow({ active, micVolume = 0, mood = "thinking" }: EdgeGlowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const drawRef = useRef<((ts: number) => void) | null>(null);
  const startRef = useRef<number>(0);
  const [isDark, setIsDark] = useState<boolean>(false);

  // Live refs — the RAF closure reads these every frame.
  const volRef = useRef<number>(micVolume);
  const targetRef = useRef<number>(active ? 1 : 0);
  const moodRef = useRef<"thinking" | "success">(mood);
  const alphaRef = useRef<number>(0);

  volRef.current = micVolume;
  moodRef.current = mood;
  targetRef.current = active ? 1 : 0;

  // Track light/dark mode for proper compositing
  useEffect(() => {
    const checkTheme = () => {
      setIsDark(
        document.documentElement.classList.contains("dark") ||
          (!document.documentElement.classList.contains("light") &&
            window.matchMedia("(prefers-color-scheme: dark)").matches)
      );
    };
    checkTheme();
    const mo = new MutationObserver(checkTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  // ── Mount: set up canvas + RAF loop once ──────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const setSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setSize();
    window.addEventListener("resize", setSize, { passive: true });

    const draw = (ts: number) => {
      const LERP = 0.055;
      alphaRef.current += (targetRef.current - alphaRef.current) * LERP;

      if (alphaRef.current < 0.004 && targetRef.current === 0) {
        alphaRef.current = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        rafRef.current = null;
        return;
      }

      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const phase = (elapsed / 10_000) * Math.PI * 2;
      const hShift = Math.sin(elapsed / 7_000) * 18;
      const energy = 0.5 + volRef.current * 0.5;
      const amplitude = 3 + energy * 4;

      const darkTheme = document.documentElement.classList.contains("dark");
      const stops = darkTheme ? STOPS_DARK[moodRef.current] : STOPS_LIGHT[moodRef.current];
      const a = alphaRef.current;

      const makeGrad = (opacity: number) => {
        const g = ctx.createLinearGradient(0, 0, W, H);
        stops.forEach(([h, s, l], i) => {
          g.addColorStop(
            i / (stops.length - 1),
            `hsla(${Math.round(h + hShift) % 360},${s}%,${l}%,${opacity * a})`
          );
        });
        return g;
      };

      ctx.globalCompositeOperation = darkTheme ? "screen" : "source-over";

      const moodBoost = moodRef.current === "success" ? 1.3 : 1.0;

      const rectPasses: Array<{ lw: number; op: number }> = darkTheme
        ? [
            { lw: 2, op: 0.75 * moodBoost },
            { lw: 8, op: 0.45 * moodBoost },
            { lw: 20, op: 0.25 * energy * moodBoost },
            { lw: 36, op: 0.12 * energy },
          ]
        : [
            { lw: 2, op: 0.55 * moodBoost },
            { lw: 6, op: 0.35 * moodBoost },
            { lw: 14, op: 0.18 * energy * moodBoost },
          ];

      for (const { lw, op } of rectPasses) {
        const inset = lw / 2;
        ctx.lineWidth = lw;
        ctx.strokeStyle = makeGrad(op);
        ctx.beginPath();
        ctx.rect(inset, inset, W - inset * 2, H - inset * 2);
        ctx.stroke();
      }

      const wavePasses: Array<{ lw: number; op: number }> = darkTheme
        ? [
            { lw: 2.5, op: 0.95 },
            { lw: 6, op: 0.55 },
          ]
        : [
            { lw: 2, op: 0.75 },
            { lw: 4.5, op: 0.45 },
          ];

      for (const { lw, op } of wavePasses) {
        ctx.lineWidth = lw;
        ctx.strokeStyle = makeGrad(op);
        wavyPerimeter(ctx, W, H, phase, amplitude);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = "source-over";
      rafRef.current = requestAnimationFrame(draw);
    };

    drawRef.current = draw;

    return () => {
      window.removeEventListener("resize", setSize);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (active && rafRef.current === null && drawRef.current) {
      startRef.current = 0;
      rafRef.current = requestAnimationFrame(drawRef.current);
    }
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-80 contrast-more:hidden"
      style={{ willChange: "transform", mixBlendMode: isDark ? "screen" : "normal" }}
    />
  );
}
