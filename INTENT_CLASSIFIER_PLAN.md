# Intent Classification Layer — Implementation Plan

## Goal
Add a local-first intent classifier + noise filter + off-topic detector to the Swaram voice pipeline so that:
1. STT hallucinations ("Thank you", "you", "Thank you for watching") are silently dropped
2. Off-topic user speech ("What's the weather?", "Tell me a joke") gets a polite redirect
3. Form commands and answers continue to work as before
4. LLM calls are only made when the local classifier can't decide

---

## Architecture Overview

```
Raw STT transcript
    │
    ▼
┌─────────────────────┐
│   Noise Filter      │  ← LAYER 1: Drop hallucinations/silence
│  (speechToText.ts)  │     Pure regex, no LLM, runs on EVERY transcript
└─────────┬───────────┘
          │ (clean transcript only)
          ▼
┌─────────────────────┐
│   Intent Classifier │  ← LAYER 2: Classify what the user meant
│ (intentClassifier.ts)│     Local regex → context check → LLM fallback
└─────────┬───────────┘
          │
          ├── command → fill page / global handler
          ├── answer  → fill page answer handler
          ├── off_topic → polite redirect
          ├── noise   → silently drop (shouldn't reach here, but defensive)
          └── unknown → LLM fallback (existing path)
```

---

## Step 1: Noise Filter — `lib/voice/noiseFilter.ts` (NEW)

**Purpose**: Detect and drop STT hallucinations, silence artifacts, and garbage before any listener sees them.

### Detection Patterns

| Pattern | Example | Action |
|---------|---------|--------|
| Silence markers | `[silence]`, `[noise]`, `(silence)`, `<silence>` | Drop |
| Known Whisper hallucinations | "Thank you", "Thank you for watching", "you", "Thank you", "Subtitles by...", "Thanks for watching" | Drop |
| Single word, 1-2 chars | "a", "I", "o", "um" | Drop |
| Repeated single word | "hello hello hello", "the the" | Drop |
| All punctuation/symbols | "...", "???", "---" | Drop |
| Excessive repetition (3+ same word) | "the the the the" | Drop |
| Single repeated character | "aaaa", "mmmm" | Drop |
| Common audio artifacts | "uh", "um", "hmm", "ah" (alone) | Drop |

### API

```typescript
export interface NoiseCheckResult {
  isNoise: boolean;
  reason?: string;  // e.g., "hallucination", "silence", "garbage"
}

/** Check if a raw transcript is noise/hallucination. Runs BEFORE normalization. */
export function detectNoise(raw: string): NoiseCheckResult;
```

### Files to modify
- **`lib/voice/speechToText.ts`** — In `emitTranscript()` (line ~68), call `detectNoise()` BEFORE `normalizeTranscript()` and `listeners.forEach()`. If noise, skip emitting entirely.

---

## Step 2: Intent Classifier — `lib/voice/intentClassifier.ts` (NEW)

**Purpose**: Classify what the user meant with a clean, local-first approach. Falls back to LLM only when needed.

### Intent Types

```typescript
export type IntentType =
  | "command"      // Fill loop command (skip, back, repeat, help, spell, pause)
  | "answer"       // Answer to current form question
  | "off_topic"    // User said something unrelated to the form
  | "noise"        // Shouldn't reach here (defensive)
  | "unknown";     // Couldn't classify locally, needs LLM

export interface ClassifiedIntent {
  type: IntentType;
  /** If type === "command", the parsed command. */
  command?: FillCommand;
  /** If type === "answer", the cleaned value. */
  value?: string;
  /** If type === "off_topic", a brief label for what they said. */
  topic?: string;
  /** Confidence score 0-1 for local classification. */
  confidence: number;
  /** Whether this was resolved locally (no LLM call). */
  local: boolean;
}
```

### Classification Logic

```
1. Check noise (shouldn't reach here, but defensive) → "noise"
2. Try parseFillCommand() → if match, return { type: "command", command, confidence: 1.0, local: true }
3. Try intlKeywords check (containsKeyword) → if match, return { type: "command", command, confidence: 0.95, local: true }
4. Check if in ANSWER phase and transcript looks like a plausible answer → { type: "answer", confidence: 0.8, local: true }
5. Check off-topic heuristic → { type: "off_topic", confidence: 0.7, local: true }
6. Otherwise → { type: "unknown", confidence: 0, local: false } (caller routes to LLM)
```

### Off-Topic Heuristic (Local)

A transcript is **off-topic** if ALL of these are true:
- It's NOT a command (step 2-3 above)
- It's NOT a plausible answer to the current question (step 4)
- It's longer than 3 characters
- It contains at least one form-related keyword OR is clearly conversational

**Form-related keywords** (local check):
- Form terms: form, name, address, phone, email, date, number, submit, fill, field
- Indian context: aadhaar, pan, pincode, ifsc, bank
- Negations/confirmations (context-dependent): yes, no, haan, nahi, theek hai
- Current question context: match against current field label/type

**Conversational patterns** (local check):
- Greetings: hello, hi, hey, good morning, namaste
- Questions: what, how, why, when, where, who
- Random topics: weather, joke, music, song, movie

### API

```typescript
export interface ClassifyContext {
  /** Current fill page phase. If undefined, not in fill mode. */
  phase?: "start" | "listening" | "confirming" | "paused" | "typing" | "done";
  /** Current field label (for context matching). */
  currentFieldLabel?: string;
  /** Current field type. */
  currentFieldType?: string;
  /** Current form name. */
  formName?: string;
  /** User's language. */
  lang?: string;
}

/** Classify a transcript into an intent. Local-first, no LLM. */
export function classifyIntent(
  transcript: string,
  context?: ClassifyContext,
): ClassifiedIntent;
```

### Files to modify
- **`components/GlobalVoice.tsx`** — Use `classifyIntent()` in `handleTranscript()` (line ~521)
- **`app/fill/[formId]/page.tsx`** — Use `classifyIntent()` in `onTranscript()` (line ~105) and `handleSpeechInput()` (line ~285)

---

## Step 3: Off-Topic Redirect — `lib/voice/offTopicRedirect.ts` (NEW)

**Purpose**: Generate polite, context-aware redirect messages when the user goes off-topic.

### API

```typescript
export interface RedirectOptions {
  /** What the user said (for personalized response). */
  transcript: string;
  /** Brief topic label from classifier. */
  topic?: string;
  /** Whether we're in fill mode. */
  inFillMode: boolean;
  /** Current form name. */
  formName?: string;
  /** Current field label. */
  currentFieldLabel?: string;
  /** User's language. */
  lang?: string;
}

/** Generate a polite redirect response. Returns the spoken text. */
export function offTopicRedirect(options: RedirectOptions): string;
```

### Redirect Templates

**In fill mode:**
- "I heard you say [topic], but let's focus on filling [formName]. [currentQuestion reminder]. Say help if you need options."
- "That's interesting, but right now let's work on your [fieldName]. You can say skip if you'd like to move on."
- "I didn't catch a link to this form. Let's get back to [fieldName]. What would you like to fill here?"

**Not in fill mode:**
- "I'm Swaram, your form-filling assistant. I can help you fill forms by voice. Say upload to start, or scan a paper form."
- "I'm here to help with forms. Say help to see what you can do."

### Files to modify
- **`components/GlobalVoice.tsx`** — Call `offTopicRedirect()` when intent.type === "off_topic" in `handleTranscript()`
- **`app/fill/[formId]/page.tsx`** — Call `offTopicRedirect()` when intent.type === "off_topic" in `handleSpeechInput()`

---

## Step 4: Context Provider Extension — `components/GlobalVoice.tsx`

**Purpose**: Expose fill page context to the intent classifier.

### Changes to `VoiceContextValue`

```typescript
interface VoiceContextValue {
  // ... existing fields ...
  /** Current fill page context for intent classification. */
  fillContext?: {
    phase: string;
    currentFieldLabel?: string;
    currentFieldType?: string;
    formName?: string;
  };
  /** Set by fill page to provide context. */
  setFillContext?: (ctx: VoiceContextValue["fillContext"]) => void;
}
```

### Fill Page Integration

In `app/fill/[formId]/page.tsx`, register fill context on mount:

```typescript
useEffect(() => {
  voice.setFillContext?.({
    phase,
    currentFieldLabel: currentField?.label,
    currentFieldType: currentField?.type,
    formName: record.name,
  });
  return () => voice.setFillContext?.(undefined);
}, [phase, currentField, record.name]);
```

---

## Step 5: Integrate into GlobalVoice Transcript Handler

### Current Flow (line 521-544)
```
handleTranscript(text, confidence)
  → pageListenerRef (fill page first refusal)
  → runGlobalTranscript (global commands)
  → resolveWithLlm (LLM fallback)
```

### New Flow
```
handleTranscript(text, confidence)
  → [Noise already filtered in speechToText.ts]
  → classifyIntent(text, fillContext)
  → if "command" → runGlobalTranscript OR pageListenerRef
  → if "answer" → pageListenerRef (fill page answer handler)
  → if "off_topic" → speak(offTopicRedirect(...))
  → if "unknown" → resolveWithLlm (existing LLM fallback)
```

### Specific Changes

**In `handleTranscript()` (line ~521):**
```typescript
const handleTranscript = (text: string, confidence: number) => {
  const trimmed = text.trim();
  if (trimmed.length < 2) return;
  
  // [NEW] Classify intent locally
  const intent = classifyIntent(text, {
    phase: voice.fillContext?.phase,
    currentFieldLabel: voice.fillContext?.currentFieldLabel,
    currentFieldType: voice.fillContext?.currentFieldType,
    formName: voice.fillContext?.formName,
    lang: getVoiceSettings().sttLang,
  });
  
  // [NEW] Handle off-topic
  if (intent.type === "off_topic") {
    const redirect = offTopicRedirect({
      transcript: text,
      topic: intent.topic,
      inFillMode: !!voice.fillContext,
      formName: voice.fillContext?.formName,
      currentFieldLabel: voice.fillContext?.currentFieldLabel,
      lang: getVoiceSettings().sttLang,
    });
    speak(redirect);
    return;
  }
  
  // [NEW] Handle noise (defensive)
  if (intent.type === "noise") return;
  
  // Existing: page listener → global commands → LLM fallback
  // (unchanged, but now "unknown" intents go to LLM)
  flashToast(`"${text}"`);
  if (pathname.startsWith("/fill/")) addMessage("user", text);
  
  const consumedByPage = pageListenerRef.current
    ? pageListenerRef.current(text, confidence)
    : false;
  if (!consumedByPage) {
    const handled = runGlobalTranscript(text);
    if (!handled && !pageListenerRef.current && !pathname.startsWith("/fill/") && trimmed.length >= 3) {
      void resolveWithLlm(text);
    }
  }
};
```

---

## Step 6: Integrate into Fill Page

### Changes to `onTranscript()` (line ~105)

The fill page's `onTranscript` listener should also classify intent:

```typescript
function onTranscript(text: string, confidence: number) {
  const clean = text.toLowerCase().trim();
  
  // [NEW] Classify intent with fill-page context
  const intent = classifyIntent(text, {
    phase,
    currentFieldLabel: queueRef.current[posRef.current]?.label,
    currentFieldType: queueRef.current[posRef.current]?.type,
    formName: recordRef.current?.name,
    lang: getVoiceSettings().sttLang,
  });
  
  // [NEW] Handle off-topic during fill
  if (intent.type === "off_topic" && (phase === "listening" || phase === "confirming")) {
    const redirect = offTopicRedirect({
      transcript: text,
      topic: intent.topic,
      inFillMode: true,
      formName: recordRef.current?.name,
      currentFieldLabel: queueRef.current[posRef.current]?.label,
      lang: getVoiceSettings().sttLang,
    });
    speak(redirect);
    // Re-ask the current question after redirect
    // (the redirect message already includes context)
    return;
  }
  
  // [NEW] Handle noise during fill
  if (intent.type === "noise") return;
  
  // Existing logic (unchanged)
  if (phase === "start" || phase === "notice") { ... }
  if (phase === "paused") { ... }
  if (phase === "typing") { ... }
  if (phase === "listening" || phase === "confirming") {
    handleSpeechInput(text, confidence);
  }
}
```

### Changes to `handleSpeechInput()` (line ~285)

Add noise/off-topic guard at the top:

```typescript
async function handleSpeechInput(transcript: string, confidence: number) {
  const id = beginRun();
  const clean = transcript.toLowerCase().trim();
  
  // [NEW] Quick noise check (shouldn't reach here, but defensive)
  const noise = detectNoise(transcript);
  if (noise.isNoise) return;
  
  const cmd = parseFillCommand(clean);
  // ... rest unchanged
}
```

---

## Step 7: Metrics & Observability (Optional but Recommended)

Add lightweight counters in `lib/voice/intentMetrics.ts`:

```typescript
interface IntentMetrics {
  total: number;
  noiseFiltered: number;
  commandsLocal: number;
  answersLocal: number;
  offTopicLocal: number;
  llmFallback: number;
}

/** Log a classification event. No-op in production if needed. */
export function logClassification(intent: ClassifiedIntent, source: "stt" | "fill" | "global"): void;
```

---

## Files Changed Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `lib/voice/noiseFilter.ts` | **NEW** | Noise/hallucination detection |
| `lib/voice/intentClassifier.ts` | **NEW** | Local-first intent classification |
| `lib/voice/offTopicRedirect.ts` | **NEW** | Polite redirect message generation |
| `lib/voice/speechToText.ts` | MODIFY | Add noise filter in `emitTranscript()` |
| `components/GlobalVoice.tsx` | MODIFY | Use classifier in transcript handler, expose fillContext |
| `app/fill/[formId]/page.tsx` | MODIFY | Use classifier in onTranscript/handleSpeechInput, provide fillContext |

---

## Testing Strategy

1. **Unit tests**: `noiseFilter.ts`, `intentClassifier.ts`, `offTopicRedirect.ts` — pure functions, easy to test
2. **Integration test**: Mock STT transcripts → verify correct routing
3. **Manual test**: Speak hallucination phrases, off-topic chatter, and form answers → verify behavior

---

## Estimated Impact

- **Lines added**: ~250-300 (3 new files + modifications)
- **Lines modified**: ~50-80 (integration points)
- **Performance**: Zero overhead for noise filter (regex). Intent classifier adds <1ms for local classification. LLM calls only made when truly needed (reduces total LLM calls).
- **Risk**: Low — additive changes, existing paths preserved as fallback.
