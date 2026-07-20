"use client";

/**
 * Upload screen logic — shared by the mobile and desktop bodies.
 *
 * Load-bearing contracts kept intact:
 *  - the hidden <input type="file"> the views render from `inputRef` is what
 *    the e2e drives (page.$('input[type="file"]') + uploadFile);
 *  - "choose file" by voice can't open a file dialog directly (browsers
 *    require a real tap), so armPicker() arms a flag and the very next tap
 *    anywhere opens the picker.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVoicePage } from "@/components/voice/VoiceProvider";
import { saveFile, saveForm } from "@/lib/storage/localHistoryStore";
import { newId, type FormRecord } from "@/lib/types";
import { speak } from "@/lib/voice/textToSpeech";
import { loadOpenCv, autoCropImageBlob } from "@/lib/vision/shapeDetector";
import { imagesToPdf } from "@/lib/pdf/imagesToPdf";

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];

export type UploadTone = "info" | "warning" | "error" | "success";

export function useUploadScreen() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("Choose a PDF, JPG, or PNG up to 50 megabytes.");
  const [tone, setTone] = useState<UploadTone>("info");
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isArmed, setIsArmed] = useState(false);
  // Browsers only open the file dialog from a real tap/click — never from a
  // voice callback. So "choose file" arms this flag, and the very next tap
  // anywhere on the page opens the picker.
  const armedRef = useRef(false);

  function openPicker() {
    inputRef.current?.click();
  }

  function armPicker() {
    armedRef.current = true;
    setIsArmed(true);
    const msg = "To choose your file, tap anywhere on the screen.";
    setStatus(msg);
    setTone("info");
    speak(msg);
  }

  useEffect(() => {
    function onAnyTap() {
      if (armedRef.current) {
        armedRef.current = false;
        setIsArmed(false);
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
      // Page commands are matched before the global nav commands, so this also
      // claims the regional words for "file" (which otherwise read as "go to
      // upload") and opens the picker instead. The adaptive router covers any
      // other phrasing.
      [
        /choose (a )?file|pick (a )?file|browse|open( the)? file|select (a )?file|फ़ाइल|फाइल चुन|फाइल खोल|ഫയൽ|തിരഞ്ഞെടുക്ക|fichier|choisir|parcourir/iu,
        () => armPicker(),
        "choose file",
      ],
    ],
    // Adaptive router vocabulary: any phrasing / language for "pick a file"
    // resolves here without a hand-written keyword (e.g. Malayalam, or
    // "open the file browser", "let me select my document").
    actions: [
      {
        id: "choose_file",
        description:
          "Open the file picker to choose a PDF or photo of the form saved on this device.",
        run: () => armPicker(),
      },
    ],
  });

  async function handleFiles(fileList: FileList | File[] | undefined | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    let hasPdf = false;
    let hasImage = false;
    for (const f of files) {
      const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      const isImg = f.type.startsWith("image/") || /\.(jpe?g|png)$/i.test(f.name);
      if (isPdf) hasPdf = true;
      if (isImg) hasImage = true;
      if (!isPdf && !isImg) {
        setTone("error");
        const message = `${f.name} is not a supported file. Please choose PDF, JPG, or PNG.`;
        setStatus(message);
        speak(message);
        return;
      }
    }

    if (hasPdf && hasImage) {
      setTone("error");
      const message = "Please upload either a single PDF or multiple images, but not a mix.";
      setStatus(message);
      speak(message);
      return;
    }

    if (hasPdf && files.length > 1) {
      setTone("error");
      const message = "Please upload only one PDF at a time.";
      setStatus(message);
      speak(message);
      return;
    }

    for (const f of files) {
      if (f.size > MAX_BYTES) {
        setTone("error");
        const message = `${f.name} is larger than 50 megabytes. Please choose smaller files.`;
        setStatus(message);
        speak(message);
        return;
      }
    }

    try {
      setTone("info");
      setStatus(`Processing ${files.length} file${files.length > 1 ? "s" : ""}…`);
      setProgress(0);

      let finalBlob: Blob;
      let finalName = files[0].name;

      if (hasPdf) {
        const bytes = await readWithProgress(files[0], (pct) => setProgress(pct));
        finalBlob = new Blob([bytes], { type: "application/pdf" });
      } else {
        await loadOpenCv();
        const croppedBlobs: Blob[] = [];
        for (let i = 0; i < files.length; i++) {
          setStatus(`Processing image ${i + 1} of ${files.length}…`);
          const result = await autoCropImageBlob(files[i]);
          croppedBlobs.push(result);
          setProgress(Math.round(((i + 1) / files.length) * 50));
        }
        setStatus("Creating PDF from images...");
        finalBlob = await imagesToPdf(croppedBlobs);
        setProgress(100);
      }

      const record: FormRecord = {
        id: newId(),
        name: finalName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: "processing",
        sourceType: "pdf",
        isAcroForm: false,
        pageCount: 0,
        pageDims: [],
        fields: [],
      };

      await saveFile(record.id, "original", finalBlob);
      await saveForm(record);
      setTone("success");
      setStatus(`${files.length} file${files.length > 1 ? "s" : ""} uploaded. Analyzing your form now.`);
      speak("Got it. Analyzing your form now.");
      router.push(`/processing/${record.id}`);
    } catch {
      setProgress(null);
      setTone("error");
      const message = "Something went wrong while processing. Please try again.";
      setStatus(message);
      speak(message);
    }
  }

  return { inputRef, status, tone, progress, dragging, setDragging, isArmed, handleFiles, openPicker };
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
