"use client";

import { useState } from "react";
import Link from "next/link";
import Waveform from "@/components/Waveform";
import { EXTENDED_DICTIONARY } from "@/lib/matching/dictionaryData";
import {
  IconSparkle,
  IconWave,
  IconMic,
  IconDoc,
  IconSettings,
  IconArrowLeft,
  IconChevronRight,
  IconShield,
  IconHelp,
  IconPlay,
  IconRepeat,
  IconSkip,
  IconKeyboard,
  IconPause,
  IconSun,
  IconMoon,
  IconInfo,
  IconCheck,
  IconAlertCircle,
  IconX,
  IconSearch,
  IconMessageSquare
} from "@/components/icons";

export default function DesignSystemPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [activeTab, setActiveTab] = useState<"visuals" | "components" | "layout" | "dictionary">("visuals");
  const [micVolume, setMicVolume] = useState(0.4);
  const [isListening, setIsListening] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    if (typeof window !== "undefined") {
      document.documentElement.classList.add(next);
      document.documentElement.classList.remove(theme);
    }
  };

  const filteredDictionary = EXTENDED_DICTIONARY.filter(
    (item) =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.synonyms.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className={`min-h-screen w-full p-8 md:p-12 transition-colors duration-300 ${
      theme === "dark" ? "bg-zinc-950 text-zinc-50" : "bg-slate-50 text-slate-900"
    }`}>
      <div className="max-w-7xl mx-auto flex flex-col gap-8">
        
        {/* HEADER BAR */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-6">
          <div className="text-left">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#0f766e] text-white shadow-md">
                <IconSparkle className="h-5.5 w-5.5" />
              </span>
              <div>
                <h1 className="font-display text-3xl font-extrabold tracking-tight">Swaram Design Lab</h1>
                <p className="text-xs text-soft font-semibold mt-0.5">
                  Interactive workspace of revamped UI tokens, interactive components, and layouts.
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Link href="/" className="btn btn-secondary min-h-10 text-xs no-underline font-bold">
              <IconArrowLeft className="h-4 w-4" />
              Back to App
            </Link>
            
            <button
              onClick={toggleTheme}
              className="grid h-10 w-10 place-items-center rounded-2xl border border-line bg-raised shadow-sm hover:bg-surface text-ink transition-all"
              aria-label="Toggle theme"
            >
              {theme === "light" ? <IconMoon className="h-5 w-5" /> : <IconSun className="h-5 w-5" />}
            </button>
          </div>
        </header>

        {/* TABS CONTAINER */}
        <nav aria-label="Design System Navigation" className="flex border-b border-line gap-2 overflow-x-auto pb-px">
          {[
            { id: "visuals", label: "Visual Aesthetics & Orbs" },
            { id: "components", label: "Buttons & Input Fields" },
            { id: "layout", label: "Bento Grids & Layouts" },
            { id: "dictionary", label: "Fuzzy Synonym Dictionary" }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-5 py-3 border-b-2 font-bold text-sm whitespace-nowrap transition-all duration-200 ${
                activeTab === tab.id
                  ? "border-[#0d9488] text-[#0d9488] dark:border-[#2dd4bf] dark:text-[#2dd4bf]"
                  : "border-transparent text-soft hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* TAB CONTENT: VISUALS */}
        {activeTab === "visuals" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 page-transition">
            
            {/* LARGE ASSISTANT ORB PREVIEW */}
            <div className="card p-8 flex flex-col items-center justify-between text-center gap-6 relative overflow-hidden h-[420px]">
              <div className="absolute top-4 left-4">
                <span className="chip bg-accent-soft text-accent text-[10px] font-bold uppercase tracking-wider">
                  Interactive Assistant Orb
                </span>
              </div>

              <div className="flex-grow flex items-center justify-center relative w-full mt-4">
                {/* Simulated Concentric Waves */}
                <div className={`absolute rounded-full border border-teal-500/20 bg-teal-500/5 transition-all duration-300 ${
                  isListening ? "w-56 h-56 opacity-40 animate-ping" : "w-44 h-44 opacity-15"
                }`} />
                <div className={`absolute rounded-full border border-teal-500/30 bg-teal-500/10 transition-all duration-300 ${
                  isListening ? "w-48 h-48 opacity-50" : "w-36 h-36 opacity-25"
                }`} />

                {/* Morphing Outer Blob */}
                <div className={`absolute w-32 h-32 bg-[#f0fdfa] dark:bg-[#002e2c]/40 border border-[#ccfbf1] dark:border-[#115e59]/30 rounded-full shadow-inner ${
                  isListening ? "orb-animate-morph scale-110" : ""
                }`} />

                {/* Morphing Inner Blob */}
                <div className={`absolute w-24 h-24 bg-[#ccfbf1] dark:bg-[#004d47]/30 border border-[#99f6e4]/40 rounded-full ${
                  isListening ? "orb-animate-morph duration-10000" : ""
                }`} />

                {/* Core Microphone Button */}
                <button
                  onClick={() => setIsListening(!isListening)}
                  className={`relative grid h-16 w-16 place-items-center rounded-full text-white shadow-lg transition-all duration-300 active:scale-95 ${
                    isListening ? "bg-accent animate-pulse" : "bg-[#0d9488] hover:bg-[#0f766e]"
                  }`}
                >
                  <IconMic className="h-6 w-6" />
                </button>
              </div>

              <div className="flex flex-col gap-2 w-full max-w-sm">
                <h3 className="font-display text-lg font-bold text-ink">
                  {isListening ? "Listening to voice input…" : "Idle state"}
                </h3>
                <p className="text-xs text-soft font-semibold leading-relaxed">
                  The liquid animated orb morphs shape and expands concentric pulse ripples dynamically during active mic recording. Click it to simulate speech states.
                </p>
              </div>
            </div>

            {/* WAVEFORM REACTIVITY CONTROLLER */}
            <div className="card p-8 flex flex-col justify-between gap-6">
              <div className="text-left">
                <span className="chip bg-accent-soft text-accent text-[10px] font-bold uppercase tracking-wider">
                  Reactive Waveform Analyzer
                </span>
                <h3 className="font-display text-xl font-extrabold mt-2 text-ink">Waveform Dynamics</h3>
                <p className="text-xs text-soft font-semibold mt-1">
                  Control the volume slider below to observe how the horizontal wave bars expand, glow, and change colors reactive to decibel peaks.
                </p>
              </div>

              {/* Waveform Output */}
              <div className="p-6 rounded-2xl border border-line bg-surface flex items-center justify-center h-28">
                <div className="w-full max-w-[280px]">
                  <Waveform active={isListening} speaking={!isListening} volume={micVolume} />
                </div>
              </div>

              {/* Controls */}
              <div className="flex flex-col gap-4 border-t border-line/60 pt-4">
                <div className="flex flex-col gap-2 text-left">
                  <label htmlFor="volume-slider" className="flex justify-between text-xs font-bold text-soft">
                    <span>Simulated Mic Input Gain</span>
                    <span>{Math.round(micVolume * 100)}%</span>
                  </label>
                  <input
                    id="volume-slider"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={micVolume}
                    onChange={(e) => setMicVolume(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-line rounded-full appearance-none cursor-pointer accent-[#0d9488]"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setIsListening(true);
                      setMicVolume(0.85);
                    }}
                    className="btn btn-secondary flex-1 min-h-10 text-xs font-bold"
                  >
                    Simulate Loud Speech
                  </button>
                  <button
                    onClick={() => {
                      setIsListening(false);
                      setMicVolume(0);
                    }}
                    className="btn btn-secondary flex-1 min-h-10 text-xs font-bold"
                  >
                    Reset to Silence
                  </button>
                </div>
              </div>
            </div>

            {/* COLOR PALETTES SHOWCASE */}
            <div className="card p-8 flex flex-col gap-5">
              <h3 className="font-display text-lg font-bold text-ink border-b border-line pb-3 text-left">
                Design Color Palette
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { name: "Surface Background", val: "var(--surface)", desc: "Main layout backdrop" },
                  { name: "Raised Cards", val: "var(--raised)", desc: "Elevated panels & content elements" },
                  { name: "Accent Teal", val: "var(--accent)", desc: "Primary brand focus & visual elements" },
                  { name: "Success Emerald", val: "var(--ok)", desc: "Completed steps & correct audits" },
                  { name: "Warning Amber", val: "var(--warn)", desc: "OCR low-confidence warnings" },
                  { name: "Alert Red", val: "var(--bad)", desc: "Form errors or blocked keys" }
                ].map((color, idx) => (
                  <div key={idx} className="flex flex-col gap-2 text-left p-3 rounded-2xl border border-line bg-surface">
                    <div
                      className="h-12 w-full rounded-xl border border-line"
                      style={{ backgroundColor: color.val }}
                    />
                    <div>
                      <h4 className="font-extrabold text-xs text-ink">{color.name}</h4>
                      <p className="text-[10px] text-soft font-semibold leading-normal mt-0.5">{color.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* INTERACTIVE TEXT SPELLING ANIMATOR */}
            <div className="card p-8 flex flex-col justify-between gap-5">
              <h3 className="font-display text-lg font-bold text-ink border-b border-line pb-3 text-left">
                Dictation Spelling Board
              </h3>
              
              <p className="text-xs text-soft font-semibold text-left">
                When spelling out names or codes letter-by-letter, Swaram displays active spelling tokens to help blind and low-vision users follow along easily.
              </p>

              <div className="flex flex-wrap justify-center gap-1.5 p-6 rounded-2xl border border-line bg-surface font-mono text-sm font-bold min-h-[60px] items-center">
                {"SWARAM".split("").map((letter, idx) => (
                  <span
                    key={idx}
                    className="rounded-lg border border-line bg-raised px-3 py-1 text-ink shadow-sm animate-fade-in hover:border-accent transition-all cursor-default"
                  >
                    {letter}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface/50 p-3 text-[10px] font-semibold text-soft text-left">
                <IconInfo className="h-4.5 w-4.5 text-accent shrink-0" />
                <span>Dictionary mapping spells words to their letter strings for voice transcript normalization.</span>
              </div>
            </div>

          </div>
        )}

        {/* TAB CONTENT: COMPONENTS */}
        {activeTab === "components" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 page-transition">
            
            {/* BUTTONS CATALOG */}
            <div className="card p-8 flex flex-col gap-5 text-left">
              <h3 className="font-display text-lg font-bold text-ink border-b border-line pb-3">
                Buttons Catalog
              </h3>
              
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-faint uppercase">Primary CTA Action</span>
                  <button className="btn btn-primary self-start">
                    <IconSparkle className="h-4.5 w-4.5" />
                    <span>Primary Action Button</span>
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-faint uppercase">Secondary Outline Action</span>
                  <button className="btn btn-secondary self-start">
                    <IconSettings className="h-4.5 w-4.5" />
                    <span>Secondary Action Button</span>
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-faint uppercase">Danger Action</span>
                  <button className="btn btn-danger self-start">
                    <IconX className="h-4.5 w-4.5" />
                    <span>Delete Session</span>
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-faint uppercase">Ghost / Flat Action</span>
                  <button className="btn btn-ghost self-start">
                    <IconHelp className="h-4.5 w-4.5" />
                    <span>Read Help Instructions</span>
                  </button>
                </div>
              </div>
            </div>

            {/* INPUT CONTROLS & BANNERS */}
            <div className="card p-8 flex flex-col gap-6 text-left">
              <h3 className="font-display text-lg font-bold text-ink border-b border-line pb-3">
                Inputs &amp; Feedback States
              </h3>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="demo-input" className="text-xs font-bold text-soft">Interactive text input</label>
                  <input
                    id="demo-input"
                    type="text"
                    placeholder="Enter your name here…"
                    className="field-input shadow-sm"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="demo-select" className="text-xs font-bold text-soft">Interactive dropdown select</label>
                  <select id="demo-select" className="field-input shadow-sm">
                    <option>Option 1</option>
                    <option>Option 2</option>
                    <option>Option 3</option>
                  </select>
                </div>

                {/* Notifications & Banners */}
                <div className="flex flex-col gap-3.5 mt-2">
                  <div className="flex gap-3.5 rounded-2xl border border-ok/20 bg-ok-soft/30 p-4 text-xs font-semibold text-ink">
                    <IconCheck className="h-5 w-5 text-ok shrink-0" />
                    <div className="flex-1">
                      <h4 className="font-extrabold text-[12px] text-ink">Action Completed</h4>
                      <p className="text-[11px] text-soft mt-0.5 leading-relaxed">Form has been parsed and filled successfully.</p>
                    </div>
                  </div>

                  <div className="flex gap-3.5 rounded-2xl border border-warn/25 bg-warn-soft/20 p-4 text-xs font-semibold text-ink">
                    <IconAlertCircle className="h-5 w-5 text-warn shrink-0" />
                    <div className="flex-1">
                      <h4 className="font-extrabold text-[12px] text-ink">Low Confidence Alert</h4>
                      <p className="text-[11px] text-soft mt-0.5 leading-relaxed">OCR confidence in this field is under 60%. Voice verification recommended.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CHAT LOG TIMELINE SCREEN */}
            <div className="card p-8 flex flex-col gap-4 md:col-span-2">
              <h3 className="font-display text-lg font-bold text-ink border-b border-line pb-3 text-left">
                Conversational Log Bubbles
              </h3>
              
              <div className="flex flex-col gap-4 bg-surface p-6 rounded-[28px] border border-line">
                <div className="flex flex-col gap-1 max-w-[70%] self-start items-start">
                  <span className="text-[9px] font-bold text-faint uppercase tracking-wider px-1">Swaram Assistant</span>
                  <div className="bubble bubble-assistant text-left">
                    What is your date of birth? For example: 25 May 2002.
                  </div>
                </div>

                <div className="flex flex-col gap-1 max-w-[70%] self-end items-end">
                  <span className="text-[9px] font-bold text-faint uppercase tracking-wider px-1">You</span>
                  <div className="bubble bubble-user text-left">
                    25th of May 2002
                  </div>
                </div>

                <div className="flex flex-col gap-1 max-w-[70%] self-start items-start">
                  <span className="text-[9px] font-bold text-faint uppercase tracking-wider px-1">Swaram Assistant</span>
                  <div className="bubble bubble-assistant text-left">
                    I got: 25/05/2002. Correct?
                  </div>
                </div>

                <div className="flex flex-col gap-1 max-w-[70%] self-end items-end">
                  <span className="text-[9px] font-bold text-faint uppercase tracking-wider px-1">You</span>
                  <div className="bubble bubble-user text-left">
                    Yes, correct.
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB CONTENT: LAYOUT */}
        {activeTab === "layout" && (
          <div className="flex flex-col gap-8 page-transition text-left">
            <div className="card p-6">
              <h3 className="font-display text-lg font-bold text-ink border-b border-line pb-3">
                Responsive Bento Grid Showroom
              </h3>
              <p className="text-xs text-soft font-semibold mt-1">
                Awwwards-worthy layouts leverage variable-width columns to form cohesive visual groupings. 
                Swaram implements a responsive 12-column Grid Matrix that collapses elegantly on mobile viewports.
              </p>
            </div>

            <div className="bento-grid">
              
              {/* Bento Card 1: 4-cols */}
              <div className="bento-card-small card p-6 bg-raised flex flex-col justify-between min-h-[160px]">
                <span className="chip bg-accent-soft text-accent text-[9px] font-bold uppercase tracking-wider self-start">
                  Card Small (Col Span 4)
                </span>
                <div>
                  <h4 className="font-extrabold text-sm text-ink leading-tight">Compact Action Card</h4>
                  <p className="text-xs text-soft font-semibold mt-0.5">Quick triggers or single-metric indicators.</p>
                </div>
              </div>

              {/* Bento Card 2: 8-cols */}
              <div className="bento-card-large card p-6 bg-raised flex flex-col justify-between min-h-[160px]">
                <span className="chip bg-accent-soft text-accent text-[9px] font-bold uppercase tracking-wider self-start">
                  Card Large (Col Span 8)
                </span>
                <div>
                  <h4 className="font-extrabold text-sm text-ink leading-tight">Wide Display Card</h4>
                  <p className="text-xs text-soft font-semibold mt-0.5">Contains lists, tables, charts, or detailed transcript feeds.</p>
                </div>
              </div>

              {/* Bento Card 3: 6-cols */}
              <div className="bento-card-medium card p-6 bg-raised flex flex-col justify-between min-h-[160px]">
                <span className="chip bg-accent-soft text-accent text-[9px] font-bold uppercase tracking-wider self-start">
                  Card Medium (Col Span 6)
                </span>
                <div>
                  <h4 className="font-extrabold text-sm text-ink leading-tight">Balanced Medium Card</h4>
                  <p className="text-xs text-soft font-semibold mt-0.5">Perfect for side-by-side forms or settings.</p>
                </div>
              </div>

              {/* Bento Card 4: 6-cols */}
              <div className="bento-card-medium card p-6 bg-raised flex flex-col justify-between min-h-[160px]">
                <span className="chip bg-accent-soft text-accent text-[9px] font-bold uppercase tracking-wider self-start">
                  Card Medium (Col Span 6)
                </span>
                <div>
                  <h4 className="font-extrabold text-sm text-ink leading-tight">Balanced Medium Card</h4>
                  <p className="text-xs text-soft font-semibold mt-0.5">Identical width blocks for grid alignment.</p>
                </div>
              </div>

              {/* Bento Card 5: 12-cols */}
              <div className="bento-card-full card p-6 bg-raised flex flex-col justify-between min-h-[140px]">
                <span className="chip bg-accent-soft text-accent text-[9px] font-bold uppercase tracking-wider self-start">
                  Card Full (Col Span 12)
                </span>
                <div>
                  <h4 className="font-extrabold text-sm text-ink leading-tight">Full Width Panel</h4>
                  <p className="text-xs text-soft font-semibold mt-0.5">Acts as page hero headers or primary workspace panels.</p>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB CONTENT: DICTIONARY */}
        {activeTab === "dictionary" && (
          <div className="flex flex-col gap-6 page-transition text-left">
            <div className="card p-6 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-ink">
                    Fuzzy Synonym Dictionary Explorer
                  </h3>
                  <p className="text-xs text-soft font-semibold mt-0.5">
                    Search and explore Swaram&apos;s active Indian government forms synonym mapping index.
                  </p>
                </div>
                
                {/* Search Bar */}
                <div className="relative w-full md:w-80">
                  <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
                  <input
                    type="text"
                    placeholder="Search keywords or synonyms…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="field-input pl-9.5 pr-4 shadow-sm min-h-10 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Dictionary List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredDictionary.length === 0 ? (
                <div className="card md:col-span-2 text-center py-12 text-xs font-semibold text-faint">
                  No matching keywords found
                </div>
              ) : (
                filteredDictionary.map((item) => (
                  <div key={item.key} className="card p-5.5 flex flex-col gap-3.5 bg-raised hover:border-accent transition-all duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8.5 w-8.5 place-items-center rounded-xl bg-accent-soft text-accent">
                          <IconDoc className="h-4.5 w-4.5" />
                        </span>
                        <div>
                          <h4 className="font-extrabold text-[13px] text-ink leading-tight">{item.label}</h4>
                          <span className="text-[9.5px] text-faint font-bold uppercase tracking-wider block mt-0.5">
                            Key: {item.key} &middot; Type: {item.type}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        {item.sensitive && (
                          <span className="chip bg-bad-soft text-bad text-[8.5px] font-bold uppercase tracking-wider px-2 py-0.5">
                            Sensitive
                          </span>
                        )}
                        {item.profileKey && (
                          <span className="chip bg-ok-soft text-ok text-[8.5px] font-bold uppercase tracking-wider px-2 py-0.5">
                            Auto-Fill
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-line/50 pt-2.5 text-xs">
                      <div className="flex flex-col gap-1 text-left">
                        <span className="text-[10px] font-bold text-faint uppercase">Description</span>
                        <p className="text-xs text-soft font-semibold leading-relaxed">{item.description}</p>
                      </div>

                      <div className="flex flex-col gap-1 text-left mt-1.5">
                        <span className="text-[10px] font-bold text-faint uppercase">Spoken Prompt Question</span>
                        <p className="text-xs text-ink font-bold leading-relaxed">&ldquo;{item.spokenQuestion}&rdquo;</p>
                      </div>

                      <div className="flex flex-col gap-1 text-left mt-2">
                        <span className="text-[10px] font-bold text-faint uppercase">Synonym Matches</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.synonyms.map((syn) => (
                            <span
                              key={syn}
                              className="font-mono text-[9.5px] font-bold bg-surface border border-line px-1.5 py-0.5 rounded text-soft hover:text-ink cursor-default"
                            >
                              {syn}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
