"use client";

/**
 * Scan screen logic — camera lifecycle, the OpenCV framing-guidance loop,
 * honest probe framing, auto-capture with smooth progress ring, torch/camera
 * toggles, corner detection & perspective warping confirm state, and ingestion.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useVoicePage } from "@/components/voice/VoiceProvider";
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
 * covering a meaningful share of it.
 */
function isPlausibleQuad(pts: number[], w: number, h: number): boolean {
  const minGap = Math.max(w, h) * 0.02;
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (Math.hypot(pts[i * 2] - pts[j * 2], pts[i * 2 + 1] - pts[j * 2 + 1]) < minGap) return false;
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    if (x < -w * 0.05 || x > w * 1.05 || y < -h * 0.05 || y > h * 1.05) return false;
  }
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
  return quadArea(pts) >= w * h * 0.15;
}

export function useScanCapture() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const lockStartTimeRef = useRef<number | null>(null);
  const progressAnimRef = useRef<number | null>(null);
  const lastSpokenRef = useRef({ text: "", at: 0 });
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

  // Voice commands gated by cameraState
  const voiceCommands: [RegExp, () => void, string][] =
    cameraState === "confirm"
      ? [
          [/retake|scan again/i, () => retake(), "retake"],
          [/use it|looks good|continue|keep it/i, () => accept(), "use it"],
        ]
      : [
          [/start( the)? camera|open( the)? camera/i, () => startCamera(), "start camera"],
          [/^capture|take (the )?(photo|picture)/i, () => capture(), "capture"],
          [/stop( the)? camera|close( the)? camera/i, () => stopEverything(), "stop camera"],
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

      // Detect corners on probe for the live outline — but only show quads
      // that pass the plausibility gate; garbage contours read as glitches.
      const detectedProbeCorners = await detectCorners(probe);
      let quadCoverage = 0;
      if (detectedProbeCorners && isPlausibleQuad(detectedProbeCorners, probeWidth, probeHeight)) {
        quadCoverage = quadArea(detectedProbeCorners) / (probeWidth * probeHeight);
        const normalizedCorners: number[] = [];
        for (let i = 0; i < 8; i += 2) {
          normalizedCorners.push(detectedProbeCorners[i] / probeWidth, detectedProbeCorners[i + 1] / probeHeight);
        }
        setLiveCorners(normalizedCorners);
      } else {
        setLiveCorners(null);
      }

      // A confidently tracked quad is better evidence of coverage than the
      // contour heuristic — don't tell the user to move closer when the
      // outline is already hugging the sheet.
      const coverage = Math.max(check.coverage, quadCoverage);

      if (coverage < 0.2) {
        resetAutoCapture();
        setIsDocumentDetected(false);
        sayGuidance("Move the form closer, so it fills the frame.");
      } else if (check.offsetX < -0.3) {
        resetAutoCapture();
        setIsDocumentDetected(false);
        sayGuidance("Move left. Keep the form inside the frame.");
      } else if (check.offsetX > 0.3) {
        resetAutoCapture();
        setIsDocumentDetected(false);
        sayGuidance("Move right. Keep the form inside the frame.");
      } else if (check.offsetY < -0.3) {
        resetAutoCapture();
        setIsDocumentDetected(false);
        sayGuidance("Tilt up. Raise the camera a little.");
      } else if (check.offsetY > 0.3) {
        resetAutoCapture();
        setIsDocumentDetected(false);
        sayGuidance("Tilt down. Lower the camera a little.");
      } else if (check.sharpness < SHARPNESS_MIN) {
        resetAutoCapture();
        setIsDocumentDetected(true);
        sayGuidance("Hold steady.");
      } else if (quadCoverage === 0) {
        // Sharp and framed, but no confidently tracked outline — never
        // auto-fire blind. The shutter and "capture" voice command still work.
        resetAutoCapture();
        setIsDocumentDetected(true);
        sayGuidance("Hold steady.");
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
      const msg = "Here's your scan. Say use it, or retake.";
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

