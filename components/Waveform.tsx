"use client";

import { useEffect, useRef } from "react";

interface WaveformProps {
  active?: boolean;
  speaking?: boolean;
  volume?: number;
}

export default function Waveform({ active = false, speaking = false, volume = 0 }: WaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLSpanElement[]>([]);
  const animationRef = useRef<number | null>(null);

  const isListening = active;
  const isSpeaking = speaking;

  const numBars = 15;
  const baseHeights = [10, 22, 34, 18, 28, 40, 26, 14, 32, 20, 36, 12, 24, 30, 16];

  useEffect(() => {
    if (containerRef.current) {
      const spans = containerRef.current.querySelectorAll("span");
      barsRef.current = Array.from(spans);
    }
  }, []);

  useEffect(() => {
    if (!isListening && !isSpeaking) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      // Reset to resting state
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        bar.style.height = `${baseHeights[i % baseHeights.length] * 0.4}px`;
        bar.style.backgroundColor = "var(--line)";
        bar.style.boxShadow = "none";
      });
      return;
    }

    let tick = 0;
    const update = () => {
      tick += 1;
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;

        let amplitude = 0;
        if (isListening) {
          // Voice volume + frequency modulation
          amplitude = volume * 0.85 + Math.sin(tick * 0.2 + i * 0.5) * 0.15;
        } else if (isSpeaking) {
          // Breathing speech pattern
          amplitude = 0.4 + Math.sin(tick * 0.15 + i * 0.8) * 0.35;
        }
        amplitude = Math.max(0.15, Math.min(1, amplitude));

        const minH = 4;
        const maxH = 44;
        const targetH = minH + amplitude * (maxH - minH);

        bar.style.height = `${targetH}px`;

        // Brand-aligned gradient coloring and neon glow
        if (amplitude > 0.3) {
          bar.style.backgroundColor = `color-mix(in srgb, #0d9488 ${100 - amplitude * 40}%, #2dd4bf)`;
          bar.style.boxShadow = `0 0 ${4 + amplitude * 8}px rgba(13, 148, 136, ${0.2 + amplitude * 0.5})`;
        } else {
          bar.style.backgroundColor = "var(--accent)";
          bar.style.boxShadow = "none";
        }
      });
      animationRef.current = requestAnimationFrame(update);
    };

    animationRef.current = requestAnimationFrame(update);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening, isSpeaking, volume]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="flex h-12 items-center justify-center gap-[4px]"
    >
      {Array.from({ length: numBars }).map((_, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full transition-all duration-75 bg-line"
          style={{ height: `${baseHeights[i] * 0.4}px` }}
        />
      ))}
    </div>
  );
}
