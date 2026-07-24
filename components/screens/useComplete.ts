"use client";

/**
 * Complete/export screen logic — builds the filled PDF exactly once
 * (startedRef guard), offers download/share/print/read-back, and the
 * save-to-profile offer. Moved verbatim from the old page.
 */

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useVoice, useVoicePage } from "@/components/voice/VoiceProvider";
import { getFile, getForm, saveFile, saveForm } from "@/lib/storage/localHistoryStore";
import type { FormRecord } from "@/lib/types";
import { fieldDisplayValue } from "@/lib/analysis/tableCells";
import { generateFilledPdf } from "@/lib/pdf/pdfWriter";
import { extractProfileUpdates } from "@/lib/matching/fuzzyProfileMatch";
import { mergeIntoProfile } from "@/lib/storage/profileStore";
import { speak, cancelSpeech } from "@/lib/voice/textToSpeech";

export type CompleteTone = "info" | "success" | "warning" | "error";

export function useComplete() {
  const { formId } = useParams<{ formId: string }>();
  const voice = useVoice();
  const startedRef = useRef(false);
  const [record, setRecord] = useState<FormRecord | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState("Preparing your filled form…");
  const [tone, setTone] = useState<CompleteTone>("info");
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
      voice?.transitionConversation({ type: "COMPLETED" });
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
      const message = "Something went wrong while creating the PDF. Please try again from the review screen.";
      setStatus(message);
      voice?.transitionConversation({ type: "ERROR", message });
      speak(message);
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
      await speak(`${field.label}: ${fieldDisplayValue(field) || "blank"}.`, { interrupt: false });
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

  return {
    formId,
    record,
    pdfUrl,
    pdfBlob,
    status,
    tone,
    profileOffer,
    setProfileOffer,
    profileSaved,
    reading,
    canShare,
    download,
    share,
    print,
    readBack,
    saveProfile,
  };
}

export type CompleteScreen = ReturnType<typeof useComplete>;
