"use client";

/**
 * Scan, mobile (spec M4) — full-bleed camera with the guidance caption pinned
 * on top and a 72px capture button under the thumb. Safe-area aware.
 */

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useScanCapture } from "@/components/screens/useScanCapture";
import { IconCamera, IconUpload, IconAlertCircle } from "@/components/icons";

export default function ScanMobile() {
  const sc = useScanCapture();
  const prefersReducedMotion = useReducedMotion();

  const bracketClass = sc.isDocumentDetected
    ? "border-accent scale-105" + (prefersReducedMotion ? "" : " animate-pulse")
    : "border-faint/30 scale-100";

  return (
    <div className="flex flex-col gap-5 pb-6 animate-fade-in">
      <header>
        <span className="eyebrow">Scan a paper form</span>
        <h1 className="mt-1 font-display text-[1.75rem] leading-tight text-ink">Hold it up — I&rsquo;ll guide you</h1>
      </header>

      <StatusAnnouncer message={sc.guidance} tone={sc.tone} />

      {/* Full-bleed camera viewport */}
      <div className="-mx-5 relative aspect-[3/4] overflow-hidden bg-ink">
        <motion.video
          ref={sc.videoRef}
          playsInline
          muted
          aria-label="Camera preview"
          className="absolute inset-0 h-full w-full object-cover"
          animate={{
            scale: sc.cameraState === "captured" ? 0.95 : 1
          }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        />

        {sc.cameraState === "active" && <div className="laser-line" />}

        {sc.cameraState === "captured" && !prefersReducedMotion && (
          <motion.div
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="absolute inset-0 z-50 bg-white pointer-events-none"
          />
        )}

        <div aria-hidden="true" className="pointer-events-none absolute inset-5">
          {[
            "top-0 left-0 border-t-2 border-l-2",
            "top-0 right-0 border-t-2 border-r-2",
            "bottom-0 left-0 border-b-2 border-l-2",
            "bottom-0 right-0 border-b-2 border-r-2",
          ].map((pos) => (
            <span key={pos} className={`absolute h-10 w-10 transition-all duration-300 ${bracketClass} ${pos}`} />
          ))}
        </div>

        {sc.cameraState === "idle" && (
          <div className="absolute inset-0 grid place-items-center bg-ink/40 backdrop-blur-[1px]">
            <button type="button" className="btn-primary min-h-14 px-8" onClick={sc.startCamera}>
              <IconCamera className="h-5 w-5" />
              Start camera
            </button>
          </div>
        )}

        {/* Big round capture button over the viewport */}
        {sc.cameraState === "active" && (
          <div className="absolute inset-x-0 bottom-5 flex justify-center">
            <button
              type="button"
              onClick={sc.capture}
              aria-label="Capture now"
              className="grid h-18 w-18 cursor-pointer place-items-center rounded-full border-4 border-surface bg-accent text-on-accent shadow-float"
            >
              <IconCamera className="h-7 w-7" />
            </button>
          </div>
        )}
      </div>

      {sc.cameraState === "error" && (
        <button type="button" className="btn-primary min-h-14 w-full" onClick={sc.startCamera}>
          Try camera again
        </button>
      )}

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

      <div className="flex flex-col gap-2.5">
        <button type="button" className="btn-secondary min-h-13 w-full" onClick={sc.openFilePicker}>
          <IconCamera className="h-4 w-4" />
          Use the camera app instead
        </button>
        <Link href="/upload" className="btn-secondary min-h-13 w-full no-underline">
          <IconUpload className="h-4 w-4" />
          Upload a file instead
        </Link>
      </div>

      {sc.cvReady === false && sc.cameraState !== "idle" && (
        <div className="card flex gap-3 border-warn/25 bg-warn-soft p-4 text-warn" role="status">
          <IconAlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-xs font-semibold leading-relaxed">
            Auto-capture is off on this device. Hold the form flat, fill the frame, and say capture.
          </p>
        </div>
      )}

      <p className="text-center text-xs leading-relaxed text-faint">
        Avoid glare · keep the paper flat · all four corners in the frame
      </p>
    </div>
  );
}
