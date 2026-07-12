"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useVoicePage } from "@/components/GlobalVoice";
import { saveFile, saveForm } from "@/lib/storage/localHistoryStore";
import { newId, type FormRecord } from "@/lib/types";
import { speak } from "@/lib/voice/textToSpeech";
import { motion } from "framer-motion";
import {
  IconArrowLeft,
  IconUpload,
  IconDoc,
  IconCamera,
  IconLoader,
  IconInfo,
  IconShield,
  IconCheck,
  IconHelp
} from "@/components/icons";

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("Choose a PDF, JPG, or PNG up to 50 megabytes.");
  const [tone, setTone] = useState<"info" | "warning" | "error" | "success">("info");
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // Browsers only open the file dialog from a real tap/click — never from a
  // voice callback. So "choose file" arms this flag, and the very next tap
  // anywhere on the page opens the picker.
  const armedRef = useRef(false);

  function openPicker() {
    inputRef.current?.click();
  }

  function armPicker() {
    armedRef.current = true;
    const msg = "To choose your file, tap anywhere on the screen.";
    setStatus(msg);
    setTone("info");
    speak(msg);
  }

  useEffect(() => {
    function onAnyTap() {
      if (armedRef.current) {
        armedRef.current = false;
        openPicker();
      }
    }
    window.addEventListener("pointerdown", onAnyTap);
    return () => window.removeEventListener("pointerdown", onAnyTap);
  }, []);

  useVoicePage({
    title: "Upload a form",
    hint: "Say choose file, then tap anywhere to open the picker. Or say scan to use the camera.",
    description:
      "Upload page. Pick a PDF or a photo of your form, up to fifty megabytes. Say choose file and then tap anywhere to open the picker, or say scan to use the camera instead.",
    commands: [
      [/choose (a )?file|pick (a )?file|browse|open file|select (a )?file/, () => armPicker(), "choose file"],
    ],
  });

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    const isAccepted = ACCEPTED.includes(file.type) || /\.(pdf|jpe?g|png)$/i.test(file.name);
    if (!isAccepted) {
      setTone("error");
      const message = `${file.name} is not a supported file. Please choose a PDF, JPG, or PNG.`;
      setStatus(message);
      speak(message);
      return;
    }
    if (file.size > MAX_BYTES) {
      setTone("error");
      const message = "That file is larger than 50 megabytes. Please choose a smaller file.";
      setStatus(message);
      speak(message);
      return;
    }

    try {
      setTone("info");
      setStatus(`Reading ${file.name}…`);
      setProgress(0);
      const bytes = await readWithProgress(file, (pct) => setProgress(pct));
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const record: FormRecord = {
        id: newId(),
        name: file.name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: "processing",
        sourceType: isPdf ? "pdf" : "image",
        isAcroForm: false,
        pageCount: 0,
        pageDims: [],
        fields: [],
      };
      await saveFile(
        record.id,
        "original",
        new Blob([bytes], { type: file.type || (isPdf ? "application/pdf" : "image/jpeg") }),
      );
      await saveForm(record);
      setProgress(100);
      setTone("success");
      setStatus(`${file.name} uploaded. Analyzing your form now.`);
      speak("Got it. Analyzing your form now.");
      router.push(`/processing/${record.id}`);
    } catch {
      setProgress(null);
      setTone("error");
      const message = "Something went wrong while reading that file. Please try again.";
      setStatus(message);
      speak(message);
    }
  }

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto page-transition bg-surface">
      <div className="max-w-2xl mx-auto flex flex-col gap-8 text-left">
        
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="self-start">
          <Link href="/" className="link-plain inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
            <IconArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </nav>

        {/* Header Title */}
        <header className="border-b border-line pb-4 flex flex-col md:flex-row justify-between md:items-end gap-4">
          <div>
            <span className="eyebrow mb-1">Import File</span>
            <h1 className="font-display text-3xl font-extrabold text-ink tracking-tight">Upload Your Document</h1>
            <p className="text-xs text-soft font-semibold mt-1">
              Select or drop your PDF application form to begin voice-assisted form filling.
            </p>
          </div>
        </header>

        <StatusAnnouncer message={status} tone={tone} />

        {/* Drag & Drop Card Panel */}
        <motion.div
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
          className={`card flex flex-col items-center gap-6 border-2 border-dashed py-16 text-center transition-all duration-300 ${
            dragging
              ? "border-accent bg-accent-soft/40 scale-[1.01] shadow-xl shadow-accent/5"
              : "border-line bg-raised hover:border-accent/40"
          }`}
        >
          <div className="relative flex items-center justify-center w-16 h-16">
            {dragging && (
              <span className="absolute inset-0 rounded-2xl bg-accent-soft/60 animate-ping" />
            )}
            <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
              <IconUpload className="h-6.5 w-6.5" />
            </span>
          </div>
          
          <div>
            <h3 className="text-base font-extrabold text-ink">Drop your form file here</h3>
            <p className="text-xs text-soft font-semibold mt-1">PDF, JPEG, or PNG &mdash; up to 50 MB</p>
          </div>

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
            className="btn btn-primary min-h-10 text-xs px-6 font-bold"
            onClick={() => inputRef.current?.click()}
          >
            <IconDoc className="h-4.5 w-4.5" />
            <span>Select File</span>
          </button>

          <p className="text-xs text-faint font-bold uppercase tracking-wide">
            or press <kbd className="rounded-lg border border-line bg-surface px-2 py-0.5 font-mono text-[10px] shadow-sm text-ink">Space</kbd> and say
            &ldquo;choose file&rdquo;
          </p>
        </motion.div>

        {/* Upload Progress Loader Card */}
        {progress !== null && (
          <div className="card p-5 border-line bg-raised shadow-sm flex flex-col gap-3">
            <div className="flex justify-between items-center text-xs font-bold text-ink">
              <span className="flex items-center gap-1.5 font-bold">
                <IconLoader className="h-4 w-4 text-accent" />
                Reading document data...
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

        {/* Security & Privacy Banner */}
        <div className="card flex gap-4 border-line bg-raised shadow-sm">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <IconShield className="h-5 w-5" />
          </span>
          <div>
            <h2 className="mb-1 font-bold text-sm text-ink">Privacy &amp; Security Guaranteed</h2>
            <p className="text-xs text-soft font-semibold leading-relaxed">
              Your uploaded files are processed entirely inside your browser using client-side libraries. No document data is ever sent to external cloud storage APIs.
            </p>
          </div>
        </div>

        {/* Footer Alternative Scan Link */}
        <p className="text-xs text-soft font-semibold">
          Prefer the camera?{" "}
          <Link href="/scan" className="link-plain inline-flex items-center gap-1 font-bold">
            <IconCamera className="h-3.5 w-3.5" />
            <span>Scan a paper form instead</span>
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function readWithProgress(file: File, onProgress: (pct: number) => void): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
