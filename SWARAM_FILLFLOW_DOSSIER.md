# SWARAM — Eyes-Free Form-Filling Deep-Research Dossier
_Compiled 2026-07-22, ahead of the 2026-07-25 hackathon. Grounds the field-test
feedback ("kinda better, but…") in the current code + accessibility research, and
turns it into a prioritized plan. Companion to `SWARAM_VOICE_DOSSIER.txt` and
`SWARAM_SCAN_DOSSIER.txt`._

---

## 0. The one-line finding

The recent turn-taking change (auto-listen inside push-to-talk) helped the *feel*
but was **continuous listening bolted onto a mode whose UI still behaves like
manual push-to-talk** — that single mismatch causes the "can't tap anything"
regression, and it sits next to five real gaps (earcon quality, no haptics,
silent pages, choice homophones, and no consistent conversation-state model).
The fix is to make **one explicit conversational turn machine** the source of
truth, with redundant audio + haptic boundary cues, and to constrain recognition
on closed-vocabulary fields.

---

## 1. Current implementation (as of this commit)

**Fill loop** (`components/screens/useFillSession.ts`): phase machine
`loading | start | notice | asking | listening | confirming | typing | paused | done`.
One question at a time; confirmation with character-by-character spell-back for
names/emails/numbers; continuation endpointing; spell mode; surgical spoken
edits. This part is strong and matches best practice ("break tasks into small,
digestible chunks; no compound questions").

**Turn-taking (new, PTT mode):** a derived
`autoListen = micMode==="ptt" && phase==="listening" && !ttsActive && …` drives an
effect that calls `startContinuousListening()` / `stopContinuousListening()`.
Reuses the continuous VAD pipeline scoped to the listening window.

**Earcons** (`lib/voice/earcons.ts`): three sine chimes (start rising 440→660 Hz,
stop falling 520→330 Hz, recognized double-beep), gain 0.08. In the *native* STT
path they are gated `if(!isSafariOrIOS)`. The push-to-talk path now plays
start/stop on the capture edge (added this session, un-gated).

**Choice fields:** `matchOption()` does exact → substring → whitespace-squashed
exact matching only. **No STT hint is set for choice fields** (`setSttFieldHint`
is set for `name`/`spell` only), so the recognizer has no idea the answer is one
of {Male, Female, Other}.

**Per-page voice:** most screen hooks call `useVoicePage(...)`. The page
announcement fires only `if (config.title && …speechUnlocked())`.

---

## 2. Reported problems → root cause (code-grounded)

### P1 — "can't tap anything, doesn't register properly" (REGRESSION)
**Root cause:** `autoListen` runs the **continuous VAD mic** during the listening
phase, but `VoiceProvider` is still in `micMode==="ptt"` and keeps all its manual
push-to-talk gesture handlers live:
- The **tap-anywhere-to-talk** touch handler (`VoiceProvider.tsx` ~L830-866) turns
  any empty-space tap into `togglePtt()` → `beginPtt()`, which starts a **second**
  mic capture (MediaRecorder) on top of the running VAD and calls `cancelSpeech()`.
  Two capturers → duplicate/garbled transcripts, mis-timed cancels → "taps don't
  register."
- The **`[pttActive, micMode]` → setSttState** effect (~L725) fights the state that
  `startContinuousListening()` set via its callback, so the visible mic state
  flickers.
- Net: the UI thinks it's manual PTT; the engine is running hands-free. They
  collide on every tap.

**Direction:** make a conversational turn a **first-class state** that OWNS the
mic and the gesture handlers. While a turn is active: suppress tap-anywhere-PTT
(or repurpose a tap to "I'm done / repeat"), keep exactly one capture path, and
stop the pttActive→sttState effect from overriding. Manual hold = explicit
barge-in that cancels the auto-turn and takes the floor.

### P2 — "earcons aren't reactive enough"
**Root cause:** (a) gain 0.08 is quiet and easily masked in a real room; (b) only
three earcons, and start/stop are near-mirror sines — not *distinct* per state, so
the user can't tell "listening" from "stopped" from "error" from "success"; (c)
nothing signals **"I am still hearing you"** during the turn (no live/level-reactive
cue), which is likely what "not reactive" means; (d) the native path is still
silent on iOS.
**Best practice:** earcons must convey *distinct* states — awake/listening,
stopped, captured/thinking, success, error, mic-off — because blind users have no
ring-light/dots substitute (Perkins; TCS). A short **volume-reactive tick while
listening** (or an ambient bed coupled to `micVolume`, which the app already
computes) tells the user the mic is live and hearing them.

### P3 — "there is no haptics"
**Root cause:** confirmed — **zero `navigator.vibrate` in the codebase.**
**Best practice:** reinforce every state change with a short, consistent
vibration; multimodal (audio+haptic) feedback is becoming a baseline (EAA 2025,
WCAG direction) and is invaluable when audio is masked by TTS or room noise.
**iOS caveat (corrected):** iOS Safari never implemented the Web Vibration API,
BUT a `<input type="checkbox" switch>` fires the Taptic Engine when toggled (the
`ios-haptics` trick) — works iOS 17.4–26.4 (Apple patched programmatic firing in
26.5), only in a user-activation context, single tick. So iPhone gets best-effort
haptics; Android gets full patterns via navigator.vibrate. Audio stays the
guaranteed channel. Provide a user toggle (vibration must be adjustable/mutable).

### P4 — "some pages have no voice feedback, user gets confused"
**Root cause:** (a) the **home screen has no `useVoicePage`** (`useHomeData.ts`
never registers a title/description) → landing is silent; (b) the announcement is
gated on `speechUnlocked()`, so the *first* page after load says nothing until a
gesture unlocks audio; (c) pages that do register only speak `title + hint` once,
with no "what can I do here / what happens next" on demand.
**Best practice:** every screen should, eyes-free, announce **where you are, what
you can do, and what happens next**, and re-announce on request ("where am I").
Consistent, predictable structure across pages.

### P5 — "'male' registers as 'mail'" on choice fields
**Root cause:** the answer to a choice field is a **closed vocabulary**
{Male, Female, Other}, but recognition is run **unconstrained** (no hint), and
`matchOption()` has **no phonetic/fuzzy/homophone** handling — so "mail" never
maps to "Male" and the user is bounced into a retry loop.
**Best practice / research:** homophones are best resolved by **constraining or
biasing recognition to the known option set** (grammar / phrase list / server-side
match against options) plus **acoustic/fuzzy matching** and, when still
ambiguous, **disambiguation by enumeration** ("say 1 for Male, 2 for Female").
Acoustic homophone disambiguation reaches ~92% when context is known (Milvus;
ScienceDirect). The option list IS the context Swaram is currently throwing away.

### P6 — "if I close my eyes it's still confusing" (the meta-problem)
**Root cause (composite):** no single, predictable conversation-state model. The
user can't always tell whose turn it is, how far along they are (progress
`questionNumber` is computed but **never spoken**), or how to recover without
opening their eyes. Verbosity and speech rate aren't tunable. This is precisely
the gap the blind-VUI literature flags: conversational interfaces assume a
human-to-human model and under-serve **error recovery and orientation without
switching modalities** (Vtyurina & Fourney, "Blind Leading the Sighted"; Branham).

---

## 3. Research synthesis (what good looks like)

1. **Turn-taking must be explicit and audible.** Blind users can't see Alexa's
   ring or Siri's dot; earcons carry the entire "awake / listening / stopped /
   thinking" signal. Clear turn boundaries + silence detection are the core of a
   usable VUI. _(TCS; Perkins; multiple 2026 VUI guides.)_
2. **One thing at a time, concise, predictable.** Break tasks into small chunks,
   no compound questions, consistent structure — Swaram's per-field loop is right;
   the wrapper around it needs the same discipline. _(VUI design guides.)_
3. **Error recovery WITHOUT modality switching is the #1 blind-user need.** Design
   recovery (re-hear, spell, pick-from-list, edit-a-letter) so the user never has
   to fall back to a screen reader / keyboard. Swaram has good pieces (spell mode,
   spoken edits) — surface them proactively and consistently. _(Blind Leading the
   Sighted; accessibility.com.)_
4. **Give verbosity + speed control.** Blind users often process fast audio and
   resent verbose prompts; offer concise mode and adjustable TTS rate. _(Branham;
   VUI accessibility research.)_
5. **Constrain recognition on closed sets.** For choices/yes-no/known formats,
   bias or grammar-constrain the recognizer and match phonetically; enumerate to
   disambiguate. _(Homophone-handling literature; VUI confirmation/disambiguation
   patterns.)_
6. **Multimodal redundancy.** Pair audio cues with haptics (where supported) and
   visible state, so a masked or missed channel is backed up. Use vibration
   sparingly, consistently, and with a user control. _(Android haptics principles;
   mobile a11y guidance; EAA/WCAG direction.)_
7. **Orientation is a feature.** Always answer "where am I, how far along, what
   can I say" on demand and proactively at boundaries.

---

## 4. Recommendations, prioritized for Saturday

### CRITICAL (before demo)
- **C1 — Fix the tap regression by making the turn a first-class mode.** While an
  auto-listen turn is active: (a) suppress the tap-anywhere-PTT handler; (b)
  guarantee a single capture path (auto-VAD *or* manual hold, never both — manual
  hold cancels the auto-turn first); (c) stop the `[pttActive]` effect from
  overriding state during a turn. This directly removes the "can't tap" bug and is
  the backbone for everything below.
- **C2 — Constrain + fuzzy-match choice fields (male/mail).** Set an STT hint for
  choice fields carrying the options; add phonetic/fuzzy matching + a small
  homophone map to `matchOption()`; on 1 miss, **enumerate** ("say 1 for Male, 2
  for Female"). Highest annoyance-per-fix ratio.
- **C3 — Give every page a voice.** Add `useVoicePage` to home; ensure the first
  page announces once audio unlocks (or the "tap to begin" overlay speaks); make
  "where am I" re-read the page purpose everywhere.

### IMPORTANT
- **I1 — Redesign the earcon set:** distinct, slightly louder cues for
  listening-open / captured-thinking / success / error / mic-off, plus a
  **`micVolume`-reactive listening cue** so the user feels the mic is live. Un-gate
  iOS in the native path too.
- **I2 — Add haptics** (`navigator.vibrate`) mapped to the same five state
  changes, with a Profile toggle. Feature-detect (no-op on iOS Safari).
- **I3 — Speak progress/orientation:** "Question 4 of 12" before each question;
  "where am I" reports position + remaining.

### FUTURE
- **F1 — Verbosity + TTS-rate controls** (concise mode; faster speech for expert
  blind users).
- **F2 — Proactive recovery surfacing:** after a miss, always offer spell / pick
  / edit without the user knowing the magic words.
- **F3 — A single documented "conversation state" contract** shared across pages.

---

## 5. Open questions for further (Gemini) deep research
- Optimal earcon *timbre/length* set that stays distinguishable in noisy Indian
  household environments and over phone speakers (auditory icons vs abstract
  earcons; loudness vs annoyance).
- Whether to model the turn machine as half-duplex (mic hard-closed during TTS) or
  allow **barge-in** (mic open during TTS with echo cancellation) for expert
  users — and how to detect intentional barge-in vs echo on PWA mic stacks.
- Best on-device phonetic matcher for Indian-English option words (Metaphone vs
  Soundex vs a curated homophone map) given the constrained option vocabulary.
- Server-side constrained decoding: can the ensemble accept an explicit option
  list and return the best-matching option + confidence (like the name path uses
  known-names)?

---

## 6. Sources
- Perkins School for the Blind — iCons and Earcons: https://www.perkins.org/resource/icons-and-earcons-critical-often-overlooked-tech-skills/
- TCS — Voice accessibility for Voice User Interfaces: https://www.tcs.com/what-we-do/research/voice-accessibility-for-voice-user-interfaces
- Voice UI Design Guide 2026 (Fuselab): https://fuselabcreative.com/voice-user-interface-design-guide-2026/
- Some Considerations for Accessible Voice-User Interfaces: https://www.accessibility.com/blog/some-considerations-for-accessible-voice-user-interfaces
- Blind Leading the Sighted (ACM): https://dl.acm.org/doi/fullHtml/10.1145/3368426
- Exploring the use of speech input by blind people on mobile devices: https://www.researchgate.net/publication/262347939_Exploring_the_use_of_speech_input_by_blind_people_on_mobile_devices
- How does speech recognition handle homophones? (Milvus): https://milvus.io/ai-quick-reference/how-does-speech-recognition-handle-homophones
- Acoustic disambiguation of homophones (ScienceDirect): https://www.sciencedirect.com/science/article/abs/pii/S0885230817300232
- Android Developers — Haptics design principles: https://developer.android.com/develop/ui/views/haptics/haptics-principles
- Enhancing mobile accessibility with sound, vibration, haptics (LinkedIn): https://www.linkedin.com/advice/0/how-do-you-enhance-mobile-accessibility-sound-vibration
