"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useVoicePage } from "@/components/GlobalVoice";
import { getFile, getForm, saveFile, saveForm } from "@/lib/storage/localHistoryStore";
import type { FormRecord } from "@/lib/types";
import { generateFilledPdf } from "@/lib/pdf/pdfWriter";
import { extractProfileUpdates } from "@/lib/matching/fuzzyProfileMatch";
import { mergeIntoProfile } from "@/lib/storage/profileStore";
import { speak, cancelSpeech } from "@/lib/voice/textToSpeech";
import { motion } from "framer-motion";
import {
  IconCheck,
  IconDownload,
  IconShare,
  IconPrinter,
  IconWave,
  IconPause,
  IconHome,
  IconDoc,
  IconArrowLeft,
  IconInfo
} from "@/components/icons";

export default function CompletePage() {
  const { formId } = useParams<{ formId: string }>();
  const startedRef = useRef(false);
  const [record, setRecord] = useState<FormRecord | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState("Preparing your filled form…");
  const [tone, setTone] = useState<"info" | "success" | "warning" | "error">("info");
  const [profileOffer, setProfileOffer] = useState<Record<string, string> | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [reading, setReading] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useVoicePage(
    {
      title: "Export form",
      description:
        "Your filled form is ready. Say download, share, print, read the form, or save my details.",
      commands: [
        [/download/, () => download(), "download"],
        [/share|whatsapp|send/, () => share(), "share"],
        [/print/, () => print(), "print"],
        [/read (the |my |back )?(form|answers)/, () => readBack(), "read the form"],
        [/save (my )?(details|profile|answers)/, () => saveProfile(), "save my details"],
        [/don'?t save|no thanks/, () => setProfileOffer(null), "don't save"],
      ],
    },
    [pdfUrl, profileOffer !== null, reading],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    build();
    return () => cancelSpeech();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function build() {
    try {
      const form = await getForm(formId);
      if (!form) {
        setTone("error");
        setStatus("I could not find this form.");
        return;
      }
      const original = await getFile(formId, "original");
      if (!original) {
        setTone("error");
        setStatus("The original file is missing, so I cannot create the filled PDF.");
        return;
      }

      const filled = await generateFilledPdf(original, form.fields, {
        sourceType: form.sourceType,
        isAcroForm: form.isAcroForm,
      });
      await saveFile(formId, "filled", filled);
      const updated: FormRecord = { ...form, status: "complete" };
      await saveForm(updated);
      setRecord(updated);
      setPdfBlob(filled);
      setPdfUrl(URL.createObjectURL(filled));
      if (typeof navigator !== "undefined" && "share" in navigator) setCanShare(true);

      const updates = extractProfileUpdates(form.fields);
      if (Object.keys(updates).length > 0) setProfileOffer(updates);

      setTone("success");
      const message = "Your form is filled and ready. Say download, share, or print.";
      setStatus(message);
      speak(
        message +
          (Object.keys(updates).length > 0
            ? " Want me to remember these details for next time? Say save my details, or don't save."
            : ""),
      );
    } catch {
      setTone("error");
      setStatus("Something went wrong while creating the PDF. Please try again from the review screen.");
    }
  }

  function download() {
    if (!pdfUrl || !record) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = record.name.replace(/\.(pdf|jpe?g|png)$/i, "") + " - filled.pdf";
    a.click();
    setStatus("Download started. Check your downloads folder.");
    speak("Downloading. Check your downloads folder.");
  }

  async function share() {
    if (!pdfBlob || !record) return;
    try {
      const file = new File([pdfBlob], record.name.replace(/\.(pdf|jpe?g|png)$/i, "") + " - filled.pdf", {
        type: "application/pdf",
      });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Filled form" });
      } else {
        await navigator.share({ title: "Filled form", text: "My filled form from Swaram." });
      }
    } catch {
      // user closed the share sheet
    }
  }

  function print() {
    if (!pdfUrl) return;
    const win = window.open(pdfUrl, "_blank");
    win?.addEventListener("load", () => win.print());
    setStatus("Opening the form for printing.");
  }

  async function readBack() {
    if (!record || reading) {
      cancelSpeech();
      setReading(false);
      return;
    }
    setReading(true);
    await speak("Here is your completed form.", { interrupt: true });
    for (const field of [...record.fields].sort((a, b) => a.order - b.order)) {
      await speak(`${field.label}: ${field.value || "blank"}.`, { interrupt: false });
    }
    setReading(false);
  }

  function saveProfile() {
    if (!profileOffer) return;
    mergeIntoProfile(profileOffer);
    setProfileSaved(true);
    setStatus("Saved. Next time I can fill these automatically.");
    speak("Saved. Next time I can fill these automatically.");
  }

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.96 },
    visible: { opacity: 1, scale: 1, transition: { type: "spring" as const, stiffness: 140, damping: 15 } },
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 animate-fade-in pb-16">
      <div className="flex flex-col items-center gap-4 pt-8 text-center">
        <span aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-ok-soft text-ok shadow-sm shadow-emerald-500/10 animate-bounce">
          <IconCheck className="h-8 w-8" strokeWidth={3} />
        </span>
        <h1 className="font-display text-2xl font-black text-ink mt-2">Your form is ready</h1>
        <StatusAnnouncer message={status} tone={tone} />
      </div>

      <motion.section
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className="card p-6 border-line bg-raised shadow-sm"
        aria-label="Export options"
      >
        <h2 className="font-display text-base font-bold text-ink mb-4 border-b border-line pb-2.5">
          What would you like to do?
        </h2>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <button type="button" className="btn-primary min-h-11 text-xs shadow-sm hover:scale-[1.01]" onClick={download} disabled={!pdfUrl}>
            <IconDownload className="h-4.5 w-4.5" />
            Download PDF
          </button>
          
          {canShare && (
            <button type="button" className="btn-secondary min-h-11 text-xs" onClick={share} disabled={!pdfBlob}>
              <IconShare className="h-4.5 w-4.5" />
              Share File
            </button>
          )}
          
          <button type="button" className="btn-secondary min-h-11 text-xs" onClick={print} disabled={!pdfUrl}>
            <IconPrinter className="h-4.5 w-4.5" />
            Print Form
          </button>
          
          <button type="button" className="btn-secondary min-h-11 text-xs" onClick={readBack}>
            {reading ? <IconPause className="h-4.5 w-4.5" /> : <IconWave className="h-4.5 w-4.5" />}
            {reading ? "Stop reading" : "Read back form"}
          </button>
        </div>
      </motion.section>

      {profileOffer && (
        <motion.section
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="card p-6 border-line bg-raised shadow-sm flex flex-col gap-4.5"
          aria-label="Save to profile"
        >
          <div>
            <h2 className="font-display text-base font-bold text-ink flex items-center gap-2">
              <IconInfo className="h-4.5 w-4.5 text-accent" />
              Remember these details?
            </h2>
            <p className="text-xs text-soft font-semibold leading-relaxed mt-1">
              With your permission, I can save these to your local profile to autofill them on future forms automatically. Sensitives like Aadhaar will never be saved.
            </p>
          </div>

          <ul className="flex flex-col gap-2 list-none p-0 border border-line rounded-2xl bg-surface/50 p-4">
            {Object.entries(profileOffer).map(([key, value]) => (
              <li key={key} className="flex justify-between gap-3 border-b border-line last:border-0 pb-2 last:pb-0 pt-2 first:pt-0 text-xs">
                <span className="font-bold text-soft capitalize">{key.replace(/_/g, " ")}</span>
                <span className="font-semibold text-ink truncate max-w-[200px]">{value}</span>
              </li>
            ))}
          </ul>

          {profileSaved ? (
            <p className="flex items-center gap-2 text-xs font-bold text-ok leading-none">
              <IconCheck className="h-4.5 w-4.5" />
              Saved to your profile.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2.5 mt-1">
              <button type="button" className="btn-primary min-h-10 px-5 text-xs shadow-sm" onClick={saveProfile}>
                Yes, remember them
              </button>
              <button type="button" className="btn-secondary min-h-10 px-4 text-xs font-semibold" onClick={() => setProfileOffer(null)}>
                No, don&apos;t save
              </button>
            </div>
          )}
        </motion.section>
      )}

      <div className="flex flex-wrap justify-center gap-3 border-t border-line/65 pt-6 mt-4">
        <Link href="/" className="btn-secondary min-h-10 px-6 text-xs font-bold">
          <IconHome className="h-4 w-4" />
          Go Home
        </Link>
        <Link href="/history" className="btn-secondary min-h-10 px-6 text-xs font-bold">
          <IconDoc className="h-4 w-4" />
          My Forms
        </Link>
        <Link href={`/review/${formId}`} className="btn-secondary min-h-10 px-6 text-xs font-bold">
          <IconArrowLeft className="h-4 w-4" />
          Back to Review
        </Link>
      </div>
    </div>
  );
}
