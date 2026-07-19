"use client";

/**
 * Scan, desktop (spec D4 & §5 hierarchy inversion) — a calm banner recommending
 * upload first, with webcam as secondary path featuring real document outline polygon,
 * shutter progress ring, folded tips line, and interactive confirm screen with corner handles.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useScanCapture } from "@/components/screens/useScanCapture";
import { IconArrowLeft, IconCamera, IconUpload, IconAlertCircle, IconCheck, IconRepeat } from "@/components/icons";
import { Zap, ZapOff, RefreshCw, RotateCw, Move } from "lucide-react";

export default function ScanDesktop() {
  const sc = useScanCapture();
  const prefersReducedMotion = useReducedMotion();
  const adjustBoxRef = useRef<HTMLDivElement>(null);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);
  const [adjusting, setAdjusting] = useState(false);

  const isConfirm = sc.cameraState === "confirm";
  const rawW = sc.rawCanvasRef.current?.width ?? 0;
  const rawH = sc.rawCanvasRef.current?.height ?? 0;

  // When detection failed, drop the user straight into corner adjustment.
  useEffect(() => {
    if (sc.cameraState !== "confirm") setAdjusting(false);
    else if (sc.detectionFailed) setAdjusting(true);
  }, [sc.cameraState, sc.detectionFailed]);

  // The desktop video is object-contain inside a 16:9 card, so the visible
  // camera pixels occupy a letterboxed inner box; the live outline must be
  // positioned over that box, not the whole card.
  const contentBox = (() => {
    const va = sc.videoAspect;
    const ca = 16 / 9;
    if (!va) return { left: "0%", top: "0%", width: "100%", height: "100%" };
    if (va >= ca) {
      const h = (ca / va) * 100;
      return { left: "0%", top: `${(100 - h) / 2}%`, width: "100%", height: `${h}%` };
    }
    const w = (va / ca) * 100;
    return { left: `${(100 - w) / 2}%`, top: "0%", width: `${w}%`, height: "100%" };
  })();

  function handlePointerDown(index: number, e: React.PointerEvent) {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActiveHandle(index);
  }

  function handlePointerMove(index: number, e: React.PointerEvent) {
    if (activeHandle !== index || !adjustBoxRef.current || !sc.rawCanvasRef.current) return;
    // The adjust box wraps the raw image exactly, so box-relative position
    // maps linearly onto raw-canvas coordinates.
    const rect = adjustBoxRef.current.getBoundingClientRect();
    const rawCanvas = sc.rawCanvasRef.current;

    const relX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const relY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

    const rawX = (relX / rect.width) * rawCanvas.width;
    const rawY = (relY / rect.height) * rawCanvas.height;

    // Corner dragging updates only coordinates state during pointermove
    sc.updateCorner(index, rawX, rawY);
  }

  function handlePointerUp(index: number, e: React.PointerEvent) {
    if (activeHandle === index) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture already released
      }
      setActiveHandle(null);
      // Re-warp perspective runs ONCE on pointer-up
      sc.commitCornerChange();
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 animate-fade-in">
      <nav aria-label="Breadcrumb">
        <Link href="/" className="link-plain inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
          <IconArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </nav>

      <header>
        <span className="eyebrow">{isConfirm ? "Confirm scan" : "Scan a paper form"}</span>
        <h1 className="mt-1 font-display text-4xl text-ink">
          {isConfirm ? "Check & adjust corners" : "Hold it up — I’ll guide you"}
        </h1>
      </header>

      <StatusAnnouncer message={sc.guidance} tone={sc.tone} />

      {!isConfirm ? (
        <>
          {/* Priority Inversion Banner Card */}
          <div className="card flex items-center justify-between p-4 bg-sunken border-line/60">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface border border-line text-accent">
                <IconUpload className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-ink">Best results on desktop</h2>
                <p className="text-xs text-soft">Upload a saved PDF or high-resolution photo file</p>
              </div>
            </div>
            <Link href="/upload" className="btn-secondary min-h-11 px-4 text-xs font-bold no-underline shrink-0">
              Upload file →
            </Link>
          </div>

          {/* Camera Viewport Container */}
          <div className="card overflow-hidden p-0 relative aspect-video w-full bg-ink select-none">
            <motion.video
              ref={sc.videoRef}
              playsInline
              muted
              aria-label="Camera preview"
              className="absolute inset-0 h-full w-full object-contain"
              animate={{
                scale: sc.cameraState === "captured" ? 0.95 : 1,
              }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            />

            {/* Live Document Outline SVG Overlay — over the letterboxed content box */}
            {sc.cameraState === "active" && sc.liveCorners && sc.liveCorners.length === 8 && (
              <div className="absolute pointer-events-none z-10" style={contentBox}>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                  <polygon
                    points={`${sc.liveCorners[0] * 100},${sc.liveCorners[1] * 100} ${sc.liveCorners[2] * 100},${sc.liveCorners[3] * 100} ${sc.liveCorners[4] * 100},${sc.liveCorners[5] * 100} ${sc.liveCorners[6] * 100},${sc.liveCorners[7] * 100}`}
                    className="transition-colors duration-200"
                    fill="rgba(30, 81, 56, 0.18)"
                    stroke={sc.isDocumentDetected ? "var(--accent)" : "var(--warn)"}
                    strokeWidth="1.5"
                    strokeDasharray={sc.isDocumentDetected ? "none" : "3,3"}
                  />
                </svg>
              </div>
            )}

            {sc.cameraState === "active" && <div className="laser-line" />}

            {/* Flash Overlay */}
            {sc.cameraState === "captured" && !prefersReducedMotion && (
              <motion.div
                initial={{ opacity: 0.8 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                className="absolute inset-0 z-50 bg-white pointer-events-none"
              />
            )}

            {/* Static corner brackets — shown ONLY during idle state */}
            {sc.cameraState === "idle" && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-6">
                {[
                  "top-0 left-0 border-t-2 border-l-2",
                  "top-0 right-0 border-t-2 border-r-2",
                  "bottom-0 left-0 border-b-2 border-l-2",
                  "bottom-0 right-0 border-b-2 border-r-2",
                ].map((pos) => (
                  <span key={pos} className={`absolute h-10 w-10 transition-all duration-300 border-faint/30 scale-100 ${pos}`} />
                ))}
              </div>
            )}

            {/* Hardware Controls (Torch / Camera switch) */}
            {sc.cameraState === "active" && (
              <div className="absolute top-4 inset-x-4 flex justify-between z-20 pointer-events-auto">
                {sc.torchAvailable ? (
                  <button
                    type="button"
                    onClick={sc.toggleTorch}
                    aria-label={sc.torchOn ? "Turn torch off" : "Turn torch on"}
                    className="grid h-10 w-10 place-items-center rounded-full bg-ink/60 text-white backdrop-blur-md border border-white/20 hover:bg-ink/80 transition-transform"
                  >
                    {sc.torchOn ? <Zap className="h-4.5 w-4.5 text-warn fill-current" /> : <ZapOff className="h-4.5 w-4.5 text-white" />}
                  </button>
                ) : (
                  <div />
                )}

                {sc.hasMultipleCameras ? (
                  <button
                    type="button"
                    onClick={sc.switchCamera}
                    aria-label="Switch camera"
                    className="grid h-10 w-10 place-items-center rounded-full bg-ink/60 text-white backdrop-blur-md border border-white/20 hover:bg-ink/80 transition-transform"
                  >
                    <RefreshCw className="h-4.5 w-4.5 text-white" />
                  </button>
                ) : (
                  <div />
                )}
              </div>
            )}

            {/* Idle Overlay */}
            {sc.cameraState === "idle" && (
              <div className="absolute inset-0 grid place-items-center bg-ink/40 backdrop-blur-[1px] z-20">
                <button type="button" className="btn-primary min-h-13 px-8" onClick={sc.startCamera}>
                  <IconCamera className="h-4.5 w-4.5" />
                  Start camera
                </button>
              </div>
            )}

            {/* Shutter Button & Auto-capture Ring */}
            {sc.cameraState === "active" && (
              <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-1.5 z-20">
                {sc.autoCaptureProgress > 0 && (
                  <span className="rounded-full bg-ink/75 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm animate-pulse">
                    Hold steady…
                  </span>
                )}
                <div className="relative grid place-items-center">
                  <svg className="absolute -inset-1.5 h-19 w-19 -rotate-90 pointer-events-none" viewBox="0 0 76 76">
                    <circle cx="38" cy="38" r="34" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3.5" />
                    <circle
                      cx="38"
                      cy="38"
                      r="34"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="3.5"
                      strokeDasharray={213.63}
                      strokeDashoffset={213.63 * (1 - sc.autoCaptureProgress)}
                      strokeLinecap="round"
                      className="transition-[stroke-dashoffset] duration-75"
                    />
                  </svg>
                  <button
                    type="button"
                    onClick={sc.capture}
                    aria-label="Capture now"
                    className="grid h-16 w-16 cursor-pointer place-items-center rounded-full border-4 border-surface bg-accent text-on-accent shadow-float hover:scale-105 active:scale-95 transition-transform"
                  >
                    <IconCamera className="h-6 w-6" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Folded Tips Caption Line */}
          <p className="text-center text-xs leading-relaxed text-faint">
            Avoid glare · keep paper flat · all four corners in frame
          </p>

          <input
            ref={sc.fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) sc.ingest(file, "Photographed form");
            }}
          />

          {sc.cvReady === false && sc.cameraState !== "idle" && (
            <div className="card flex gap-3 border-warn/25 bg-warn-soft p-4 text-warn" role="status">
              <IconAlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-xs font-semibold leading-relaxed">
                Automatic framing guidance is unavailable on this device, so auto-capture is off. Hold the form flat, fill
                the frame, and say capture.
              </p>
            </div>
          )}
        </>
      ) : (
        /* Confirm state — straightened result by default; corner adjustment is
           an explicit mode on the RAW photo so handles and image always agree. */
        <div className="flex flex-col gap-5">
          {!adjusting ? (
            <>
              <div className="card overflow-hidden p-0 relative aspect-video w-full bg-ink select-none">
                {sc.warpedPreviewUrl && (
                  <img
                    src={sc.warpedPreviewUrl}
                    alt="Straightened scan preview"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={sc.rotate90}
                    className="btn-secondary min-h-11 px-4 text-xs font-semibold"
                  >
                    <RotateCw className="h-4 w-4 mr-1.5" />
                    Rotate 90°
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjusting(true)}
                    className="btn-secondary min-h-11 px-4 text-xs font-semibold"
                  >
                    <Move className="h-4 w-4 mr-1.5" />
                    Adjust corners
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={sc.retake}
                    className="btn-secondary min-h-12 px-6 text-sm"
                  >
                    <IconRepeat className="h-4 w-4 mr-1.5" />
                    Retake photo
                  </button>
                  <button
                    type="button"
                    onClick={sc.accept}
                    className="btn-primary min-h-12 px-8 text-sm font-bold shadow-float"
                  >
                    <IconCheck className="h-4.5 w-4.5 mr-1.5" />
                    Use this scan
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {sc.detectionFailed && (
                <div className="card flex gap-3 border-warn/25 bg-warn-soft p-4 text-warn" role="status">
                  <IconAlertCircle className="h-5 w-5 shrink-0" />
                  <p className="text-xs font-semibold leading-relaxed">
                    I couldn't find the edges — drag the corners to the paper, or retake.
                  </p>
                </div>
              )}

              {/* Raw photo with the quad + handles in its exact coordinate space */}
              <div className="card flex justify-center overflow-hidden bg-ink p-4">
                <div ref={adjustBoxRef} className="relative touch-none select-none">
                  {sc.rawPreviewUrl && (
                    <img
                      src={sc.rawPreviewUrl}
                      alt="Original photo for corner adjustment"
                      draggable={false}
                      className="block h-auto w-auto max-h-[62vh] max-w-full"
                    />
                  )}

                  {rawW > 0 && sc.corners.length === 8 && (
                    <svg
                      viewBox={`0 0 ${rawW} ${rawH}`}
                      preserveAspectRatio="none"
                      className="absolute inset-0 h-full w-full pointer-events-none z-10"
                    >
                      <polygon
                        points={`${sc.corners[0]},${sc.corners[1]} ${sc.corners[2]},${sc.corners[3]} ${sc.corners[4]},${sc.corners[5]} ${sc.corners[6]},${sc.corners[7]}`}
                        fill="rgba(30, 81, 56, 0.2)"
                        stroke="var(--accent)"
                        strokeWidth={rawW * 0.004}
                      />
                    </svg>
                  )}

                  {rawW > 0 &&
                    sc.corners.length === 8 &&
                    [0, 1, 2, 3].map((idx) => (
                      <button
                        key={idx}
                        type="button"
                        aria-label={`Adjust corner ${idx + 1}`}
                        onPointerDown={(e) => handlePointerDown(idx, e)}
                        onPointerMove={(e) => handlePointerMove(idx, e)}
                        onPointerUp={(e) => handlePointerUp(idx, e)}
                        style={{
                          left: `${(sc.corners[idx * 2] / rawW) * 100}%`,
                          top: `${(sc.corners[idx * 2 + 1] / rawH) * 100}%`,
                        }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center z-30 cursor-grab active:cursor-grabbing touch-none focus:outline-none"
                      >
                        <span className="h-4 w-4 rounded-full bg-accent ring-4 ring-white/80 shadow-md transition-transform active:scale-125" />
                      </button>
                    ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-soft">
                  <Move className="h-3.5 w-3.5 inline mr-1" />
                  Drag the dots onto the paper&rsquo;s corners
                </span>
                <button
                  type="button"
                  onClick={() => {
                    sc.commitCornerChange();
                    setAdjusting(false);
                  }}
                  className="btn-primary min-h-12 px-8 text-sm"
                >
                  <IconCheck className="h-4.5 w-4.5 mr-1.5" />
                  Done adjusting
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
