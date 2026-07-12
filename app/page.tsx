"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVoice } from "@/components/GlobalVoice";
import { listForms } from "@/lib/storage/localHistoryStore";
import type { FormRecord } from "@/lib/types";
import {
  IconDoc,
  IconUpload,
  IconCamera,
  IconClock,
  IconUser,
  IconSettings,
  IconHelp,
  IconPlay,
  IconCheck,
  IconAlertCircle,
  IconWave,
  IconChevronRight,
  IconArrowRight,
  IconShield,
  IconMic,
  IconMessageSquare,
  IconSparkle,
  IconInfo
} from "@/components/icons";

export default function HomePage() {
  const router = useRouter();
  const voice = useVoice();
  const [recent, setRecent] = useState<FormRecord[]>([]);
  const [activeForm, setActiveForm] = useState<FormRecord | null>(null);
  const [selectedTip, setSelectedTip] = useState(0);

  const isListening = voice?.sttState === "listening";
  const messages = voice?.messages ?? [];

  useEffect(() => {
    loadRecent();
  }, []);

  async function loadRecent() {
    try {
      const list = await listForms();
      setRecent(list.slice(0, 5));
      const active = list.find((f) => f.status === "filling" || f.status === "processing");
      if (active) setActiveForm(active);
    } catch (e) {
      console.warn("Failed to load recent sessions:", e);
    }
  }

  const handleStartSession = (type: "upload" | "scan") => {
    router.push(type === "upload" ? "/upload" : "/scan");
  };

  const tips = [
    {
      title: "Speak Naturally",
      desc: "Swaram listens to normal conversational phrasing. You don't have to speak in rigid commands.",
      icon: <IconWave className="h-5 w-5 text-accent" />
    },
    {
      title: "Spelling Out Names",
      desc: "For complex names or codes, say 'let me spell' to dictate letter-by-letter with spelling helper bubbles.",
      icon: <IconSparkle className="h-5 w-5 text-accent" />
    },
    {
      title: "Quick Navigation",
      desc: "Say 'go back' to return to the previous field, or 'skip' to pass a section and answer it later.",
      icon: <IconChevronRight className="h-5 w-5 text-accent" />
    },
    {
      title: "Privacy Safeguards",
      desc: "Sensitive details like Aadhaar numbers are entered straight into the PDF and never saved to your profile.",
      icon: <IconShield className="h-5 w-5 text-accent" />
    }
  ];

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto page-transition bg-surface">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">
        
        {/* SECTION 1: WELCOME HERO BLOCK */}
        <div className="relative overflow-hidden rounded-[32px] border border-line bg-raised p-8 md:p-10 shadow-card">
          {/* Subtle Background Glow Vector */}
          <div className="absolute right-0 top-0 -mr-16 -mt-16 w-96 h-96 rounded-full bg-accent/5 blur-3xl pointer-events-none" />
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
            <div className="flex-1 flex flex-col gap-4 text-left">
              <span className="chip bg-accent-soft text-accent text-xs font-bold uppercase tracking-wider self-start">
                Swaram Assistant Active
              </span>
              <h1 className="font-display text-3xl md:text-5xl font-extrabold text-ink leading-tight">
                Fill Government Forms <br className="hidden md:inline" />
                <span className="text-accent">Using Your Voice</span>
              </h1>
              <p className="text-sm md:text-base text-soft max-w-xl font-medium leading-relaxed">
                Swaram is a voice-first accessibility workspace designed for blind and low-vision individuals. 
                Upload any form, and let our voice assistant read each field aloud, guide your answers, and auto-fill details securely.
              </p>
              
              <div className="flex flex-wrap items-center gap-4.5 mt-2">
                <button
                  onClick={() => handleStartSession("upload")}
                  className="btn btn-primary"
                >
                  <IconUpload className="h-4.5 w-4.5" />
                  <span>Upload Document</span>
                </button>
                <button
                  onClick={() => handleStartSession("scan")}
                  className="btn btn-secondary"
                >
                  <IconCamera className="h-4.5 w-4.5" />
                  <span>Scan Printed Form</span>
                </button>
              </div>
            </div>

            {/* Custom Interactive SVG Art Illustration */}
            <div className="w-full md:w-[320px] shrink-0 flex items-center justify-center">
              <svg className="w-64 h-64 text-accent drop-shadow-md" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Floating Document Circle */}
                <circle cx="100" cy="100" r="85" className="fill-accent-soft/30 stroke-line" strokeWidth="1" />
                
                {/* Concentric Audio Pulses */}
                <circle cx="100" cy="100" r="70" className="stroke-accent/10 fill-none" strokeWidth="2">
                  <animate attributeName="r" values="60;75;60" dur="4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.2;0.5;0.2" dur="4s" repeatCount="indefinite" />
                </circle>
                <circle cx="100" cy="100" r="55" className="stroke-accent/20 fill-none" strokeWidth="1.5">
                  <animate attributeName="r" values="50;65;50" dur="3s" repeatCount="indefinite" />
                </circle>

                {/* Styled Document Box */}
                <rect x="65" y="55" width="70" height="90" rx="8" className="fill-raised stroke-line" strokeWidth="2" />
                <path d="M75 75H125" className="stroke-soft" strokeWidth="2" strokeLinecap="round" />
                <path d="M75 90H115" className="stroke-soft" strokeWidth="2" strokeLinecap="round" />
                <path d="M75 105H125" className="stroke-soft" strokeWidth="2" strokeLinecap="round" />
                <path d="M75 120H100" className="stroke-soft" strokeWidth="2" strokeLinecap="round" />

                {/* Floating Microphone Bubble */}
                <circle cx="140" cy="130" r="28" className="fill-accent stroke-raised" strokeWidth="3" />
                <g transform="translate(130, 118) scale(0.85)">
                  <rect x="5" y="2" width="6" height="10" rx="3" className="fill-raised" />
                  <path d="M2 7C2 10.3 4.7 13 8 13C11.3 13 14 10.3 14 7" className="stroke-raised" strokeWidth="2" strokeLinecap="round" />
                  <line x1="8" y1="13" x2="8" y2="16" className="stroke-raised" strokeWidth="2" />
                </g>
              </svg>
            </div>
          </div>
        </div>

        {/* SECTION 2: BENTO MATRIX GRID */}
        <div className="bento-grid">
          
          {/* Column A: Left Workspace (Bento Large) */}
          <div className="bento-card-large flex flex-col gap-6">
            
            {/* Active Session Card (if one exists) */}
            {activeForm && (
              <div className="card border-accent/30 bg-accent-soft/20 p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                      <IconDoc className="h-5.5 w-5.5" />
                    </span>
                    <div>
                      <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Active Workspace</span>
                      <h3 className="font-display text-base font-extrabold text-ink leading-tight mt-0.5">
                        {activeForm.name}
                      </h3>
                    </div>
                  </div>
                  
                  <Link
                    href={`/fill/${activeForm.id}`}
                    className="btn btn-primary min-h-10 px-4 text-xs font-bold shrink-0 no-underline"
                  >
                    <span>Resume Filling</span>
                    <IconPlay className="h-3.5 w-3.5 fill-current" />
                  </Link>
                </div>
                
                <div className="flex flex-col gap-2 border-t border-line/50 pt-3">
                  <div className="flex justify-between text-xs font-bold text-soft">
                    <span>Overall Progress</span>
                    <span>
                      {Math.round(
                        (activeForm.fields.filter((f) => f.status === "answered" || f.status === "autofilled").length /
                          activeForm.fields.length) *
                          100
                      )}% Completed
                    </span>
                  </div>
                  <div className="h-2 bg-line rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-500"
                      style={{
                        width: `${
                          (activeForm.fields.filter((f) => f.status === "answered" || f.status === "autofilled").length /
                            activeForm.fields.length) *
                            100
                        }%`
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Conversation Log Box */}
            <div className="card p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div className="flex items-center gap-3">
                  <IconMessageSquare className="h-5.5 w-5.5 text-accent" />
                  <h3 className="font-display text-base font-extrabold text-ink">
                    Our Conversation
                  </h3>
                </div>
                {messages.length > 0 && (
                  <span className="chip bg-accent-soft text-accent text-[10px] font-bold uppercase">
                    Live Session
                  </span>
                )}
              </div>

              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4">
                  <div className="relative flex items-center justify-center w-16 h-16">
                    <span className="absolute inset-0 rounded-full bg-accent-soft/50 animate-ping" />
                    <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
                      <IconMic className="h-6 w-6" />
                    </span>
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-ink">No Speech Registered</h4>
                    <p className="text-xs text-soft max-w-sm mt-1 leading-relaxed font-semibold">
                      When you start a form-filling session, the transcription log of what I say and what you reply will appear here.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4 max-h-[350px] overflow-y-auto pr-2">
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col gap-1 max-w-[80%] ${
                        msg.sender === "user" ? "self-end items-end" : "self-start items-start"
                      }`}
                    >
                      <span className="text-[9px] font-bold text-faint uppercase tracking-wider px-1">
                        {msg.sender === "user" ? "You" : "Swaram"}
                      </span>
                      <div
                        className={`bubble ${
                          msg.sender === "user" ? "bubble-user" : "bubble-assistant"
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step-by-step Onboarding Checklist */}
            <div className="card p-6 flex flex-col gap-5">
              <h3 className="font-display text-base font-extrabold text-ink border-b border-line pb-3">
                How to use Swaram
              </h3>
              
              <div className="flex flex-col gap-4">
                {[
                  {
                    title: "Import Your Document",
                    desc: "Drag-and-drop your PDF form or capture a clear photo of the printed sheet using your camera.",
                    icon: <IconUpload className="h-5 w-5" />
                  },
                  {
                    title: "Let Swaram Parse the Structure",
                    desc: "Our engine localizes every fillable area, check box, and label using OCR analysis.",
                    icon: <IconDoc className="h-5 w-5" />
                  },
                  {
                    title: "Answer Questions by Speaking",
                    desc: "Speak naturally. Simply tell Swaram what to type in each field as they are read aloud.",
                    icon: <IconMic className="h-5 w-5" />
                  },
                  {
                    title: "Verify & Submit",
                    desc: "Swaram displays all completed fields for final confirmation, then exports a filled PDF.",
                    icon: <IconCheck className="h-5 w-5" />
                  }
                ].map((step, idx) => (
                  <div key={idx} className="flex gap-4 items-start group">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-surface border border-line text-soft group-hover:bg-accent-soft group-hover:text-accent transition-colors duration-300">
                      {step.icon}
                    </span>
                    <div className="text-left">
                      <h4 className="font-extrabold text-xs text-ink">{step.title}</h4>
                      <p className="text-xs text-soft font-semibold mt-0.5 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Column B: Right Side Control Column (Bento Small) */}
          <div className="bento-card-small flex flex-col gap-6">
            
            {/* Quick Suggestions / Tips Carousel */}
            <div className="card bg-[#092e2c] border-0 text-white p-6 flex flex-col gap-5 h-[340px] justify-between relative overflow-hidden">
              <div className="absolute right-0 bottom-0 -mr-10 -mb-10 w-44 h-44 rounded-full bg-teal-500/10 blur-xl pointer-events-none" />
              
              <div className="flex flex-col gap-4 relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300">Tips &amp; Tricks</span>
                  <IconSparkle className="h-4.5 w-4.5 text-teal-400" />
                </div>
                
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-8.5 w-8.5 place-items-center rounded-xl bg-teal-900/50 text-teal-300">
                      {tips[selectedTip].icon}
                    </span>
                    <h4 className="font-display text-sm font-bold text-white">
                      {tips[selectedTip].title}
                    </h4>
                  </div>
                  <p className="text-xs font-semibold leading-relaxed text-teal-100/90 mt-1">
                    {tips[selectedTip].desc}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center justify-between relative z-10 border-t border-teal-800/60 pt-3">
                <div className="flex gap-1.5">
                  {tips.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedTip(idx)}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        selectedTip === idx ? "w-4 bg-teal-400" : "w-1.5 bg-teal-800"
                      }`}
                      aria-label={`Go to tip ${idx + 1}`}
                    />
                  ))}
                </div>
                
                <button
                  onClick={() => setSelectedTip((prev) => (prev + 1) % tips.length)}
                  className="p-1 rounded-full hover:bg-teal-800/40 text-teal-300 transition-colors"
                >
                  <IconArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Recent Sessions list */}
            <div className="card p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2.5">
                  <IconClock className="h-5 w-5 text-accent" />
                  <h3 className="font-display text-base font-extrabold text-ink">
                    Recent Sessions
                  </h3>
                </div>
              </div>

              {recent.length === 0 ? (
                <div className="py-8 text-center text-xs font-semibold text-faint">
                  No sessions found
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {recent.map((form) => {
                    const answered = form.fields.filter((f) => f.status === "answered" || f.status === "autofilled").length;
                    const pct = Math.round((answered / form.fields.length) * 100);
                    return (
                      <Link
                        key={form.id}
                        href={`/fill/${form.id}`}
                        className="flex items-center justify-between p-3 rounded-2xl border border-line bg-surface hover:border-accent transition-all duration-300 group no-underline text-ink"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                            <IconDoc className="h-5 w-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-extrabold text-[12px] truncate leading-tight">
                              {form.name}
                            </h4>
                            <span className="text-[9.5px] text-faint font-bold uppercase tracking-wide block mt-0.5">
                              {pct}% complete
                            </span>
                          </div>
                        </div>
                        <IconChevronRight className="h-4 w-4 text-faint group-hover:text-ink group-hover:translate-x-0.5 transition-all" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Voice Commands Cheat Sheet Card */}
            <div className="card p-6 flex flex-col gap-4">
              <h3 className="font-display text-base font-extrabold text-ink border-b border-line pb-3">
                Command Cheat-sheet
              </h3>
              <div className="flex flex-col gap-3">
                {[
                  { text: "Go back", desc: "Returns to the previous form field" },
                  { text: "Repeat", desc: "Reads the current question again" },
                  { text: "Skip", desc: "Skips active question to answer later" },
                  { text: "Type instead", desc: "Toggles keyboard entry panel" },
                  { text: "Let me spell", desc: "Enables spelling dictation helper" },
                  { text: "Stop", desc: "Mutes active voice reading instantly" }
                ].map((cmd, idx) => (
                  <div key={idx} className="flex justify-between items-start text-xs border-b border-line/30 pb-2.5 last:border-0 last:pb-0">
                    <span className="font-mono font-bold bg-surface border border-line px-1.5 py-0.5 rounded text-ink text-[10px]">
                      {cmd.text}
                    </span>
                    <span className="text-[11px] font-semibold text-soft text-right max-w-[150px]">
                      {cmd.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
