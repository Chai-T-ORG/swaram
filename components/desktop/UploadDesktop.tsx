"use client";

/**
 * Upload, desktop (spec D3) — one centered dashed drop zone, the current
 * instruction as a calm caption, keyboard/voice affordances spelled out.
 */

import { motion } from "framer-motion";
import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useUploadScreen } from "@/components/screens/useUploadScreen";
import { IconArrowLeft, IconUpload, IconDoc, IconCamera, IconLoader } from "@/components/icons";

export default function UploadDesktop() {
  const { inputRef, status, tone, progress, dragging, setDragging, isArmed, handleFile, openPicker } = useUploadScreen();

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="mx-auto flex w-full max-w-2xl flex-col gap-8"
    >
      <nav aria-label="Breadcrumb" className="self-start">
        <Link href="/" className="link-plain inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
          <IconArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </nav>

      <header>
        <span className="eyebrow">Import a form</span>
        <h1 className="mt-1 font-display text-4xl text-ink">Upload your document</h1>
        <p className="mt-2 text-sm text-soft">
          Pick a PDF or a photo of the form — I&rsquo;ll read it and ask you each question aloud.
        </p>
      </header>

      <StatusAnnouncer message={status} tone={tone} />

      <div
        role="presentation"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`card flex flex-col items-center gap-6 py-16 text-center transition-all duration-300 ${
          dragging
            ? "marching-border shadow-xl bg-accent-soft/30 scale-[1.01]"
            : isArmed
            ? "dropzone-armed border-2 border-dashed border-accent"
            : "border-2 border-dashed border-line bg-raised hover:border-accent/40"
        }`}
      >
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <IconUpload className="h-6.5 w-6.5" />
        </span>

        <div>
          <h2 className="font-display text-xl text-ink">Drop your form here</h2>
          <p className="mt-1 text-sm text-soft">PDF, JPEG, or PNG — up to 50 MB</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="sr-only"
          id="file-input"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        <button type="button" className="btn-primary" onClick={openPicker}>
          <IconDoc className="h-4.5 w-4.5" />
          <span>Choose a file</span>
        </button>

        <p className="text-xs font-semibold uppercase tracking-wide text-faint">
          or hold{" "}
          <kbd className="rounded-lg border border-line bg-surface px-2 py-0.5 font-mono text-[10px] text-ink shadow-sm">
            Space
          </kbd>{" "}
          and say &ldquo;choose file&rdquo;
        </p>
      </div>

      {progress !== null && (
        <div className="card flex flex-col gap-3 p-5">
          <div className="flex items-center justify-between text-xs font-bold text-ink">
            <span className="flex items-center gap-1.5">
              <IconLoader className="h-4 w-4 text-accent" />
              Reading your document…
            </span>
            <span>{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 w-full overflow-hidden rounded-full bg-line"
          >
            <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <p className="text-sm text-soft">
        Prefer the camera?{" "}
        <Link href="/scan" className="link-plain inline-flex items-center gap-1 font-semibold">
          <IconCamera className="h-3.5 w-3.5" />
          <span>Scan a paper form instead</span>
        </Link>
        .
      </p>

      <p className="text-xs text-faint">
        Files are read entirely inside your browser — nothing is uploaded to a server.
      </p>
    </motion.div>
  );
}
