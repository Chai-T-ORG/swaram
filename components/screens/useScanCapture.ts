"use client";

/**
 * Scan screen logic — camera lifecycle, the OpenCV framing-guidance loop,
 * auto-capture, and ingestion. Moved verbatim from the old page; the views
 * attach `videoRef` and `fileInputRef` to their own markup.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVoicePage } from "@/components/voice/VoiceProvider";
import { saveFile, saveForm } from "@/lib/storage/localHistoryStore";
import { newId, type FormRecord } from "@/lib/types";
import { speak, cancelSpeech } from "@/lib/voice/textToSpeech";
import { loadOpenCv, checkDocumentInFrame, detectCorners, warpPerspectiveCanvas } from "@/lib/vision/shapeDetector";

export type CameraState = "idle" | "starting" | "active" | "captured" | "error";
export type ScanTone = "info" | "warning" | "error" | "success";

const GOOD_FRAMES_NEEDED = 2;
const SHARPNESS_MIN = 40;

export function useScanCapture() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const goodFramesRef = useRef(0);
  const lastSpokenRef = useRef({ text: "", at: 0 });
  const capturingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [guidance, setGuidance] = useState("Tap Start camera, or say start camera. I will guide you with my voice.");
  const [tone, setTone] = useState<ScanTone>("info");
  const [cvReady, setCvReady] = useState<boolean | null>(null);
  const [isDocumentDetected, setIsDocumentDetected] = useState(false);

  useVoicePage(
    {
      title: "Scan a printed form",
      hint: "Say start camera, then hold the form up. I capture automatically.",
      description:
        "Scanner page. Say start camera to open the camera, hold your form up with all four corners in the frame, and I will guide you and capture automatically. You can also say capture, or say upload to pick a file instead.",
      commands: [
        [/start( the)? camera|open( the)? camera/, () => startCamera(), "start camera"],
        [/^capture|take (the )?(photo|picture)/, () => capture(), "capture"],
        [/stop( the)? camera|close( the)? camera/, () => stopEverything(), "stop camera"],
      ],
    },
    [cameraState, cvReady],
  );

  useEffect(() => {
    loadOpenCv().then((cv) => setCvReady(Boolean(cv)));
    return () => stopEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopEverything() {
    if (loopRef.current) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsDocumentDetected(false);
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

  async function startCamera() {
    if (cameraState === "starting" || cameraState === "active") return;
    setCameraState("starting");
    setTone("info");
    setGuidance("Starting the camera…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
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

  function startGuidanceLoop() {
    if (loopRef.current) window.clearInterval(loopRef.current);
    loopRef.current = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || capturingRef.current) return;
      if (!cvReady) return;

      const probe = document.createElement("canvas");
      const scale = 480 / video.videoWidth;
      probe.width = 480;
      probe.height = Math.round(video.videoHeight * scale);
      const ctx = probe.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, probe.width, probe.height);

      const check = await checkDocumentInFrame(probe);
      if (!check) {
        setIsDocumentDetected(false);
        return;
      }

      if (check.coverage < 0.2) {
        goodFramesRef.current = 0;
        setIsDocumentDetected(false);
        sayGuidance("Move the form closer, so it fills the frame.");
      } else if (check.offsetX < -0.3) {
        goodFramesRef.current = 0;
        setIsDocumentDetected(false);
        sayGuidance("Move left. Keep the form inside the frame.");
      } else if (check.offsetX > 0.3) {
        goodFramesRef.current = 0;
        setIsDocumentDetected(false);
        sayGuidance("Move right. Keep the form inside the frame.");
      } else if (check.offsetY < -0.3) {
        goodFramesRef.current = 0;
        setIsDocumentDetected(false);
        sayGuidance("Tilt up. Raise the camera a little.");
      } else if (check.offsetY > 0.3) {
        goodFramesRef.current = 0;
        setIsDocumentDetected(false);
        sayGuidance("Tilt down. Lower the camera a little.");
      } else if (check.sharpness < SHARPNESS_MIN) {
        goodFramesRef.current = 0;
        setIsDocumentDetected(true);
        sayGuidance("Hold steady.");
      } else {
        goodFramesRef.current += 1;
        setIsDocumentDetected(true);
        if (goodFramesRef.current === 1) sayGuidance("Hold steady.", 1500);
        if (goodFramesRef.current >= GOOD_FRAMES_NEEDED) capture();
      }
    }, 900);
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || capturingRef.current) return;
    capturingRef.current = true;
    if (loopRef.current) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
    setCameraState("captured");
    setTone("success");
    setGuidance("Captured. Great job — processing.");
    speak("Captured. Great job. Processing.");

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
    }

    let finalCanvas = canvas;
    try {
      const corners = await detectCorners(canvas);
      if (corners) {
        finalCanvas = await warpPerspectiveCanvas(canvas, corners);
        console.log("[swaram] Perspective correction applied successfully at capture.");
      } else {
        console.log("[swaram] No sheet corners detected. Storing raw capture.");
      }
    } catch (e) {
      console.warn("[swaram] Perspective correction failed during capture:", e);
    }

    const blob = await new Promise<Blob | null>((resolve) => finalCanvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      capturingRef.current = false;
      setCameraState("active");
      setTone("error");
      setGuidance("Capture failed. Please try again.");
      startGuidanceLoop();
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
    cameraState,
    guidance,
    tone,
    cvReady,
    isDocumentDetected,
    startCamera,
    capture,
    ingest,
    openFilePicker: () => fileInputRef.current?.click(),
  };
}

export type ScanScreen = ReturnType<typeof useScanCapture>;
