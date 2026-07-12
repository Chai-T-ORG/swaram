# Swaram — UI Mockup Prompts (page by page)

Prompts for generating **high-fidelity** UI mockups of Swaram, a voice-first form-filling
assistant for blind and low-vision users in India. Desktop and mobile are separated below.

## How to use this file
1. Copy the **§0 Shared Design System** block once.
2. Paste it into ChatGPT, then paste **one page block** under it and generate.
3. Do them **one page at a time** (image models garble dense multi-screen sheets). Each page
   block is written to stand on its own once the shared system is above it.
4. If a screen has multiple **state variants**, generate them as a small row of frames for that
   one screen — don't mix different pages in a single image.
5. Keep the **voice orb identical** across every generation (it's the product's identity).

Every prompt assumes: **Figma-quality, photorealistic UI fidelity — not a wireframe, not sparse.**
Real content, real Indian sample data, proper icons, shadows, spacing, and states.

---

## §0 Shared Design System (paste ABOVE every page prompt)

```
SWARAM — SHARED DESIGN SYSTEM (context for every screen)

PRODUCT: Swaram is a voice-first assistant that fills out forms for blind and low-vision users
in India. The user uploads a PDF or photographs a paper form; Swaram detects every field, reads
each one aloud, asks one question at a time, listens to the spoken answer, confirms it, and writes
the answers back into the original form to produce a completed, ready-to-submit PDF. OCR and the
form image are processed privately on-device; speech recognition and a smart assistant use a fast
cloud AI. It works even when the person never looks at the screen.

WHO IT'S FOR: blind and low-vision users first (screen-reader users, and low-vision users who DO
look at the screen and need very large, very high-contrast visuals), plus sighted helpers. Rural
and urban India, mixed device quality, sometimes noisy/crowded environments.

DESIGN SOUL — this is a calm, trustworthy VOICE ASSISTANT, not a SaaS/admin dashboard. Reference
the emotional register of a phone-call screen, Siri, or a friendly kiosk — never Notion/Linear.
- One screen = one focus. The screen is a large, calm CAPTION of the current moment: what the
  assistant just said, and what it's waiting for. Audio is primary; visuals echo it.
- No persistent left-nav dashboard, no "Good evening, User" greeting bar, no marketing hero, no
  6-step wizard rail. Chrome is minimal; the app is fully operable by voice.
- Premium, warm, and confident — high craft, rich detail, real depth. NOT plain or empty; every
  screen should feel finished and considered, with meaningful secondary content where it helps.

THE VOICE ORB (the brand's anchor — identical on every screen, same place):
- A soft, dimensional sphere with concentric rings and a live audio-waveform core; gentle inner
  glow, subtle drop shadow, tactile depth (not a flat circle).
- Four states, always clearly distinguishable by SHAPE/MOTION (not color alone):
  • Idle — slow "breathing" scale, waveform flat/low. Label: "Ready".
  • Listening — outward pulse rings + tall reactive waveform bars. Label: "Listening…".
  • Thinking — soft rotating shimmer/arc, waveform dimmed. Label: "Thinking…".
  • Speaking — waveform driven by the assistant's voice, steady ring. Label: "Speaking".

INTERACTION MODEL — PUSH-TO-TALK first (reliable in noisy rooms): the user HOLDS the space bar or
HOLDS the orb to talk, and releases to send. A single tap toggles listening. Always show an
unmistakable "Hold to talk" affordance. (A hands-free/continuous mode exists as a setting.)

VISUAL SYSTEM (you may refine, but keep it premium and high-contrast; avoid neon-on-black glow):
- Light theme: warm off-white canvas (#FAF7F1 / #F3EFE7 layers), warm near-black ink (#1B1A17),
  soft elevated cards with gentle shadows.
- Dark theme: warm charcoal (#141311 / #1E1B18), warm off-white text (#F5F1EA).
- ONE confident accent used sparingly (orb + primary action). Pick ONE and keep it everywhere —
  recommended options: refined Teal #0F766E (current brand, toned down), deep Indigo #4F46E5, or
  warm Marigold #E8A317. Semantic: success = muted green #15803D, attention = amber #B45309,
  error = warm red #B91C1C. Each semantic state ALSO uses an icon + text, never color alone.
- Type: a warm humanist sans for UI (e.g., Inter/General Sans feel); a refined display serif or
  rounded display for the big assistant "current line". Base body 18px; the assistant's current
  utterance is huge (desktop 40–52px, mobile 30–40px).
- Rounded, friendly geometry (cards ~20–28px radius, pills for primary actions). Soft shadows,
  no heavy borders. Restrained motion; respect reduced-motion.

ACCESSIBILITY IS THE BRAND:
- WCAG AAA contrast; very large type; 56px+ touch targets; thick visible focus rings; captions of
  the live exchange; status conveyed by icon + label + color together; a "Read aloud" affordance
  wherever there's content; nothing critical hidden behind hover only.

PERSISTENT ELEMENTS:
- A single voice control in a fixed spot (desktop: bottom-center or a fixed left rail anchor;
  mobile: bottom-center, thumb-reachable) present on task screens, showing the orb's current state
  + a one-line status ("Hold to talk" / "Listening…" / "Thinking…").
- A tiny top bar: left = back/context, right = a small menu (Home, My Forms, Profile, Help) and a
  light/dark toggle. No greeting, no username banner.

OUTPUT: render high-fidelity, pixel-crisp frames with realistic content (use sample person
"Arjun Nair", DOB 25 May 2002, Kochi Kerala, mobile 98765 43210, arjun.nair@email.com). Desktop
frames 1440×900; mobile frames 402×874. Light theme unless the page says otherwise. Label each
frame. Treat this as a real product, not a concept sketch.
```

---
---

# DESKTOP

Desktop uses a centered, generous **stage** for the assistant, with a calm secondary column only
where it genuinely helps (e.g., the live conversation during fill, or the answers list in review).
Never a busy multi-panel dashboard. Frame size **1440×900**.

### D1 — First-run / Setup
```
Use the Swaram shared design system above. Render the DESKTOP First-Run / Setup screen (1440×900).

Purpose: the very first launch — greet the user, get microphone permission, and show the one-time
model setup, all in a calm, reassuring way.

Layout: a centered stage on the warm canvas. Top-left the SWARAM wordmark + "Your voice. Our ink."
Top-right a small light/dark toggle.

Center:
- The voice orb (idle → gently transitioning to "thinking" while models prepare).
- Large display line: "Hello, I'm Swaram."
- Subline (20px): "I'll read your form out loud and fill it in as you talk. Let's get set up — this
  happens once."
- A primary pill button: "Allow microphone & begin" with a small mic icon.
- Below it, a subtle one-time SETUP STATUS card showing two rows with small progress bars and ETA:
  • "Voice (AI speech)" — 100% Ready ✓
  • "Understanding (AI assistant)" — downloading 62% · ~20s left · 3.4 MB/s
  Include a tiny "Runs privately on your device / cloud AI for speech" note and a small "Retry" link
  affordance for a failed item.
- Footer line: "Private by design — your form never leaves your device unless you choose to back up."

Also render a compact SECOND state at bottom-right (a small inset frame): the "Ready" moment — orb
idle, big "All set. Hold the space bar, or tap the orb, then speak.", and the setup card replaced by
a green "Ready" check row.

Micro: warm, welcoming, generous whitespace; the orb is the hero. Accessibility: huge type,
AAA contrast, obvious focus ring on the primary button.
```

### D2 — Home / Idle Assistant
```
Use the Swaram shared design system above. Render the DESKTOP Home / Idle Assistant screen (1440×900).

Purpose: the resting state — Swaram is ready and waiting; the user starts a new form or resumes one.
NOT a dashboard, NO greeting banner, NO marketing hero.

Layout: centered stage.
Top bar: left = SWARAM wordmark; right = small menu (Home · My Forms · Profile · Help) + light/dark
toggle. Keep it tiny and quiet.

Center stage:
- The voice orb, idle/"Ready".
- Huge display line: "Ready — hold to talk."
- Subline: "Say 'upload a form' or 'scan a paper form' — or drop a PDF anywhere on this screen."
- Two large, equal primary choices as soft cards side by side:
  • "Upload a form" (document icon) — "PDF, JPG or PNG"
  • "Scan a paper form" (camera icon) — "Use your camera"
- A slim "Try saying" chip row: "upload my scholarship form" · "scan this" · "open my forms".

Below the stage, a calm RECENT FORMS strip (max 3) — each a small card with a PDF glyph, form name,
"Edited 2 days ago · 12 fields", and a status chip (e.g., "In review", "Complete ✓"). Include a
"See all" quiet link. If empty, show one warm line instead: "No forms yet — your first one is a
sentence away."

Persistent voice control: the orb doubles as the fixed control here; also show the "Hold Space to
talk" hint near it. Footer: "Private by design · Works offline for OCR · Cloud AI for speech."

Make it feel premium and finished, with real depth on cards — not empty.
```

### D3 — Import / Upload
```
Use the Swaram shared design system above. Render the DESKTOP Import screen (1440×900).

Purpose: bring a form in by file. Calm and centered.

Top bar: left = "← Back", center context "Add your form", right = menu.

Center:
- Small orb (idle) + a spoken caption line: "How would you like to add your form? You can drop a
  file, choose one, or scan a paper form."
- A large DRAG-AND-DROP zone (dashed, generous): document icon, "Drop your PDF here", "or", a
  "Choose a file" button. Note under it: "PDF, JPG or PNG · up to 50 MB". Include the accessibility
  affordance: "Prefer voice? Say 'choose file', then tap anywhere to open the picker."
- A divider "— or —", then a secondary wide button: "Scan a paper form" (camera icon).

Render TWO extra small state insets:
- Reading progress: the drop zone replaced by a filename row "Scholarship Form 2024.pdf" with a
  determinate progress bar at 78% and "Reading file…".
- Error state: warm red inline message with icon: "That file is larger than 50 MB. Please choose a
  smaller file." (color + icon + text).

Keep it spacious, premium, reassuring.
```

### D4 — Scan (camera + audio-guided framing)
```
Use the Swaram shared design system above. Render the DESKTOP Scan screen (1440×900).

Purpose: capture a paper form with the camera, with spoken framing guidance and auto-capture.

Layout: a large centered camera viewport (16:9) with rounded corners and bright corner framing
brackets; a real photo of a hand holding an A4 government/application form on a wooden desk inside it.

Overlays on the viewport:
- Top pill caption (this is the spoken guidance): "Move a little left — keep all four corners in
  the frame." Show it as a clear high-contrast pill.
- A large circular capture button centered at the bottom, plus a small "auto-capture on" indicator
  ("I'll capture it when it looks sharp").
- A subtle progress dot row.

Right/side rail (calm, not a dashboard): a small "Tips" card — "Avoid glare · Keep it flat · Fill
the frame · Good lighting" with tiny icons; and a "Can't scan? Upload a PDF instead" secondary link.

Render a strip of the guidance CAPTION variants as small chips so the guided-capture idea reads:
"Move left" · "Move right" · "Tilt up" · "Hold steady" · "Captured! Processing…" (last one with a
success check).

Include the fixed voice control. Premium, real camera imagery, high contrast captions.
```

### D5 — Analyzing / Processing
```
Use the Swaram shared design system above. Render the DESKTOP Analyzing screen (1440×900).

Purpose: show the form being understood (OCR + AI), then the ready summary. Reassuring, not techy.

Center stage:
- Orb in "Thinking" state.
- Large line that updates through stages; show this as a neat vertical checklist with the current
  step active and a subtle progress bar:
  ✓ Opening your form
  ✓ Reading the text
  ✓ Detecting the layout
  ● Understanding the form with AI   ← active, spinner
  ○ Preparing your questions
  With a caption under it: "This usually takes 20–40 seconds."

Render a SECOND frame (side by side or below) = the READY summary state:
- Orb idle, big success-tinted line: "Your form is ready."
- Rich summary card: "It's a scanned form with 12 fields, including Full Name, Date of Birth,
  Father's Name, and more. I can auto-fill 5 from your saved profile. 2 fields were unclear — I'll
  spell them out and ask you." Use small labeled stat chips: "12 fields · 5 auto-fill · 2 unclear".
- Primary pill: "Start filling" (play icon). Secondary: "Preview all fields first".
- Quiet note: "Say 'start' to begin."

Premium, calm, informative — the summary must feel substantial.
```

### D6 — Fill (THE hero screen) — state variants
```
Use the Swaram shared design system above. Render the DESKTOP Fill screen (1440×900). This is the
core screen — make it the most polished. Render it as a set of STATE VARIANTS (one per frame, same
layout), because this single screen has many states.

SHARED FILL LAYOUT (every variant):
- Thin top row: "← Back", a slim progress bar with "Question 3 of 12", a field-type chip (e.g.,
  "Date" / "Text" / "Single choice" / "Yes / No"), and small status chips when relevant
  ("Auto-filled" / "Unclear label").
- LEFT/CENTER main stage: the assistant's current line, huge and legible.
- RIGHT calm CONVERSATION column: a running transcript of the exchange (assistant lines + user
  lines as chat bubbles, most recent at bottom), quiet and secondary — this uses the desktop width
  without becoming a busy panel.
- Fixed voice control near bottom-center: orb + state + "Hold Space to talk", plus a compact
  command hint bar: "repeat · skip · go back · spell it · type instead · pause · help".

VARIANTS to render:
a) ASKING: big question "What is your date of birth?" + small hint under it "Say it like 25 May
   2002." Orb = Speaking. Conversation shows prior Q&A.
b) LISTENING: "Listening…" with the orb pulsing + tall live waveform; the recognized words forming
   as a large caption: "25 May 2002". Footer: "Release space or the orb to send."
c) CONFIRMING: "I heard: 25 May 2002" shown very large, plus the spelled-out readback "two five,
   slash, zero five, slash, two thousand two" and "Is that correct?" with clear Yes / No buttons
   (check + x icons). Orb = Speaking.
d) SPELL MODE: line "Spell it letter by letter — say 'space' between words." Show the assembled
   value building up as boxed characters: T W I N S H A · T. Orb = Listening.
e) SINGLE-CHOICE field: "What is your category?" with the options listed as a clean selectable
   list (General, OBC, SC, ST, EWS) and "Say one of these." Orb = Listening.
f) UNCLEAR FIELD: warm attention chip; "I'm not sure about this field — the label looks like
   P-A-R-I-S-H. Tell me what to write, or say skip." (icon + text).
g) TYPING FALLBACK: a large text input with a real on-screen keyboard affordance / focus, "Type
   your answer for: Full Name", "Save answer" + "Use voice instead". Orb dimmed.
h) PAUSED: calm "Paused. Hold space and say 'resume', or press the button." with a big Resume pill.

Also render ONE DARK-THEME version of the ASKING variant so theming reads.
Make the typography and orb feel premium; the conversation column should feel alive but calm.
```

### D7 — Review
```
Use the Swaram shared design system above. Render the DESKTOP Review screen (1440×900).

Purpose: review and edit every answer before exporting. Rich, scannable, large-type.

Top bar: "← Back", context "Review your answers", right menu.

Header row: a short line "Here's everything — check it over, then finish." + a prominent
"🔊 Read all answers aloud" control. A row of summary stat tiles: Answered 10 · Auto-filled 3 ·
Skipped 1 · Needs attention 1 (each tile with icon + number + label; distinct but not color-only).

Main: a clean, large-type LIST of all fields, each row:
  index + field label (small caps) · the answer in large text · a status chip with icon
  (Answered ✓ / Auto-filled ↺ / Skipped ⤼ / Needs attention ⚠) · an "Edit" affordance.
Show ~9 realistic rows: Full Name = Arjun Nair (Answered), Date of Birth = 25 May 2002 (Answered),
Address = Kochi, Kerala (Answered), Mobile Number = 98765 43210 (Auto-filled), Email =
arjun.nair@email.com (Auto-filled), Gender = Male (Answered), Course = B.Tech Computer Science
(Answered), Qualification = Higher Secondary (Needs attention), Category = — (Skipped).
Include ONE row in inline-edit state (a focused text field + Save/Cancel).

If any skipped/unclear remain, show a "Answer skipped fields (2)" primary near the top.

Sticky bottom bar: primary "Looks good — finish →" + secondary "Keep editing by voice". Fixed voice
control present. Premium list styling, generous spacing, unmistakable status icons.
```

### D8 — Complete / Export
```
Use the Swaram shared design system above. Render the DESKTOP Complete screen (1440×900).

Purpose: the filled PDF is ready — celebrate calmly and offer export + save-to-profile.

Center:
- A large success check (muted green) + orb idle.
- Big line: "All done! Your form is filled."
- A preview card of the result: a PDF thumbnail of the completed application form (with visible
  filled answers on the ruled lines), filename "Scholarship Application (Filled).pdf", "1.2 MB ·
  saved to your device".
- Export actions as large equal buttons: "Download" (down icon), "Share" (share icon), "Print"
  (printer icon), and "🔊 Read the whole form back to me".

Below, a SAVE-TO-PROFILE offer card: "Save these details for next time? I'll auto-fill matching
fields on future forms. Aadhaar and other ID numbers are never saved." with a compact list of what
would be saved (Full Name, Date of Birth, Mobile, Email, Address, Father's Name) and "Yes, save" /
"No, thanks". 

Footer actions: "Go home" · "My forms". Warm, satisfying, premium — the PDF preview should look real.
```

### D9 — Profile & Settings
```
Use the Swaram shared design system above. Render the DESKTOP Profile & Settings screen (1440×900).

Purpose: saved auto-fill details + all voice/speech settings + privacy/cloud. Calm and spacious —
a settings page, but not a dense enterprise one. Use a simple two-column content area (a slim
section list on the left INSIDE the page content — NOT a global sidebar — and the panel on the right).

Section list (in-page): Profile · Voice & Speech · Privacy & Backup · About.

Show the VOICE & SPEECH panel as the main content (most important):
- "Speaking voice" — a dropdown (e.g., "Swaram — Warm (AI)") + a "▶ Preview voice" button.
- "Speaking speed" — a slider (Slow —●— Fast) showing "Normal (1.1×)".
- "Listening mode" — a segmented control: "Push-to-talk (best in noise)" vs "Hands-free".
- "Recognition engine" — dropdown: "Cloud AI — most accurate (recommended)", with alternatives
  "Automatic", "On-device (private, offline)", "Browser built-in (instant)".
- "AI voice download" — a small status row (Ready ✓ or a progress bar) with the note that setup is
  one-time and works meanwhile with the system voice.

Also depict the PROFILE panel content in a secondary position: a grid of saved details (Full Name,
Date of Birth, Gender, Father's Name, Address, City, State, PIN, Email, Mobile) each with an "Edit"
affordance and a "Save profile" button; and a strong privacy callout card: "🔒 What's never saved —
Aadhaar, PAN, passport, voter ID and other government IDs are never stored, on this device or the
cloud." And a Cloud Backup card: consent checkbox + "Back up now / Restore / Delete backup".

Premium, high-contrast, roomy. Nothing cramped.
```

### D10 — My Forms / History
```
Use the Swaram shared design system above. Render the DESKTOP My Forms screen (1440×900).

Purpose: all past forms, stored on-device. Calm list, not a data table.

Top bar: "← Back", context "My forms", menu.
Intro line: "Your forms are stored only on this device." + orb small/idle.

A list of form cards (5–6), each with: PDF glyph, form name, "12 May 2025 · 12 fields", a status
badge with icon (Ready to fill · In progress · In review · Complete ✓ · Processing), and actions:
"Open / Continue", "Download filled PDF" (only for complete), "Delete" (warm red, icon+text).
Show a realistic mix of statuses.

Also render an EMPTY-STATE variant (small inset): a friendly document icon, "No forms yet.", and
"Upload a PDF" / "Scan a paper form" buttons.

Premium cards, generous spacing, obvious status.
```

### D11 — Overlays, states & components (Desktop)
```
Use the Swaram shared design system above. Render a DESKTOP sheet of the shared OVERLAYS, STATES and
COMPONENTS (1440×900), as a tidy labeled grid:

1) Voice command HELP overlay: a centered modal "You can say…" listing grouped commands with icons:
   Navigation (home, upload, scan, my forms, profile), In a form (repeat, skip, go back, spell it,
   type instead, pause), Anytime (stop, help). Warm, readable, dismiss affordance.
2) Cloud-speech CONSENT dialog: "Before we use your voice — your speech is sent to a fast, private
   cloud AI to turn it into text; nothing else about your form leaves your device." with "Continue"
   / "Use on-device instead".
3) Microphone-permission DENIED state: clear icon + "Microphone is blocked. Here's how to allow it,
   or type your answers instead." with steps.
4) No-fields-found state: "I couldn't find any fillable fields. Try scanning again with better
   lighting, or upload a clearer copy." + Upload / Scan buttons.
5) Offline / cloud-unavailable banner: "You're offline — I'll use the on-device voice. Cloud
   features will return when you reconnect."
6) The persistent VOICE CONTROL component in all 4 orb states (Idle/Listening/Thinking/Speaking)
   with its one-line status and "Hold Space" hint.
7) A TOAST/announcement component ("Saved ✓", "Didn't catch that — hold and speak clearly").
8) Status CHIP set: Answered, Auto-filled, Skipped, Needs attention, Unclear, Ready, Complete —
   each icon + label, in light and dark.

Consistent, premium, production-ready component styling.
```

---
---

# MOBILE

Mobile is a vertical, thumb-first flow. **One thing per screen.** The voice orb + "Hold to talk"
live at the **bottom center**, always the same. Frame size **402×874**. Render pages as connected
phone frames (with arrows between related states) or one at a time.

### M1 — First-run / Setup
```
Use the Swaram shared design system above. Render the MOBILE First-Run / Setup screen (402×874).

Full-screen warm canvas. Centered:
- Voice orb (idle → thinking).
- "Hello, I'm Swaram." (large display).
- "I'll read your form out loud and fill it in as you talk. Let's set up — this happens once."
- One-time SETUP card: two rows with mini progress bars + ETA:
  "Voice (AI speech) — Ready ✓" and "Understanding (AI) — 62% · ~20s left". Small "Retry" link.
- Primary full-width pill at the bottom: "Allow microphone & begin" (mic icon).
- Tiny footer: "Private by design."

Second frame (arrow →): READY state — orb idle, big "All set. Hold the button, then speak.",
green Ready check, and the bottom "Hold to talk" control appearing. Big type, AAA contrast.
```

### M2 — Home / Idle Assistant
```
Use the Swaram shared design system above. Render the MOBILE Home screen (402×874).

Top: tiny bar — SWARAM mark (left), menu + light/dark (right). NO greeting banner.

Center (vertical):
- Voice orb (idle/"Ready").
- "Ready — hold to talk." (large).
- "Say 'upload' or 'scan', or add a form below."
- Two big stacked action cards: "Upload a form" (PDF/JPG/PNG) and "Scan a paper form" (camera).
- A "Try saying" chip: "upload my scholarship form".

Below (scroll): RECENT FORMS — up to 3 compact cards (PDF glyph, name, "Edited 2 days ago · 12
fields", status chip) + "See all". Empty variant: "No forms yet — your first one is a sentence away."

Bottom, fixed: the voice control (orb + "Hold to talk"). Premium, finished, not empty.
```

### M3 — Import / Upload
```
Use the Swaram shared design system above. Render the MOBILE Import screen (402×874).

Top: "← Back", "Add your form".
- Small orb + caption "How would you like to add your form?"
- Large drop/choose zone: document icon, "Choose a file", note "PDF, JPG or PNG · up to 50 MB".
  Accessibility line: "Say 'choose file', then tap anywhere to open the picker."
- "— or —", then a big "Scan a paper form" button (camera).

Extra frames (arrows):
- Reading progress: filename "Scholarship Form 2024.pdf" + progress bar 78% + "Reading file…".
- Error: warm red icon+text "That file is larger than 50 MB."

Bottom voice control. Spacious, calm.
```

### M4 — Scan (camera + guidance)
```
Use the Swaram shared design system above. Render the MOBILE Scan screen (402×874).

Full-bleed camera viewport with corner framing brackets over a real photo of a hand holding an A4
application form. Overlays:
- Top high-contrast pill caption (spoken guidance): "Move a little left — keep all corners in view."
- Bottom: a big circular capture button, an "auto-capture on" chip, and small "Upload instead" /
  flash toggle icons.
Render the guidance CAPTION variants as a small strip: "Move left" · "Move right" · "Tilt up" ·
"Hold steady" · "Captured! Processing…" (with check).

High-contrast captions, real camera imagery, thumb-reachable capture button.
```

### M5 — Analyzing / Processing
```
Use the Swaram shared design system above. Render the MOBILE Analyzing screen (402×874).

Center:
- Orb "Thinking".
- Vertical checklist with current step active + slim progress bar:
  ✓ Opening your form / ✓ Reading the text / ✓ Detecting layout / ● Understanding with AI /
  ○ Preparing questions. Caption: "This usually takes 20–40 seconds."

Second frame (→): READY summary — orb idle, "Your form is ready.", a rich card: "12 fields,
including Full Name, Date of Birth and more. I can auto-fill 5 from your profile. 2 were unclear —
I'll ask you." stat chips "12 · 5 auto-fill · 2 unclear", primary "Start filling", secondary
"Preview fields". Calm and substantial.
```

### M6 — Fill (THE hero screen) — state variants
```
Use the Swaram shared design system above. Render the MOBILE Fill screen (402×874) as a set of
STATE VARIANT frames (one per phone), same layout. This is the core screen — most polished.

SHARED MOBILE FILL LAYOUT:
- Top: "← Back", a thin progress bar "Question 3 of 12", and a field-type chip
  (Date / Text / Single choice / Yes-No). Status chips when relevant (Auto-filled / Unclear).
- Middle: the assistant's current line, very large (30–40px), centered. Below it a short hint.
- The recognized/echoed answer appears as a big caption when relevant.
- Bottom, fixed: the orb + state label + "Hold to talk" + a compact command hint row
  ("repeat · skip · spell it · type · pause").

VARIANTS:
a) ASKING: "What is your date of birth?" + hint "Say it like 25 May 2002." Orb Speaking.
b) LISTENING: "Listening…" orb pulsing + waveform, live words "25 May 2002", "Release to send".
c) CONFIRMING: "I heard: 25 May 2002" large + spelled readback + "Correct?" with Yes / No.
d) SPELL MODE: "Spell it — say 'space' between words." assembled boxed chars T W I N S H A · T.
e) SINGLE-CHOICE: "What is your category?" options list (General/OBC/SC/ST/EWS) "Say one."
f) UNCLEAR FIELD: attention chip + "The label looks like P-A-R-I-S-H. Tell me what to write, or
   say skip."
g) TYPING FALLBACK: focused text input + mobile keyboard, "Save answer" / "Use voice instead".
h) PAUSED: "Paused. Hold and say 'resume'." + big Resume button.
Also render ONE DARK-THEME ASKING frame.

Include a small collapsible "Conversation" affordance (mobile has no room for a side column) — show
one frame with the transcript expanded as chat bubbles. Premium, big, calm.
```

### M7 — Review
```
Use the Swaram shared design system above. Render the MOBILE Review screen (402×874).

Top: "← Back", "Review your answers".
- Line "Check it over, then finish." + a prominent "🔊 Read all aloud" button.
- Horizontal-scroll or 2×2 summary stat tiles: Answered 10 · Auto-filled 3 · Skipped 1 · Needs
  attention 1 (icon + number + label).
- Scrollable list of field rows: label (small caps) + large answer + status chip (icon) + Edit.
  Show 6+ realistic rows incl. one "Needs attention" and one "Skipped (—)". Include one row in
  inline-edit state.
- If skipped remain: "Answer skipped fields (2)" near top.
Sticky bottom: "Looks good — finish →" + "Edit by voice", above the fixed voice control.
Large type, unmistakable status icons.
```

### M8 — Complete / Export
```
Use the Swaram shared design system above. Render the MOBILE Complete screen (402×874).

Center:
- Big success check + orb idle.
- "All done! Your form is filled."
- Result card: completed-PDF thumbnail (filled answers visible), "Scholarship Application
  (Filled).pdf · 1.2 MB · saved to device".
- Big stacked buttons: "Download", "Share", "Print", "🔊 Read the form back to me".

Second frame (→): SAVE-TO-PROFILE offer — "Save these details for next time? Aadhaar and IDs are
never saved." with the list (Full Name, DOB, Mobile, Email, Address, Father's Name) + "Yes, save" /
"No, thanks". Bottom links: "Go home" · "My forms". Warm, real PDF preview.
```

### M9 — Profile & Settings
```
Use the Swaram shared design system above. Render the MOBILE Profile & Settings screen (402×874).

A vertical, spacious settings list (NOT dense). Top "← Back" + "Profile & settings". Sections as
grouped cards:

VOICE & SPEECH (show first / most detailed):
- "Speaking voice" row → "Swaram — Warm (AI)" + "▶ Preview".
- "Speaking speed" slider → "Normal (1.1×)".
- "Listening mode" segmented → "Push-to-talk" | "Hands-free".
- "Recognition engine" → "Cloud AI (recommended)".
- "AI voice" status → "Ready ✓" (or a mini progress bar).

PROFILE (second frame or scroll): saved details list (Full Name, Date of Birth, Gender, Father's
Name, Address, City, State, PIN, Email, Mobile) each with Edit; "Save profile" button.

PRIVACY & BACKUP: a strong "🔒 What's never saved — Aadhaar, PAN, passport, voter ID." callout;
cloud backup consent toggle + "Back up now / Restore / Delete".

Big touch targets, roomy rows, high contrast.
```

### M10 — My Forms / History
```
Use the Swaram shared design system above. Render the MOBILE My Forms screen (402×874).

Top "← Back" + "My forms" + line "Stored only on this device."
Vertical list of form cards: PDF glyph, name, "12 May 2025 · 12 fields", status badge (icon), and
actions (Open/Continue, Download filled, Delete). Realistic mix of statuses.
Empty variant (second frame): friendly icon, "No forms yet.", "Upload" / "Scan" buttons.
Bottom voice control. Premium cards.
```

### M11 — Overlays, states & components (Mobile)
```
Use the Swaram shared design system above. Render a MOBILE set (each 402×874 or as small stacked
frames) of shared OVERLAYS, STATES and COMPONENTS:

1) Voice command HELP sheet (bottom sheet): "You can say…" grouped commands with icons.
2) Cloud-speech CONSENT sheet: the privacy explanation + "Continue" / "Use on-device".
3) Microphone-permission DENIED: icon + how-to-allow steps + "type instead".
4) No-fields-found: "I couldn't find any fields — scan again in better light or upload a clearer
   copy." + Upload / Scan.
5) Offline banner: "You're offline — using the on-device voice."
6) The fixed bottom VOICE CONTROL in all 4 orb states (Idle/Listening/Thinking/Speaking) + status.
7) TOAST component ("Saved ✓", "Didn't catch that — hold and speak clearly").
8) Status CHIP set (Answered/Auto-filled/Skipped/Needs attention/Unclear/Ready/Complete), light+dark.

Consistent, premium, production-ready.
```

---

## Coverage checklist (so nothing's missed)
First-run/setup · Home/idle · Import/upload (+progress, +error) · Scan (+all guidance captions) ·
Analyzing (+ready summary) · Fill (asking, listening, confirming, spell mode, single-choice,
unclear, typing, paused, dark theme, conversation) · Review (+inline edit, +skipped) · Complete
(+save-to-profile) · Profile & Settings (voice, profile, privacy/backup) · My Forms (+empty) ·
Overlays (help, consent, mic-denied, no-fields, offline) · Components (voice control 4 states,
toasts, status chips) — for BOTH desktop and mobile.
