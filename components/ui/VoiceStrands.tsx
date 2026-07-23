"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import VoiceStrand from "@/components/ui/VoiceStrand";
import { useVoice } from "@/components/voice/VoiceProvider";

// The WebGL waveform pulls in `ogl`. VoiceControl renders this on nearly every
// screen, so a static import would put the whole WebGL renderer in the shared
// bundle. Load it as its own client-only chunk instead — it only ever renders
// on the WebGL2 branch below (decorative + aria-hidden), and the non-WebGL2
// fallback (VoiceStrand) stays in the critical path.
const Strands = dynamic(() => import("@/components/Strands"), { ssr: false });

function useIsDarkTheme(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () =>
      setDark(
        document.documentElement.classList.contains("dark") ||
          (!document.documentElement.classList.contains("light") &&
            window.matchMedia("(prefers-color-scheme: dark)").matches)
      );
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", read);
    };
  }, []);
  return dark;
}

function useWebGL2(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    try {
      setOk(Boolean(document.createElement("canvas").getContext("webgl2")));
    } catch {
      setOk(false);
    }
  }, []);
  return ok;
}

export default function VoiceStrands({
  width,
  height = 120,
  className = "",
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  const voice = useVoice();
  const dark = useIsDarkTheme();
  const webgl2 = useWebGL2();
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setReduced(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);

  // Graceful fallback for non-WebGL2 environments only
  if (!webgl2) {
    return (
      <div className={className} style={{ height, width: width ? `${width}px` : "100%" }} aria-hidden="true">
        <VoiceStrand height={height} intensity={0.4} />
      </div>
    );
  }

  const vol = voice?.micVolume ?? 0;
  const listening = voice?.sttState === "listening";
  const speaking = Boolean(voice?.ttsActive);

  // React Bits Strands palette:
  // Dark mode: bright cream, vivid mint, forest green glow.
  // Light mode: deep forest green, rich emerald, warm gold (tuned so additive glow never looks neon).
  const colors = dark
    ? ["#F0EBDF", "#4CAF7D", "#1E5138"]
    : ["#123B27", "#1E5138", "#286646", "#8F6B2A"];

  const amplitude = listening ? 1.05 + vol * 0.7 : speaking ? 1.1 : 0.85;
  const intensity = listening ? 0.6 + vol * 0.15 : speaking ? 0.62 : 0.45;
  const speed = reduced ? 0 : listening ? 0.7 : speaking ? 0.8 : 0.35;

  const aspect = (width || 460) / height;
  const scale = Math.max(1, aspect / 1.5);

  return (
    <div className={className} style={{ height, width: width ? `${width}px` : "100%" }} aria-hidden="true">
      <Strands
        colors={colors}
        count={3}
        speed={speed}
        amplitude={amplitude}
        waviness={listening ? 1.3 : 1}
        thickness={dark ? 0.8 : 0.65}
        glow={dark ? 2.4 : 0.75}
        taper={2.4}
        spread={1}
        intensity={intensity}
        saturation={dark ? 1.5 : 0.95}
        opacity={dark ? 1 : 0.8}
        scale={scale}
      />
    </div>
  );
}
