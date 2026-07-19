"use client";

/**
 * Scan screen logic — camera lifecycle, the OpenCV framing-guidance loop,
 * honest probe framing, auto-capture with smooth progress ring, torch/camera
 * toggles, corner detection & perspective warping confirm state, and ingestion.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useVoicePage } from "@/components/voice/VoiceProvider";
import { intentRegex } from "@/lib/voice/intlCommands";
import { saveFile, saveForm } from "@/lib/storage/localHistoryStore";
import { newId, type FormRecord } from "@/lib/types";
import { speak, cancelSpeech } from "@/lib/voice/textToSpeech";
import { loadOpenCv, checkDocumentInFrame, detectCorners, warpPerspectiveCanvas } from "@/lib/vision/shapeDetector";

export type CameraState = "idle" | "starting" | "active" | "captured" | "confirm" | "error";
export type ScanTone = "info" | "warning" | "error" | "success";

const SHARPNESS_MIN = 40;
const LOCK_DURATION_MS = 1000;

/** Shoelace area of a quad given as [x0,y0,...,x3,y3]. */
function quadArea(pts: number[]): number {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const x1 = pts[i * 2];
    const y1 = pts[i * 2 + 1];
    const x2 = pts[((i + 1) % 4) * 2];
    const y2 = pts[((i + 1) % 4) * 2 + 1];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

/**
 * A quad worth showing to the user: four distinct corners, convex (the
 * tl/tr/br/bl sort degenerates on garbage contours), inside the frame, and
 * covering a meaningful share of it — but never the frame itself. A quad
 * that hugs the viewport is the merged-background blob, not the paper.
 */
function isPlausibleQuad(pts: number[], w: number, h: number): boolean {
  const minGap = Math.max(w, h) * 0.02;
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (Math.hypot(pts[i * 2] - pts[j * 2], pts[i * 2 + 1] - pts[j * 2 + 1]) < minGap) return false;
    }
  }
  let borderCorners = 0;
  for (let i = 0; i < 4; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    if (x < -w * 0.05 || x > w * 1.05 || y < -h * 0.05 || y > h * 1.05) return false;
    if (x < w * 0.02 || x > w * 0.98 || y < h * 0.02 || y > h * 0.98) borderCorners++;
  }
  if (borderCorners >= 3) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const ax = pts[((i + 1) % 4) * 2] - pts[i * 2];
    const ay = pts[((i + 1) % 4) * 2 + 1] - pts[i * 2 + 1];
    const bx = pts[((i + 2) % 4) * 2] - pts[((i + 1) % 4) * 2];
    const by = pts[((i + 2) % 4) * 2 + 1] - pts[((i + 1) % 4) * 2 + 1];
    const cross = ax * by - ay * bx;
    if (cross !== 0) {
      const s = Math.sign(cross);
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  const area = quadArea(pts);
  return area >= w * h * 0.15 && area <= w * h * 0.95;
}

/**
 * Post-capture self-assessment so a blind user hears what a sighted user
 * would see on the confirm screen: corner angles far from 90° mean a tilted
 * or mis-detected crop; a small quad means the form was far away.
 */
function assessQuad(pts: number[], visibleArea: number): "good" | "tilted" | "small" {
  let maxCos = 0;
  for (let j = 0; j < 4; j++) {
    const v1x = pts[((j + 3) % 4) * 2] - pts[j * 2];
    const v1y = pts[((j + 3) % 4) * 2 + 1] - pts[j * 2 + 1];
    const v2x = pts[((j + 1) % 4) * 2] - pts[j * 2];
    const v2y = pts[((j + 1) % 4) * 2 + 1] - pts[j * 2 + 1];
    const cos = Math.abs((v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1));
    maxCos = Math.max(maxCos, cos);
  }
  if (maxCos > 0.35) return "tilted";
  // "Small" is judged against the region the user could SEE while aiming,
  // not the full sensor frame — those differ under object-cover cropping.
  if (quadArea(pts) < visibleArea * 0.25) return "small";
  return "good";
}

export function useScanCapture() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const lockStartTimeRef = useRef<number | null>(null);
  const progressAnimRef = useRef<number | null>(null);
  const lastSpokenRef = useRef({ text: "", at: 0 });
  const guidanceCandidateRef = useRef({ key: "", count: 0 });
  const seenFormRef = useRef(false);
  const quadHistoryRef = useRef<number[][]>([]);
  const lastStableQuadRef = useRef<number[] | null>(null);
  const visibleRectRef = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null);
  const capturingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rawCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [guidance, setGuidance] = useState("Tap Start camera, or say start camera. I will guide you with my voice.");
  const [tone, setTone] = useState<ScanTone>("info");
  const [cvReady, setCvReady] = useState<boolean | null>(null);
  const [isDocumentDetected, setIsDocumentDetected] = useState(false);
  const [autoCaptureProgress, setAutoCaptureProgress] = useState(0);
  const [liveCorners, setLiveCorners] = useState<number[] | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  // Confirm state
  const [corners, setCorners] = useState<number[]>([]);
  const [warpedPreviewUrl, setWarpedPreviewUrl] = useState<string | null>(null);
  const [rawPreviewUrl, setRawPreviewUrl] = useState<string | null>(null);
  const [videoAspect, setVideoAspect] = useState<number | null>(null);
  const [detectionFailed, setDetectionFailed] = useState(false);
  const [rotation, setRotation] = useState(0);

  // Hardware controls
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Voice commands gated by cameraState. English fast lanes are precise
  // regexes; the multilingual "yes" keywords accept the scan, and the
  // adaptive actions below catch any other phrasing or language.
  // STT-tolerant fast lanes: transcripts arrive with normalized punctuation
  // ("Re-take." → "re take"), so every pattern accepts split/joined variants
  // and the phrasings Indian-English STT actually produces ("click a photo").
  const voiceCommands: [RegExp, () => void, string][] =
    cameraState === "confirm"
      ? [
          [/re\s?take|scan again|try again|take (it |the photo )?again|\bredo\b/i, () => retake(), "retake"],
          [
            new RegExp(
              `use (it|this|that)|looks good|keep (it|this)|\\baccept\\b|\\bconfirm\\b|continue|${intentRegex("yes").source}`,
              "iu",
            ),
            () => accept(),
            "use it",
          ],
        ]
      : [
          [/start( the)? camera|open( the)? camera|turn on( the)? camera/i, () => startCamera(), "start camera"],
          [
            /\bcapture\b|\bsnap\b|\bshoot\b|(take|click) (a |the )?(photo|picture|pic|snap)/i,
            () => capture(),
            "capture",
          ],
          [/stop( the)? camera|close( the)? camera/i, () => stopEverything(), "stop camera"],
        ];

  // Every action carries an offline `match` fast-lane so loose phrasings
  // resolve even when the LLM router is unavailable.
  const voiceActions =
    cameraState === "confirm"
      ? [
          {
            id: "accept_scan",
            description: "Keep this scan and continue to form analysis.",
            match: /\b(ok|okay|good|fine|great|keep|save|yes|done|perfect|proceed)\b/i,
            run: () => accept(),
          },
          {
            id: "retake_photo",
            description: "Discard this scan and take the photo again.",
            match: /\b(again|redo|wrong|bad|blurry|no)\b|re\s?take/i,
            run: () => retake(),
          },
        ]
      : cameraState === "active"
        ? [
            {
              id: "capture_photo",
              description: "Take the photo of the form right now.",
              match: /\b(photo|picture|pic|capture|snap|click|shoot)\b/i,
              run: () => capture(),
            },
            {
              id: "upload_file_instead",
              description: "Stop using the camera and upload a file instead.",
              match: /\bupload\b|\bfile\b/i,
              run: () => router.push("/upload"),
            },
          ]
        : [
            {
              id: "start_camera",
              description: "Turn the camera on to scan a paper form.",
              match: /\bcamera\b|\bstart\b|\bbegin\b|\bscan\b/i,
              run: () => startCamera(),
            },
            {
              id: "upload_file_instead",
              description: "Upload a file instead of using the camera.",
              match: /\bupload\b|\bfile\b/i,
              run: () => router.push("/upload"),
            },
          ];

  useVoicePage(
    {
      title: "Scan a printed form",
      hint:
        cameraState === "confirm"
          ? "Say use it to accept this scan, or retake to try again."
          : "Say start camera, then hold the form up. I capture automatically.",
      description:
        cameraState === "confirm"
          ? "Review your scan. You can drag the corner handles to adjust the frame, or say use it or retake."
          : "Scanner page. Say start camera to open the camera, hold your form up with all four corners in the frame, and I will guide you and capture automatically. You can also say capture, or say upload to pick a file instead.",
      commands: voiceCommands,
      actions: voiceActions,
    },
    [cameraState, cvReady, corners, rotation, warpedPreviewUrl],
  );

  useEffect(() => {
    loadOpenCv().then((cv) => setCvReady(Boolean(cv)));
    return () => stopEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopProgressAnimation() {
    if (progressAnimRef.current) {
      cancelAnimationFrame(progressAnimRef.current);
      progressAnimRef.current = null;
    }
  }

  function resetAutoCapture() {
    lockStartTimeRef.current = null;
    stopProgressAnimation();
    setAutoCaptureProgress(0);
  }

  function stopEverything() {
    if (loopRef.current) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
    resetAutoCapture();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsDocumentDetected(false);
    setLiveCorners(null);
    setTorchOn(false);
    setWarpedPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setRawPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    cancelSpeech();
  }

  function sayGuidance(text: string, minGapMs = 3000) {
    const now = Date.now();
    if (lastSpokenRef.current.text === text && now - lastSpokenRef.current.at < 6000) return;
    if (now - lastSpokenRef.current.at < minGapMs) return;
    lastSpokenRef.current = { text, at: now };
    setGuidance(text);
    speak(text);
  }

  /**
   * Guidance with hysteresis: a correction is only spoken after its condition
   * has held for two consecutive probe ticks (~1s). Detection flickers from
   * frame to frame, and reacting instantly turns the guide into a nag that
   * contradicts itself faster than a person can move.
   */
  function sayGuidanceStable(key: string, text: string, minGapMs = 3000) {
    const cand = guidanceCandidateRef.current;
    if (cand.key === key) cand.count += 1;
    else guidanceCandidateRef.current = { key, count: 1 };
    if (guidanceCandidateRef.current.count < 2) return;
    sayGuidance(text, minGapMs);
  }

  /**
   * Multi-frame quad tracker (what commercial scanner SDKs do): keep a short
   * history of normalized detections, render the per-coordinate median so the
   * outline doesn't jitter, and call the quad "stable" only when three
   * consecutive detections agree within 4% of the frame. Detection loss
   * clears the history — stability must be re-earned.
   */
  function trackQuad(q: number[] | null): { quad: number[]; stable: boolean } | null {
    const hist = quadHistoryRef.current;
    if (!q) {
      hist.length = 0;
      return null;
    }
    hist.push(q);
    if (hist.length > 5) hist.shift();
    const recent = hist.slice(-3);
    if (recent.length < 3) return { quad: q, stable: false };
    const median: number[] = [];
    for (let i = 0; i < 8; i++) {
      const vals = recent.map((r) => r[i]).sort((a, b) => a - b);
      median.push(vals[1]);
    }
    let maxDev = 0;
    for (const r of recent) {
      for (let c = 0; c < 4; c++) {
        maxDev = Math.max(maxDev, Math.hypot(r[c * 2] - median[c * 2], r[c * 2 + 1] - median[c * 2 + 1]));
      }
    }
    return { quad: median, stable: maxDev <= 0.04 };
  }

  async function checkDeviceCapabilities(stream: MediaStream) {
    try {
      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === "function") {
        const capabilities = track.getCapabilities() as Record<string, unknown>;
        setTorchAvailable(Boolean(capabilities && "torch" in capabilities));
      } else {
        setTorchAvailable(false);
      }

      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === "videoinput");
        setHasMultipleCameras(videoInputs.length > 1);
      }
    } catch (e) {
      console.warn("[swaram] device capability check failed:", e);
    }
  }

  async function startCamera(overrideFacingMode?: "environment" | "user") {
    if (cameraState === "starting") return;
    const targetFacing = overrideFacingMode ?? facingMode;
    stopEverything();
    guidanceCandidateRef.current = { key: "", count: 0 };
    seenFormRef.current = false;
    quadHistoryRef.current = [];
    lastStableQuadRef.current = null;
    setCameraState("starting");
    setTone("info");
    setGuidance("Starting the camera…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: targetFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setFacingMode(targetFacing);
      await checkDeviceCapabilities(stream);

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setCameraState("active");
      const intro = cvReady
        ? "Camera is on. Hold your form up with all four corners inside the frame. I will capture automatically when it looks sharp."
        : "Camera is on. Hold your form flat, fill the frame, and say capture when you are ready.";
      setGuidance(intro);
      speak(intro);
      startGuidanceLoop();
    } catch {
      setCameraState("error");
      setTone("error");
      const message = "I could not open the camera. Please allow camera access, or upload a photo instead.";
      setGuidance(message);
      speak(message);
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchAvailable) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch (e) {
      console.warn("[swaram] failed to toggle torch:", e);
    }
  }

  async function switchCamera() {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    await startCamera(nextMode);
  }

  function startGuidanceLoop() {
    if (loopRef.current) window.clearInterval(loopRef.current);
    loopRef.current = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || capturingRef.current) return;
      if (!cvReady) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;
      setVideoAspect((prev) => (prev === vw / vh ? prev : vw / vh));

      // Honest framing: probe exactly the pixels the user can see. With
      // object-cover the element crops the stream to its own rendered aspect;
      // with contain (desktop) the full frame is visible.
      let sx = 0;
      let sy = 0;
      let sw = vw;
      let sh = vh;

      const cw = video.clientWidth;
      const ch = video.clientHeight;
      if (cw && ch && getComputedStyle(video).objectFit === "cover") {
        const containerAspect = cw / ch;
        const videoAspect = vw / vh;
        if (videoAspect > containerAspect) {
          sw = vh * containerAspect;
          sx = (vw - sw) / 2;
        } else {
          sh = vw / containerAspect;
          sy = (vh - sh) / 2;
        }
      }
      visibleRectRef.current = { sx, sy, sw, sh };

      const probe = document.createElement("canvas");
      const probeWidth = 480;
      const probeHeight = Math.round((sh / sw) * probeWidth);
      probe.width = probeWidth;
      probe.height = probeHeight;

      const ctx = probe.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, probeWidth, probeHeight);

      const check = await checkDocumentInFrame(probe);
      if (!check) {
        setIsDocumentDetected(false);
        setLiveCorners(null);
        resetAutoCapture();
        return;
      }

      // Detect corners on the probe, gate implausible quads, then feed the
      // multi-frame tracker: the outline shown is the median of recent
      // detections, and "detected" means stable — not one lucky frame.
      const detectedProbeCorners = await detectCorners(probe);
      let quadCoverage = 0;
      let tracked: { quad: number[]; stable: boolean } | null = null;
      if (detectedProbeCorners && isPlausibleQuad(detectedProbeCorners, probeWidth, probeHeight)) {
        quadCoverage = quadArea(detectedProbeCorners) / (probeWidth * probeHeight);
        const normalizedCorners: number[] = [];
        for (let i = 0; i < 8; i += 2) {
          normalizedCorners.push(detectedProbeCorners[i] / probeWidth, detectedProbeCorners[i + 1] / probeHeight);
        }
        tracked = trackQuad(normalizedCorners);
      } else {
        trackQuad(null);
      }
      setLiveCorners(tracked ? tracked.quad : null);
      if (tracked?.stable) lastStableQuadRef.current = tracked.quad;

      // A confidently tracked quad is better evidence than the contour
      // heuristic — for coverage AND centering. Don't tell the user to move
      // when the outline is already hugging a centered sheet.
      const coverage = Math.max(check.coverage, quadCoverage);
      let offsetX = check.offsetX;
      let offsetY = check.offsetY;
      if (tracked) {
        const q = tracked.quad;
        offsetX = ((q[0] + q[2] + q[4] + q[6]) / 4 - 0.5) * 2;
        offsetY = ((q[1] + q[3] + q[5] + q[7]) / 4 - 0.5) * 2;
      }

      // One warm confirmation the moment the sheet is first tracked — the
      // user holding paper at arm's length has no other way to know it worked.
      if (quadCoverage >= 0.2 && !seenFormRef.current) {
        seenFormRef.current = true;
        sayGuidance("I can see the form.", 0);
      }

      if (coverage < 0.2) {
        resetAutoCapture();
        setIsDocumentDetected(false);
        sayGuidanceStable("closer", "Bring the phone closer, so the form fills the screen.");
      } else if (offsetX < -0.3) {
        resetAutoCapture();
        setIsDocumentDetected(false);
        sayGuidanceStable("left", "Move the phone a little to the left.");
      } else if (offsetX > 0.3) {
        resetAutoCapture();
        setIsDocumentDetected(false);
        sayGuidanceStable("right", "Move the phone a little to the right.");
      } else if (offsetY < -0.3) {
        resetAutoCapture();
        setIsDocumentDetected(false);
        sayGuidanceStable("up", "Tilt the phone up a little.");
      } else if (offsetY > 0.3) {
        resetAutoCapture();
        setIsDocumentDetected(false);
        sayGuidanceStable("down", "Tilt the phone down a little.");
      } else if (check.sharpness < SHARPNESS_MIN) {
        resetAutoCapture();
        setIsDocumentDetected(true);
        sayGuidanceStable("blur", "Hold the phone still.");
      } else if (!tracked?.stable) {
        // Sharp and framed, but the outline isn't stable across frames yet —
        // never auto-fire on one lucky detection. The shutter and "capture"
        // voice command still work.
        resetAutoCapture();
        setIsDocumentDetected(true);
        sayGuidanceStable("steady", "Hold it right there.");
      } else {
        // Document locked and sharp! Start/continue smooth progress animation
        setIsDocumentDetected(true);
        if (lockStartTimeRef.current === null) {
          lockStartTimeRef.current = Date.now();
          sayGuidance("Hold steady…", 1500);

          const animateProgress = () => {
            if (lockStartTimeRef.current === null || capturingRef.current) return;
            const elapsed = Date.now() - lockStartTimeRef.current;
            const progress = Math.min(elapsed / LOCK_DURATION_MS, 1);
            setAutoCaptureProgress(progress);
            if (progress >= 1) {
              capture();
            } else {
              progressAnimRef.current = requestAnimationFrame(animateProgress);
            }
          };
          progressAnimRef.current = requestAnimationFrame(animateProgress);
        }
      }
    }, 500);
  }

  const generateWarpedPreview = useCallback(async (rawCanvas: HTMLCanvasElement, currentCorners: number[], rotDeg: number) => {
    let warped = await warpPerspectiveCanvas(rawCanvas, currentCorners);
    if (rotDeg > 0) {
      const rotCanvas = document.createElement("canvas");
      if (rotDeg === 90 || rotDeg === 270) {
        rotCanvas.width = warped.height;
        rotCanvas.height = warped.width;
      } else {
        rotCanvas.width = warped.width;
        rotCanvas.height = warped.height;
      }
      const ctx = rotCanvas.getContext("2d");
      if (ctx) {
        ctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
        ctx.rotate((rotDeg * Math.PI) / 180);
        ctx.drawImage(warped, -warped.width / 2, -warped.height / 2);
      }
      warped = rotCanvas;
    }
    const blob = await new Promise<Blob | null>((resolve) => warped.toBlob(resolve, "image/jpeg", 0.9));
    setWarpedPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
  }, []);

  async function capture() {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || capturingRef.current) return;
    capturingRef.current = true;
    if (loopRef.current) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
    resetAutoCapture();
    setCameraState("captured");
    setTone("success");
    setGuidance("Captured.");
    speak("Captured.");

    // Grab raw full-res frame
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
    }
    rawCanvasRef.current = canvas;

    // A displayable copy of the untouched frame — the corner-adjust view
    // must show THIS image, never the warped output, or handle coordinates lie.
    const rawBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    setRawPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return rawBlob ? URL.createObjectURL(rawBlob) : null;
    });

    const w = canvas.width;
    const h = canvas.height;

    let initialCorners: number[] | null = null;
    try {
      initialCorners = await detectCorners(canvas);
    } catch (e) {
      console.warn("[swaram] Corner detection error:", e);
    }

    // Capture what was TRACKED (SDK behavior): the stable live quad, scaled
    // from the visible probe region to the full frame, is ground truth. A
    // fresh full-res detection may refine it, but never replace it with
    // something that disagrees wildly with what the user was told is locked.
    const live = lastStableQuadRef.current;
    const rect = visibleRectRef.current;
    if (live && rect) {
      const liveRaw = live.map((v, i) =>
        i % 2 === 0 ? rect.sx + v * rect.sw : rect.sy + v * rect.sh,
      );
      if (initialCorners) {
        let maxDev = 0;
        for (let c = 0; c < 4; c++) {
          maxDev = Math.max(
            maxDev,
            Math.hypot(initialCorners[c * 2] - liveRaw[c * 2], initialCorners[c * 2 + 1] - liveRaw[c * 2 + 1]),
          );
        }
        if (maxDev > Math.max(w, h) * 0.08) initialCorners = liveRaw.map((v) => Math.round(v));
      } else {
        initialCorners = liveRaw.map((v) => Math.round(v));
      }
    }

    let isFailed = false;
    if (!initialCorners) {
      isFailed = true;
      // Default 5% inset quad if detection fails
      initialCorners = [
        Math.round(w * 0.05), Math.round(h * 0.05),
        Math.round(w * 0.95), Math.round(h * 0.05),
        Math.round(w * 0.95), Math.round(h * 0.95),
        Math.round(w * 0.05), Math.round(h * 0.95),
      ];
    }

    setCorners(initialCorners);
    setDetectionFailed(isFailed);
    setRotation(0);
    await generateWarpedPreview(canvas, initialCorners, 0);

    setCameraState("confirm");

    if (isFailed) {
      const msg = "I couldn't find the edges — drag the corners to the paper, or retake.";
      setGuidance(msg);
      speak(msg);
    } else {
      // Speak what a sighted user would see, so accepting is never blind.
      const verdict = assessQuad(initialCorners, rect ? rect.sw * rect.sh : w * h);
      const msg =
        verdict === "tilted"
          ? "Here's your scan, but it looks tilted. I'd retake it — or say use it to keep it anyway."
          : verdict === "small"
            ? "Here's your scan, but the form looks small and may come out blurry. Say use it, or retake and bring the phone closer."
            : "Here's your scan. It looks clean and straight. Say use it, or retake.";
      setGuidance(msg);
      speak(msg);
    }
  }

  function updateCorner(index: number, newRawX: number, newRawY: number) {
    // Only update corner coordinates state during pointer move (no re-warp!)
    setCorners((prev) => {
      const next = [...prev];
      next[index * 2] = Math.round(newRawX);
      next[index * 2 + 1] = Math.round(newRawY);
      return next;
    });
  }

  function commitCornerChange() {
    // Re-warp runs ONCE on pointer-up
    if (rawCanvasRef.current && corners.length === 8) {
      generateWarpedPreview(rawCanvasRef.current, corners, rotation);
    }
  }

  function rotate90() {
    const nextRot = (rotation + 90) % 360;
    setRotation(nextRot);
    if (rawCanvasRef.current && corners.length === 8) {
      generateWarpedPreview(rawCanvasRef.current, corners, nextRot);
    }
  }

  function retake() {
    setCorners([]);
    setRotation(0);
    setDetectionFailed(false);
    capturingRef.current = false;
    startCamera(); // startCamera → stopEverything revokes both preview URLs
  }

  async function accept() {
    const rawCanvas = rawCanvasRef.current;
    if (!rawCanvas || corners.length !== 8) return;

    let finalCanvas = await warpPerspectiveCanvas(rawCanvas, corners);
    if (rotation > 0) {
      const rotCanvas = document.createElement("canvas");
      if (rotation === 90 || rotation === 270) {
        rotCanvas.width = finalCanvas.height;
        rotCanvas.height = finalCanvas.width;
      } else {
        rotCanvas.width = finalCanvas.width;
        rotCanvas.height = finalCanvas.height;
      }
      const ctx = rotCanvas.getContext("2d");
      if (ctx) {
        ctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(finalCanvas, -finalCanvas.width / 2, -finalCanvas.height / 2);
      }
      finalCanvas = rotCanvas;
    }

    const blob = await new Promise<Blob | null>((resolve) => finalCanvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setTone("error");
      setGuidance("Failed to create scan image. Please try again.");
      return;
    }

    await ingest(blob, "Scanned form");
  }

  async function ingest(blob: Blob, baseName: string) {
    stopEverything();
    const record: FormRecord = {
      id: newId(),
      name: `${baseName} ${new Date().toLocaleDateString("en-IN")}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "processing",
      sourceType: "image",
      isAcroForm: false,
      pageCount: 0,
      pageDims: [],
      fields: [],
    };
    await saveFile(record.id, "original", blob);
    await saveForm(record);
    router.push(`/processing/${record.id}`);
  }

  return {
    videoRef,
    fileInputRef,
    rawCanvasRef,
    cameraState,
    guidance,
    tone,
    cvReady,
    isDocumentDetected,
    autoCaptureProgress,
    liveCorners,
    corners,
    warpedPreviewUrl,
    rawPreviewUrl,
    videoAspect,
    detectionFailed,
    rotation,
    torchAvailable,
    torchOn,
    hasMultipleCameras,
    startCamera: () => startCamera(),
    capture,
    retake,
    accept,
    updateCorner,
    commitCornerChange,
    rotate90,
    toggleTorch,
    switchCamera,
    ingest,
    openFilePicker: () => fileInputRef.current?.click(),
  };
}

export type ScanScreen = ReturnType<typeof useScanCapture>;

