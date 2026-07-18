"use client";

/**
 * VoiceStrand — the voice as a filament. Three tapered sine strands drawn on
 * canvas, breathing when idle, swelling with live mic volume while listening,
 * pulsing with TTS while speaking.
 *
 * Theme-aware rendering: on the cream canvas it draws as silk ink threads
 * (normal compositing, deeper greens); on dark it becomes light itself
 * (additive compositing, glow). Reduced motion renders one static frame.
 * Pure Canvas 2D — no dependencies.
 */

import { useEffect, useRef } from "react";
import { useVoice } from "@/components/voice/VoiceProvider";

interface VoiceStrandProps {
  height?: number;
  className?: string;
  /** Base energy of the idle breath, 0..1. */
  intensity?: number;
}

export default function VoiceStrand({ height = 72, className = "", intensity = 0.35 }: VoiceStrandProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voice = useVoice();

  // Latest voice state readable from the draw loop without re-running the effect.
  const liveRef = useRef({ vol: 0, listening: false, speaking: false });
  liveRef.current = {
    vol: voice?.micVolume ?? 0,
    listening: voice?.sttState === "listening",
    speaking: Boolean(voice?.ttsActive),
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let t = Math.random() * 10;
    let smooth = 0;

    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Palette + mode follow the live theme; re-read when the html class flips.
    let palette = readPalette();
    const mo = new MutationObserver(() => {
      palette = readPalette();
      if (reduced) drawFrame();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    function readPalette() {
      const styles = getComputedStyle(document.documentElement);
      const dark = document.documentElement.classList.contains("dark") ||
        (!document.documentElement.classList.contains("light") &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      const v = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
      return {
        dark,
        strands: dark
          ? [
              { color: v("--aurora-emerald", "#387355"), amp: 1.0, freq: 1.0, phase: 0.0, width: 2.4, alpha: 0.55, blur: 16 },
              { color: v("--aurora-mint", "#A9CDB7"), amp: 0.7, freq: 1.4, phase: 1.7, width: 1.4, alpha: 0.9, blur: 10 },
              { color: v("--aurora-gold", "#DCAE5A"), amp: 0.45, freq: 0.8, phase: 3.4, width: 1.0, alpha: 0.35, blur: 12 },
            ]
          : [
              { color: v("--aurora-emerald", "#2E7D57"), amp: 1.0, freq: 1.0, phase: 0.0, width: 2.2, alpha: 0.6, blur: 6 },
              { color: v("--aurora-forest", "#1E5138"), amp: 0.7, freq: 1.4, phase: 1.7, width: 1.3, alpha: 0.45, blur: 4 },
              { color: v("--aurora-gold", "#E8B04B"), amp: 0.45, freq: 0.8, phase: 3.4, width: 1.1, alpha: 0.3, blur: 5 },
            ],
      };
    }

    function drawFrame() {
      if (!ctx || !canvas) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const { vol, listening, speaking } = liveRef.current;
      const target = listening
        ? Math.max(0.3, Math.min(1.4, vol * 1.8))
        : speaking
        ? 0.5 + Math.sin(t * 3.2) * 0.18
        : intensity * (0.8 + Math.sin(t * 0.9) * 0.2);
      smooth += (target - smooth) * 0.08;

      ctx.globalCompositeOperation = palette.dark ? "lighter" : "source-over";
      const mid = h / 2;

      for (const s of palette.strands) {
        const boosted = s.color === palette.strands[2].color && listening ? s.alpha + 0.25 : s.alpha;
        const A = smooth * h * 0.36 * s.amp;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const p = x / w;
          const taper = Math.sin(Math.PI * p) ** 1.6;
          const y =
            mid +
            Math.sin(p * Math.PI * 2 * s.freq + t * 1.6 + s.phase) * A * taper +
            Math.sin(p * Math.PI * 5 + t * 0.7 + s.phase * 2) * A * 0.25 * taper;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = s.color;
        ctx.shadowColor = s.color;
        // Outer glow pass, then a tighter bright core.
        ctx.globalAlpha = boosted * 0.7;
        ctx.lineWidth = s.width * 1.8;
        ctx.shadowBlur = s.blur;
        ctx.stroke();
        ctx.globalAlpha = boosted;
        ctx.lineWidth = s.width * 0.7;
        ctx.shadowBlur = s.blur * 0.3;
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
    }

    const loop = () => {
      drawFrame();
      t += 0.016;
      raf = requestAnimationFrame(loop);
    };

    if (reduced) {
      // One elegant static frame; volume/theme changes re-render via observers.
      t = 1.3;
      smooth = intensity;
      drawFrame();
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [intensity]);

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", height }} aria-hidden="true" />;
}
