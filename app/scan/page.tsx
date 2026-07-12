"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useVoicePage } from "@/components/GlobalVoice";
import { saveFile, saveForm } from "@/lib/storage/localHistoryStore";
import { newId, type FormRecord } from "@/lib/types";
import { speak, cancelSpeech } from "@/lib/voice/textToSpeech";
import { loadOpenCv, checkDocumentInFrame, detectCorners, warpPerspectiveCanvas } from "@/lib/vision/shapeDetector";
import { motion } from "framer-motion";
import {
  IconArrowLeft,
  IconCamera,
  IconUpload,
  IconSparkle,
  IconAlertCircle,
  IconHelp
} from "@/components/icons";

type CameraState = "idle" | "starting" | "active" | "captured" | "error";

const GOOD_FRAMES_NEEDED = 2;
const SHARPNESS_MIN = 40;

export default function ScanPage() {
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
  const [tone, setTone] = useState<"info" | "warning" | "error" | "success">("info");
  const [cvReady, setCvReady] = useState<boolean | null>(null);

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
      if (!check) return;

      if (check.coverage < 0.2) {
        goodFramesRef.current = 0;
        sayGuidance("Move the form closer, so it fills the frame.");
      } else if (check.offsetX < -0.3) {
        goodFramesRef.current = 0;
        sayGuidance("Move left. Keep the form inside the frame.");
      } else if (check.offsetX > 0.3) {
        goodFramesRef.current = 0;
        sayGuidance("Move right. Keep the form inside the frame.");
      } else if (check.offsetY < -0.3) {
        goodFramesRef.current = 0;
        sayGuidance("Tilt up. Raise the camera a little.");
      } else if (check.offsetY > 0.3) {
        goodFramesRef.current = 0;
        sayGuidance("Tilt down. Lower the camera a little.");
      } else if (check.sharpness < SHARPNESS_MIN) {
        goodFramesRef.current = 0;
        sayGuidance("Hold steady.");
      } else {
        goodFramesRef.current += 1;
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

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 animate-fade-in pb-16">
      <nav aria-label="Breadcrumb">
        <Link href="/" className="link-plain inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
          <IconArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </nav>

      <header className="border-b border-line pb-3">
        <p className="eyebrow mb-1">Step 1 of 4 — Import</p>
        <h1 className="font-display text-2xl font-black text-ink">Scan a printed form</h1>
      </header>

      <StatusAnnouncer message={guidance} tone={tone} />

      <div className="card overflow-hidden p-0 border-line bg-raised shadow-sm">
        <div className="relative aspect-[3/4] w-full bg-ink sm:aspect-video overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            aria-label="Camera preview"
            className="absolute inset-0 h-full w-full object-contain"
          />
          
          {cameraState === "active" && (
            <div className="scan-laser" />
          )}

          <div aria-hidden="true" className="pointer-events-none absolute inset-6">
            {[
              "top-0 left-0 border-t-2 border-l-2",
              "top-0 right-0 border-t-2 border-r-2",
              "bottom-0 left-0 border-b-2 border-l-2",
              "bottom-0 right-0 border-b-2 border-r-2",
            ].map((pos) => (
              <span key={pos} className={`absolute h-10 w-10 border-accent/80 transition-colors duration-300 ${pos}`} />
            ))}
          </div>

          {cameraState === "idle" && (
            <div className="absolute inset-0 grid place-items-center bg-ink/40 backdrop-blur-[1px]">
              <button
                type="button"
                className="btn-primary px-8 text-xs min-h-11 shadow-md shadow-accent/10"
                onClick={startCamera}
              >
                <IconCamera className="h-4.5 w-4.5" />
                Start camera
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {cameraState === "active" && (
          <button type="button" className="btn-primary px-8 text-xs min-h-10 shadow-sm" onClick={capture}>
            Capture now
          </button>
        )}
        {cameraState === "error" && (
          <button type="button" className="btn-primary px-6 text-xs min-h-10 shadow-sm" onClick={startCamera}>
            Try camera again
          </button>
        )}
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) ingest(file, "Photographed form");
          }}
        />

        <button
          type="button"
          className="btn-secondary px-5 text-xs font-semibold min-h-10"
          onClick={() => fileInputRef.current?.click()}
        >
          <IconCamera className="h-4 w-4" />
          Use device camera app
        </button>

        <Link href="/upload" className="btn-secondary px-5 text-xs font-semibold min-h-10">
          <IconUpload className="h-4 w-4" />
          Upload instead
        </Link>
      </div>

      {cvReady === false && cameraState !== "idle" && (
        <div className="card p-4 flex gap-3 border-amber-200 bg-warn-soft text-warn" role="status">
          <IconAlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-xs font-semibold leading-relaxed">
            Automatic framing guidance is unavailable on this device, so auto-capture is off. Hold
            the form flat, fill the frame, and say capture.
          </p>
        </div>
      )}

      <section className="card p-5.5 border-line bg-raised shadow-sm">
        <h2 className="font-display text-sm font-bold text-ink uppercase tracking-wider mb-3.5 flex items-center gap-2">
          <IconSparkle className="h-4.5 w-4.5 text-accent" />
          Tips for a clear scan
        </h2>
        <ul className="list-none space-y-2.5 p-0 text-xs font-semibold text-soft">
          <li className="flex items-start gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0 mt-1.5" />
            Avoid glare and bright reflections.
          </li>
          <li className="flex items-start gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0 mt-1.5" />
            Keep the paper flat &mdash; no folds or curls.
          </li>
          <li className="flex items-start gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0 mt-1.5" />
            Keep all four corners inside the frame.
          </li>
          <li className="flex items-start gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0 mt-1.5" />
            Hold steady; I capture the moment it looks sharp.
          </li>
        </ul>
      </section>
    </div>
  );
}
