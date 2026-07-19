"use client";

/**
 * VoiceStrands — the React Bits "Strands" WebGL shader, made Swaram's own:
 *
 *  - voice-reactive: amplitude/intensity/speed ride the live mic volume while
 *    listening and pulse while Swaram speaks (the stock component is a demo
 *    loop; this one visualizes the actual conversation);
 *  - theme-native: deep green ink tones on the cream canvas, mint/emerald
 *    light with a marigold whisper on dark;
 *  - honest fallbacks: no WebGL2 → the Canvas-2D VoiceStrand; reduced motion
 *    → a static frame (speed 0).
 */

import { useEffect, useState } from "react";
import Strands from "@/components/Strands";
import VoiceStrand from "@/components/ui/VoiceStrand";
import { useVoice } from "@/components/voice/VoiceProvider";

function useIsDarkTheme(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () =>
      setDark(
        document.documentElement.classList.contains("dark") ||
          (!document.documentElement.classList.contains("light") &&
            window.matchMedia("(prefers-color-scheme: dark)").matches),
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
  // Start pessimistic: SSR and the first client render show the Canvas-2D
  // fallback, and we only upgrade to the WebGL shader after probing. Starting
  // true would mount OGL before the probe and crash environments without
  // WebGL2 (headless test browsers included).
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

  // The shader's alpha comes from luminance (additive light), so it can only
  // ever glow — dark ink strands vanish on the cream canvas. Ink by day
  // (Canvas 2D threads), light by night (WebGL): a deliberate brand behavior.
  if (!webgl2 || !dark) {
    return (
      <div className={className} style={{ height, width: width ? `${width}px` : "100%" }} aria-hidden="true">
        <VoiceStrand height={height} intensity={0.3} />
      </div>
    );
  }

  const vol = voice?.micVolume ?? 0;
  const listening = voice?.sttState === "listening";
  const speaking = Boolean(voice?.ttsActive);

  // One bright cream lead strand + greens — the reference-demo recipe.
  const colors = ["#F0EBDF", "#4CAF7D", "#1E5138"];

  const amplitude = listening ? 0.95 + vol * 0.7  : speaking ? 1.05 : 0.85;
  const intensity = listening ? 0.52 + vol * 0.12 : speaking ? 0.55 : 0.42;
  const speed = reduced ? 0 : listening ? 0.65 : speaking ? 0.80 : 0.32;

  // The shader normalizes x by canvas HEIGHT and its taper envelope repeats
  // every ~1.54 uv units — on a wide strip that renders as multiple "glints"
  // unless we zoom so only the center lobe is visible: scale ≥ aspect / 1.5.
  const aspect = (width || 460) / height;
  const scale = Math.max(1, aspect / 1.5);

  return (
    <div className={className} style={{ height, width: width ? `${width}px` : "100%" }} aria-hidden="true">
      <Strands
        colors={colors}
        count={3}
        speed={speed}
        amplitude={amplitude}
        waviness={listening ? 1.25 : 1}
        thickness={0.7}
        glow={2.2}
        taper={2.4}
        spread={1}
        intensity={intensity}
        saturation={1.5}
        opacity={1}
        scale={scale}
      />
    </div>
  );
}
