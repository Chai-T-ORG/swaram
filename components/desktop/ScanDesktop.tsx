"use client";

/**
 * Scan, desktop (spec D4) — centered rounded camera viewport with corner
 * brackets, the guidance line as a calm caption, capture controls, and a
 * tips card.
 */

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useScanCapture } from "@/components/screens/useScanCapture";
import { IconArrowLeft, IconCamera, IconUpload, IconSparkle, IconAlertCircle } from "@/components/icons";

export default function ScanDesktop() {
  const sc = useScanCapture();
  const prefersReducedMotion = useReducedMotion();

  const bracketClass = sc.isDocumentDetected
    ? "border-accent scale-105" + (prefersReducedMotion ? "" : " animate-pulse")
    : "border-faint/30 scale-100";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-7 animate-fade-in">
      <nav aria-label="Breadcrumb">
        <Link href="/" className="link-plain inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
          <IconArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </nav>

      <header>
        <span className="eyebrow">Scan a paper form</span>
        <h1 className="mt-1 font-display text-4xl text-ink">Hold it up — I&rsquo;ll guide you</h1>
      </header>

      <StatusAnnouncer message={sc.guidance} tone={sc.tone} />

      <div className="card overflow-hidden p-0">
        <div className="relative aspect-video w-full overflow-hidden bg-ink">
          <motion.video
            ref={sc.videoRef}
            playsInline
            muted
            aria-label="Camera preview"
            className="absolute inset-0 h-full w-full object-contain"
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

          <div aria-hidden="true" className="pointer-events-none absolute inset-6">
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
              <button type="button" className="btn-primary min-h-13 px-8" onClick={sc.startCamera}>
                <IconCamera className="h-4.5 w-4.5" />
                Start camera
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {sc.cameraState === "active" && (
          <button type="button" className="btn-primary min-h-12 px-8" onClick={sc.capture}>
            Capture now
          </button>
        )}
        {sc.cameraState === "error" && (
          <button type="button" className="btn-primary min-h-12 px-6" onClick={sc.startCamera}>
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

        <button type="button" className="btn-secondary min-h-12 px-5 text-sm" onClick={sc.openFilePicker}>
          <IconCamera className="h-4 w-4" />
          Use device camera app
        </button>

        <Link href="/upload" className="btn-secondary min-h-12 px-5 text-sm no-underline">
          <IconUpload className="h-4 w-4" />
          Upload instead
        </Link>
      </div>

      {sc.cvReady === false && sc.cameraState !== "idle" && (
        <div className="card flex gap-3 border-warn/25 bg-warn-soft p-4 text-warn" role="status">
          <IconAlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-xs font-semibold leading-relaxed">
            Automatic framing guidance is unavailable on this device, so auto-capture is off. Hold the form flat, fill
            the frame, and say capture.
          </p>
        </div>
      )}

      <section className="card p-6">
        <h2 className="mb-3.5 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink">
          <IconSparkle className="h-4.5 w-4.5 text-accent" />
          Tips for a clear scan
        </h2>
        <ul className="m-0 list-none space-y-2.5 p-0 text-sm text-soft">
          {[
            "Avoid glare and bright reflections.",
            "Keep the paper flat — no folds or curls.",
            "Keep all four corners inside the frame.",
            "Hold steady; I capture the moment it looks sharp.",
          ].map((tip) => (
            <li key={tip} className="flex items-start gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              {tip}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
