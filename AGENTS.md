<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# SWARAM - Developer & Design Guidelines

This rulebook defines the core engineering principles, visual design patterns, and programming constraints for the SWARAM project. All code and interface layout changes must adhere strictly to these rules.

---

## 1. Core Visual Design Philosophy
* **Not a Dashboard**: SWARAM is a voice-first accessibility assistant. Do not use generic SaaS dashboard templates, plain card grids, or Notion-like interfaces.
* **Premium Design Language**: Draw inspiration from **Wispr Flow, Apple Intelligence, JARVIS, and Arc Browser**. Use glassmorphism, glowing concentric circles, blur filters, and dynamic layout transitions.
* **Visual States**: The UI must clearly convey the current assistant state:
  * **Idle**: Calm, glowing orb, slow breathing pulse animation.
  * **Listening**: Concentric ripple waves, reactive orb behavior.
  * **Speaking**: Ripple rings expanding, liquid wave animations.
  * **Processing**: Rotating gradients, shimmer animations.
* **Icons & Typography**: 
  * Use **premium SVG icons** only.
  * **No emojis** in primary action or layout states.
  * Use modern typography (e.g., *Outfit* or *Inter*).

---

## 2. Technical Stack Rules & Constraints
* **Framework**: Next.js (App Router) + React + TypeScript + Tailwind CSS.
* **On-Device & Offline-First**: All OCR, document ingestion, and shape/field clustering calculations must run locally in the client:
  * `pdf-lib`: Reading/writing form data at specific coordinates.
  * `pdf.js` (Mozilla): PDF image rendering and thumbnails.
  * `tesseract.js`: Client-side WASM OCR.
  * `opencv.js`: Classical client-side WASM shape/box detection.
  * `fuse.js`: Fuzzy matching engine for user profile auto-fill.
* **Web Speech API**: Use native browser `SpeechRecognition` / `webkitSpeechRecognition` (for Safari/iOS support) and `SpeechSynthesis`.
* **Database (Supabase)**: Only for optional backup/profiles after explicit user opt-in. Never upload government IDs (Aadhaar/PAN/etc.) to the database; keep them in the local PDF coordinate writer path.

---

## 3. UI Layout & Accessibility (WCAG 2.1 AA)
* **Desktop Layout**: Clean three-column conversational space:
  * **Left Column**: Live Voice Assistant Panel (glowing liquid orb, pulsing visualizer, try-saying prompt recommendations).
  * **Center Column**: Dynamic Workspace (Phase 1: File/Ingestion Dropzone. Phase 2: Conversational Chat log showing single assistant message $\rightarrow$ user response flow).
  * **Right Column**: Document preview displaying coordinates and progress markers.
* **Touch Targets**: Minimum **44px x 44px** targets for all button/interactive actions.
* **Keyboard Navigation**: Full focus outlines, visible focus states, and logical tab orders.
* **Color Contrast**: 4.5:1 minimum contrast ratio. Ensure text is readable against translucent background panels.

---

## 4. Coding & Implementation Workflow
* **Documentation**: Retain all existing code comments, docstrings, and framework notes unless specifically requested to clean them up.
* **Step-by-Step Priority**: Prioritize functional, working pipelines (e.g., AcroForm ingestion, tesseract.js pipeline, speech synthesis playback) before spending time on complex UI animations.
