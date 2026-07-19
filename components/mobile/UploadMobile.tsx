"use client";

/**
 * Upload, mobile (spec M3) — full-width choose card, big touch targets, and a
 * clear road to the camera. The same hidden input and voice contract as
 * desktop.
 */

import { motion } from "framer-motion";
import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useUploadScreen } from "@/components/screens/useUploadScreen";
import { IconUpload, IconCamera, IconLoader, IconChevronRight } from "@/components/icons";

export default function UploadMobile() {
  const { inputRef, status, tone, progress, dragging, setDragging, isArmed, handleFile, openPicker } = useUploadScreen();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="flex flex-col gap-6 pb-6"
    >
      <header>
        <span className="eyebrow">Import a form</span>
        <h1 className="mt-1 font-display text-[1.75rem] leading-tight text-ink">Upload your document</h1>
      </header>

      <StatusAnnouncer message={status} tone={tone} />

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        className="sr-only"
        id="file-input"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <button
        type="button"
        onClick={openPicker}
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
        className={`card flex min-h-24 cursor-pointer items-center gap-4 p-5 text-left transition-all duration-300 ${
          dragging
            ? "marching-border shadow-xl bg-accent-soft/30 scale-[1.01]"
            : isArmed
            ? "dropzone-armed border-2 border-dashed border-accent"
            : "border-2 border-dashed border-line bg-raised hover:border-accent/40"
        }`}
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent">
          <IconUpload className="h-6.5 w-6.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg text-ink">Choose a file</span>
          <span className="block text-[13px] text-soft">PDF, JPEG, or PNG — up to 50 MB</span>
        </span>
        <IconChevronRight className="h-5 w-5 shrink-0 text-faint" />
      </button>

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

      <Link
        href="/scan"
        className="card flex min-h-16 items-center gap-4 p-5 no-underline text-ink"
      >
        <span className="grid h-13 w-13 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          <IconCamera className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg text-ink">Scan with the camera</span>
          <span className="block text-[13px] text-soft">For printed paper forms</span>
        </span>
        <IconChevronRight className="h-5 w-5 shrink-0 text-faint" />
      </Link>

      <p className="text-center text-xs leading-relaxed text-faint">
        You can also say <span className="font-semibold text-soft">&ldquo;choose file&rdquo;</span>, then tap anywhere to open
        the picker. Files are read entirely on this phone.
      </p>
    </motion.div>
  );
}
