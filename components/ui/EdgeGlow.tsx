"use client";

/**
 * EdgeGlow — organic wavy screen-edge glow that blends with a clean rect.
 *
 * Rendering:
 *   Layer A — clean rectangle strokes (gives sharpness/structure)
 *   Layer B — wavy perimeter strokes (organic breathing flow)
 *   Both composited with "screen" blend → layers add as light naturally.
 *
 * Fade in/out:
 *   A single RAF loop always owns the canvas.
 *   `alphaRef` lerps toward 0 or 1 each frame (0.06 step → ~800 ms fade).
 *   Loop self-terminates when fully faded out and auto-restarts when active.
 *
 * No shadowBlur → no GPU blur cost.
 */

import { useEffect, useRef } from "react";

interface EdgeGlowProps {
  active: boolean;
  micVolume?: number;   // 0–1
  mood?: "thinking" | "success";
}

const STOPS = {
  thinking: [
    [145, 80, 65],   // vivid emerald
    [162, 75, 75],   // bright mint
    [130, 70, 60],   // lime-green
    [145, 65, 45],   // deep emerald
    [170, 72, 70],   // cyan-green
    [145, 80, 65],   // loop
  ],
  success: [
    [162, 75, 75],   // bright mint
    [145, 80, 68],   // vivid emerald
    [130, 68, 62],   // lime-green
    [145, 80, 68],   // vivid emerald
    [162, 75, 75],   // mint
  ],
} as const;

const EDGE_PTS = 80;

/** Wavy perimeter: each edge displaced perpendicularly by a sine + harmonic. */
function wavyPerimeter(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  phase: number,
  amplitude: number,
) {
  const freq = 2.5;
  ctx.beginPath();
  for (let edge = 0; edge < 4; edge++) {
    for (let i = 0; i <= EDGE_PTS; i++) {
      const t = i / EDGE_PTS;
      const p = (edge + t) / 4;
      const base    = Math.sin(p * Math.PI * 2 * freq * 4 + phase) * amplitude;
      const overtone = Math.sin(p * Math.PI * 2 * freq * 6.3 + phase * 0.7) * amplitude * 0.35;
      const w = base + overtone;

      let x: number, y: number;
      switch (edge) {
        case 0:  x = t * W;     y = w;         break; // top
        case 1:  x = W - w;     y = t * H;     break; // right
        case 2:  x = W - t * W; y = H - w;     break; // bottom
        default: x = w;         y = H - t * H;        // left
      }
      if (edge === 0 && i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

export default function EdgeGlow({ active, micVolume = 0, mood = "thinking" }: EdgeGlowProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number | null>(null);
  const drawRef    = useRef<((ts: number) => void) | null>(null);
  const startRef   = useRef<number>(0);
  // Live refs — the RAF closure reads these every frame.
  const volRef     = useRef<number>(micVolume);
  const targetRef  = useRef<number>(active ? 1 : 0);
  const moodRef    = useRef<"thinking" | "success">(mood);
  const alphaRef   = useRef<number>(0); // current rendered opacity (lerped)

  volRef.current    = micVolume;
  moodRef.current   = mood;
  targetRef.current = active ? 1 : 0;

  // ── Mount: set up canvas + RAF loop once ──────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const setSize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setSize();
    window.addEventListener("resize", setSize, { passive: true });

    const draw = (ts: number) => {
      // ── Smooth fade: lerp alpha toward target each frame ─────────────
      // 0.06 step → reaches 0.99 in ~75 frames ≈ 1.2 s at 60 fps
      const LERP = 0.055;
      alphaRef.current += (targetRef.current - alphaRef.current) * LERP;

      // Self-terminate when fully faded out.
      if (alphaRef.current < 0.004 && targetRef.current === 0) {
        alphaRef.current = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        rafRef.current = null;
        return; // loop stops — will be restarted by the active→true effect
      }

      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const phase    = (elapsed / 10_000) * Math.PI * 2;
      // Oscillate hue ±18° — never drifts into pink (≥ 300°).
      const hShift   = Math.sin(elapsed / 7_000) * 18;
      const energy   = 0.5 + volRef.current * 0.5;
      // Small amplitude: wave is just organic texture on the rim, not a shape.
      const amplitude = 3 + energy * 5;             // 3–8 px

      const stops = STOPS[moodRef.current];
      const a = alphaRef.current;

      const makeGrad = (opacity: number) => {
        const g = ctx.createLinearGradient(0, 0, W, H);
        stops.forEach(([h, s, l], i) => {
          g.addColorStop(
            i / (stops.length - 1),
            `hsla(${Math.round(h + hShift) % 360},${s}%,${l}%,${opacity * a})`,
          );
        });
        return g;
      };

      ctx.globalCompositeOperation = "screen";

      // ── Layer A: rect — owns ALL the wide glow halo (structure/width) ─
      // Success mood gets brighter passes so TTS state is clearly visible.
      const moodBoost = moodRef.current === "success" ? 1.4 : 1.0;
      const rectPasses: Array<{ lw: number; op: number }> = [
        { lw: 1.5,  op: 0.45 * moodBoost },
        { lw: 6,    op: 0.32 * moodBoost },
        { lw: 16,   op: 0.18 * energy * moodBoost },
        { lw: 30,   op: 0.09 * energy },
      ];
      for (const { lw, op } of rectPasses) {
        const inset = lw / 2;
        ctx.lineWidth   = lw;
        ctx.strokeStyle = makeGrad(op);
        ctx.beginPath();
        ctx.rect(inset, inset, W - inset * 2, H - inset * 2);
        ctx.stroke();
      }

      // ── Layer B: wave — ONLY thin crisp passes, tiny amplitude ────────
      // Creates the organic "breathing rim" texture on top of the rect glow.
      const wavePasses: Array<{ lw: number; op: number }> = [
        { lw: 1.5,  op: 0.92 },               // bright crisp organic line
        { lw: 4,    op: 0.45 },               // soft inner ring only
      ];
      for (const { lw, op } of wavePasses) {
        ctx.lineWidth   = lw;
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
  }, []); // run exactly once on mount

  // ── Restart RAF loop when active flips to true ────────────────────────
  useEffect(() => {
    if (active && rafRef.current === null && drawRef.current) {
      startRef.current = 0;
      rafRef.current = requestAnimationFrame(drawRef.current);
    }
  }, [active]);

  // Always render the canvas (never unmount it) so the fade-out can play.
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-80 contrast-more:hidden"
      style={{ willChange: "transform", mixBlendMode: "screen" }}
    />
  );
}
