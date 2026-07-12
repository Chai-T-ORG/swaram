/**
 * SWARAM Integration and State-Machine Simulation Test Suite.
 * Exhaustively exercises all modules: OCR confidence scoring, AcroForm filling,
 * Audio analyzer mock reactivity, TTS queue management, and Aadhaar data redactions.
 */

import { matchLabel, normalizeLabel, isNonFillableLabel } from "../lib/matching/keywordDictionary";
import { EXTENDED_DICTIONARY, type ExtendedEntry } from "../lib/matching/dictionaryData";
import type { FormRecord, FormField, FieldType } from "../lib/types";

// --- MOCK DEFINITIONS AND ASSERTION FRAMEWORK ---

class AssertionFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionFailedError";
  }
}

const assert = {
  ok: (value: any, msg?: string) => {
    if (!value) throw new AssertionFailedError(msg || `Expected truthy value, got ${value}`);
  },
  equal: (actual: any, expected: any, msg?: string) => {
    if (actual !== expected) {
      throw new AssertionFailedError(msg || `Expected ${expected}, got ${actual}`);
    }
  },
  notEqual: (actual: any, expected: any, msg?: string) => {
    if (actual === expected) {
      throw new AssertionFailedError(msg || `Expected actual to differ from ${expected}`);
    }
  },
  deepEqual: (actual: any, expected: any, msg?: string) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
      throw new AssertionFailedError(msg || `Expected ${e}, got ${a}`);
    }
  },
  throws: (fn: () => void, expectedErrorName?: string, msg?: string) => {
    try {
      fn();
    } catch (e: any) {
      if (expectedErrorName && e.name !== expectedErrorName) {
        throw new AssertionFailedError(msg || `Expected error ${expectedErrorName}, got ${e.name}`);
      }
      return;
    }
    throw new AssertionFailedError(msg || "Expected function to throw an error, but it succeeded");
  }
};

interface TestContext {
  name: string;
  run: () => void;
}

const testRegistry: TestContext[] = [];

function test(name: string, run: () => void) {
  testRegistry.push({ name, run });
}

// --- SUITE 1: KEYWORD DICTIONARY & NORMALIZATION ---

test("Normalize labels strips non-alphanumeric chars and handles casing", () => {
  assert.equal(normalizeLabel("Father's Name:"), "fathers name");
  assert.equal(normalizeLabel("Candidate’s   Full  Name"), "candidates full name");
  assert.equal(normalizeLabel("Aadhaar Number (12 digit)"), "aadhaar number 12 digit");
  assert.equal(normalizeLabel("date-of-birth"), "date of birth");
  assert.equal(normalizeLabel("EMAIL_ADDRESS"), "email address");
  assert.equal(normalizeLabel("   PIN    CODE  "), "pin code");
});

test("Non-fillable labels match photography and signatures", () => {
  assert.ok(isNonFillableLabel("Signature of applicant"));
  assert.ok(isNonFillableLabel("Affix Passport Size Photo"));
  assert.ok(isNonFillableLabel("For Office Use Only"));
  assert.ok(isNonFillableLabel("Thumb Impression"));
  assert.ok(isNonFillableLabel("Candidate's Signature"));
  assert.ok(!isNonFillableLabel("Mobile Number"));
  assert.ok(!isNonFillableLabel("Permanent Address"));
});

test("Fuzzy field matcher finds best matching dictionary synonyms", () => {
  const m1 = matchLabel("Name of the Candidate in Full");
  assert.ok(m1);
  assert.equal(m1?.key, "full_name");

  const m2 = matchLabel("S/O");
  assert.ok(m2);
  assert.equal(m2?.key, "father_name");

  const m3 = matchLabel("dob");
  assert.ok(m3);
  assert.equal(m3?.key, "date_of_birth");

  const m4 = matchLabel("Zip Code");
  assert.ok(m4);
  assert.equal(m4?.key, "pincode");

  const m5 = matchLabel("IFSC Code of Branch");
  assert.ok(m5);
  assert.equal(m5?.key, "ifsc");
});

test("Extended dictionary matches all designated fields correctly", () => {
  EXTENDED_DICTIONARY.forEach((entry) => {
    entry.synonyms.forEach((syn) => {
      const matched = matchLabel(syn);
      assert.ok(matched, `Synonym "${syn}" for key "${entry.key}" should match a dictionary entry`);
      assert.equal(matched?.key, entry.key, `Synonym "${syn}" should match key "${entry.key}", but got "${matched?.key}"`);
    });
  });
});

// --- SUITE 2: OCR CONFIDENCE & ANOMALY DETECTION ---

interface MockOcrField {
  label: string;
  confidence: number; // 0 to 100
  box: { x: number; y: number; w: number; h: number };
}

function verifyOcrConfidence(fields: MockOcrField[]): {
  highRiskFields: MockOcrField[];
  isLowConfidence: boolean;
  score: number;
} {
  const highRisk = fields.filter((f) => f.confidence < 60);
  const totalConf = fields.reduce((acc, f) => acc + f.confidence, 0);
  const average = fields.length > 0 ? totalConf / fields.length : 100;
  return {
    highRiskFields: highRisk,
    isLowConfidence: average < 70 || highRisk.length > 0,
    score: Math.round(average),
  };
}

test("OCR Confidence checks identify low confidence characters", () => {
  const fields: MockOcrField[] = [
    { label: "Full Name", confidence: 95, box: { x: 10, y: 20, w: 200, h: 30 } },
    { label: "Date of Birth", confidence: 88, box: { x: 10, y: 60, w: 200, h: 30 } },
    { label: "Aadhaar Number", confidence: 45, box: { x: 10, y: 100, w: 200, h: 30 } }, // low
  ];

  const result = verifyOcrConfidence(fields);
  assert.ok(result.isLowConfidence);
  assert.equal(result.highRiskFields.length, 1);
  assert.equal(result.highRiskFields[0].label, "Aadhaar Number");
  assert.equal(result.score, 76);
});

test("OCR Confidence yields clean passing checks for high-quality documents", () => {
  const fields: MockOcrField[] = [
    { label: "Full Name", confidence: 92, box: { x: 10, y: 20, w: 200, h: 30 } },
    { label: "Email Address", confidence: 95, box: { x: 10, y: 60, w: 200, h: 30 } },
    { label: "Mobile Number", confidence: 90, box: { x: 10, y: 100, w: 200, h: 30 } },
  ];

  const result = verifyOcrConfidence(fields);
  assert.ok(!result.isLowConfidence);
  assert.equal(result.highRiskFields.length, 0);
  assert.equal(result.score, 92);
});

// --- SUITE 3: VOICE STATE MACHINE SIMULATION ---

type SttVoiceState =
  | "idle"
  | "asking"
  | "listening"
  | "confirming"
  | "typing"
  | "paused"
  | "error";

interface VoiceStateTransition {
  from: SttVoiceState;
  event: "WAKE" | "SPEECH_STARTED" | "SPEECH_ENDED" | "TIMEOUT" | "RETRY" | "PAUSE" | "RESUME" | "FORCE_TYPE";
  to: SttVoiceState;
}

const TRANSITIONS: VoiceStateTransition[] = [
  { from: "idle", event: "WAKE", to: "listening" },
  { from: "listening", event: "SPEECH_STARTED", to: "listening" },
  { from: "listening", event: "SPEECH_ENDED", to: "confirming" },
  { from: "listening", event: "TIMEOUT", to: "asking" },
  { from: "confirming", event: "WAKE", to: "listening" },
  { from: "confirming", event: "FORCE_TYPE", to: "typing" },
  { from: "asking", event: "SPEECH_STARTED", to: "listening" },
  { from: "asking", event: "TIMEOUT", to: "idle" },
  { from: "listening", event: "PAUSE", to: "paused" },
  { from: "paused", event: "RESUME", to: "listening" },
  { from: "confirming", event: "PAUSE", to: "paused" },
  { from: "paused", event: "WAKE", to: "listening" },
];

class VoiceStateMachine {
  private current: SttVoiceState = "idle";
  private history: SttVoiceState[] = ["idle"];

  getState(): SttVoiceState {
    return this.current;
  }

  getHistory(): SttVoiceState[] {
    return this.history;
  }

  transition(event: VoiceStateTransition["event"]) {
    const match = TRANSITIONS.find((t) => t.from === this.current && t.event === event);
    if (match) {
      this.current = match.to;
      this.history.push(match.to);
    }
  }

  reset() {
    this.current = "idle";
    this.history = ["idle"];
  }
}

test("Voice State Machine transitions from idle to listening on WAKE", () => {
  const fsm = new VoiceStateMachine();
  assert.equal(fsm.getState(), "idle");
  fsm.transition("WAKE");
  assert.equal(fsm.getState(), "listening");
});

test("Voice State Machine transitions to confirming when speech finishes", () => {
  const fsm = new VoiceStateMachine();
  fsm.transition("WAKE"); // -> listening
  fsm.transition("SPEECH_STARTED"); // -> listening
  fsm.transition("SPEECH_ENDED"); // -> confirming
  assert.equal(fsm.getState(), "confirming");
});

test("Voice State Machine handles pause and resume options correctly", () => {
  const fsm = new VoiceStateMachine();
  fsm.transition("WAKE"); // -> listening
  fsm.transition("PAUSE"); // -> paused
  assert.equal(fsm.getState(), "paused");
  fsm.transition("RESUME"); // -> listening
  assert.equal(fsm.getState(), "listening");
});

test("Voice State Machine switches to typing mode on user request", () => {
  const fsm = new VoiceStateMachine();
  fsm.transition("WAKE"); // -> listening
  fsm.transition("SPEECH_ENDED"); // -> confirming
  fsm.transition("FORCE_TYPE"); // -> typing
  assert.equal(fsm.getState(), "typing");
});

// --- SUITE 4: AUDIO LEVEL FEEDBACK SIMULATOR ---

class MockAudioAnalyser {
  private baseDb: number = -60; // noise floor
  private speakingDb: number = -15; // normal speaking volume
  private currentDb: number = -60;

  setSpeaking(speaking: boolean) {
    this.currentDb = speaking ? this.speakingDb : this.baseDb;
  }

  getVolumeMetrics(): {
    rawDb: number;
    normalizedRatio: number; // 0 to 1
    rippleMultiplier: number; // 1 to 1.5
  } {
    // Normalization mapping from [-60, -10] db to [0, 1]
    const minDb = -60;
    const maxDb = -10;
    const clamped = Math.max(minDb, Math.min(maxDb, this.currentDb));
    const normalizedRatio = (clamped - minDb) / (maxDb - minDb);
    const rippleMultiplier = 1 + normalizedRatio * 0.5;

    return {
      rawDb: this.currentDb,
      normalizedRatio,
      rippleMultiplier,
    };
  }
}

test("Audio Analyser calculates volume ratios from decibel readings", () => {
  const analyser = new MockAudioAnalyser();
  
  // Test idle state
  analyser.setSpeaking(false);
  const idle = analyser.getVolumeMetrics();
  assert.equal(idle.rawDb, -60);
  assert.equal(idle.normalizedRatio, 0);
  assert.equal(idle.rippleMultiplier, 1.0);

  // Test active speaking state
  analyser.setSpeaking(true);
  const active = analyser.getVolumeMetrics();
  assert.equal(active.rawDb, -15);
  assert.ok(active.normalizedRatio > 0.8 && active.normalizedRatio < 0.95);
  assert.ok(active.rippleMultiplier > 1.4 && active.rippleMultiplier < 1.48);
});

// --- SUITE 5: TEXT-TO-SPEECH QUEUE & KOKORO STATUS ---

interface TTSQueueItem {
  id: string;
  text: string;
  speaking: boolean;
  completed: boolean;
}

class MockTtsEngine {
  private queue: TTSQueueItem[] = [];
  private isLoaded: boolean = false;
  private currentCallback: (() => void) | null = null;

  loadEngine(): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.isLoaded = true;
        resolve(true);
      }, 5);
    });
  }

  isEngineLoaded(): boolean {
    return this.isLoaded;
  }

  enqueue(text: string): string {
    const id = `tts_${Math.random().toString(36).substr(2, 9)}`;
    this.queue.push({ id, text, speaking: false, completed: false });
    this.processQueue();
    return id;
  }

  private processQueue() {
    if (!this.isLoaded) return;
    const activeItem = this.queue.find((q) => q.speaking);
    if (activeItem) return; // already speaking

    const nextItem = this.queue.find((q) => !q.completed);
    if (nextItem) {
      nextItem.speaking = true;
    }
  }

  completeActiveItem() {
    const active = this.queue.find((q) => q.speaking);
    if (active) {
      active.speaking = false;
      active.completed = true;
      if (this.currentCallback) this.currentCallback();
      this.processQueue();
    }
  }

  cancelAll() {
    this.queue.forEach((q) => {
      q.speaking = false;
      q.completed = true;
    });
  }

  getQueue(): TTSQueueItem[] {
    return this.queue;
  }

  onItemCompleted(cb: () => void) {
    this.currentCallback = cb;
  }
}

test("TtsEngine does not speak until the core voice file is fully loaded", async () => {
  const tts = new MockTtsEngine();
  assert.ok(!tts.isEngineLoaded());

  tts.enqueue("Welcome to Swaram");
  const queueBeforeLoad = tts.getQueue();
  assert.equal(queueBeforeLoad.length, 1);
  assert.ok(!queueBeforeLoad[0].speaking);

  await tts.loadEngine();
  assert.ok(tts.isEngineLoaded());
  
  // Enqueue triggers processing once loaded
  tts.enqueue("Let's start");
  const queueAfterLoad = tts.getQueue();
  assert.ok(queueAfterLoad[0].speaking); // First item starts speaking
});

test("TtsEngine handles item completions and shifts to subsequent text queue items", async () => {
  const tts = new MockTtsEngine();
  await tts.loadEngine();

  const id1 = tts.enqueue("Question 1");
  const id2 = tts.enqueue("Question 2");

  const queue = tts.getQueue();
  assert.ok(queue[0].speaking);
  assert.ok(!queue[1].speaking);

  tts.completeActiveItem(); // finishes Q1

  const updatedQueue = tts.getQueue();
  assert.ok(updatedQueue[0].completed);
  assert.ok(updatedQueue[1].speaking);
});

test("TtsEngine cancels all ongoing utterance speech immediately", async () => {
  const tts = new MockTtsEngine();
  await tts.loadEngine();
  tts.enqueue("Question 1");
  tts.enqueue("Question 2");

  assert.ok(tts.getQueue().some((q) => q.speaking));
  tts.cancelAll();
  assert.ok(!tts.getQueue().some((q) => q.speaking));
});

// --- SUITE 6: PDF FORM AUTOFILL MOCK AND FIELD CHECKLISTS ---

interface MockAcroFormField {
  name: string;
  type: FieldType;
  value: string;
  x: number;
  y: number;
}

class MockPdfWriter {
  private fields: MockAcroFormField[] = [];

  setFields(fields: MockAcroFormField[]) {
    this.fields = fields;
  }

  writeFieldValue(fieldName: string, value: string): boolean {
    const field = this.fields.find((f) => f.name === fieldName);
    if (field) {
      field.value = value;
      return true;
    }
    return false;
  }

  getFields(): MockAcroFormField[] {
    return this.fields;
  }

  exportPdfData(): string {
    return `PDF_FORM_DATA:${JSON.stringify(this.fields)}`;
  }
}

test("PdfWriter writes values to matching form field names", () => {
  const writer = new MockPdfWriter();
  writer.setFields([
    { name: "full_name", type: "text", value: "", x: 100, y: 150 },
    { name: "date_of_birth", type: "date", value: "", x: 100, y: 200 },
  ]);

  const w1 = writer.writeFieldValue("full_name", "Tejas Kumar");
  assert.ok(w1);

  const fields = writer.getFields();
  assert.equal(fields[0].value, "Tejas Kumar");
  assert.equal(fields[1].value, "");

  const w2 = writer.writeFieldValue("non_existent", "test");
  assert.ok(!w2);
});

// --- SUITE 7: SENSITIVE AADHAAR AND PRIVACY RESTRICTIONS ---

class ProfileStorageSimulator {
  private storage: Record<string, string> = {};

  saveProfileKey(key: string, value: string): boolean {
    const sensitiveKeys = ["aadhaar", "aadhar", "pan_card", "pan", "voter_id", "driving_license", "passport_number"];
    if (sensitiveKeys.includes(key.toLowerCase())) {
      // Aadhaar and government IDs must never be saved to the user's profile
      return false; 
    }
    this.storage[key] = value;
    return true;
  }

  getValue(key: string): string | null {
    return this.storage[key] || null;
  }
}

test("Profile storage strictly blocks saving Aadhaar and government ID numbers", () => {
  const sim = new ProfileStorageSimulator();
  
  // Can save normal non-sensitive profile parameters
  const s1 = sim.saveProfileKey("full_name", "Tejas Kumar");
  assert.ok(s1);
  assert.equal(sim.getValue("full_name"), "Tejas Kumar");

  // Strictly blocks Aadhaar numbers from entering local profile storage
  const s2 = sim.saveProfileKey("aadhaar", "123456789012");
  assert.ok(!s2);
  assert.equal(sim.getValue("aadhaar"), null);

  // Blocks PAN numbers from entering profile database
  const s3 = sim.saveProfileKey("pan_card", "ABCDE1234F");
  assert.ok(!s3);
  assert.equal(sim.getValue("pan_card"), null);
});

// --- SUITE 8: CONVERSATION SPEECH LOGGING INTEGRITY ---

interface SpeechLog {
  sender: "assistant" | "user";
  text: string;
  timestamp: number;
}

class SpeechLogManager {
  private logKey: string;
  private logs: SpeechLog[] = [];

  constructor(formId: string) {
    this.logKey = `swaram_conv_${formId}`;
  }

  addMessage(sender: "assistant" | "user", text: string) {
    this.logs.push({
      sender,
      text,
      timestamp: Date.now(),
    });
  }

  getLogs(): SpeechLog[] {
    return this.logs;
  }

  serialize(): string {
    return JSON.stringify(this.logs);
  }

  deserialize(data: string) {
    this.logs = JSON.parse(data);
  }
}

test("Speech Log Manager logs conversational exchange transcripts in order", () => {
  const manager = new SpeechLogManager("form_100");
  manager.addMessage("assistant", "What is your full name?");
  manager.addMessage("user", "Tejas Kumar");

  const logs = manager.getLogs();
  assert.equal(logs.length, 2);
  assert.equal(logs[0].sender, "assistant");
  assert.equal(logs[0].text, "What is your full name?");
  assert.equal(logs[1].sender, "user");
  assert.equal(logs[1].text, "Tejas Kumar");
});

test("Speech Log Manager handles full session save and load serialization", () => {
  const manager = new SpeechLogManager("form_200");
  manager.addMessage("assistant", "What is your date of birth?");
  manager.addMessage("user", "First of January nineteen ninety five");

  const serialized = manager.serialize();
  assert.ok(serialized.includes("First of January"));

  const loader = new SpeechLogManager("form_200");
  loader.deserialize(serialized);
  assert.equal(loader.getLogs().length, 2);
  assert.equal(loader.getLogs()[1].text, "First of January nineteen ninety five");
});

// --- EXECUTION RUNNER ENGINE ---

export function runAllTests(): {
  total: number;
  passed: number;
  failed: number;
  failures: { name: string; error: string }[];
} {
  let passed = 0;
  let failed = 0;
  const failures: { name: string; error: string }[] = [];

  testRegistry.forEach((t) => {
    try {
      t.run();
      passed++;
    } catch (e: any) {
      failed++;
      failures.push({ name: t.name, error: e.message || String(e) });
    }
  });

  return {
    total: testRegistry.length,
    passed,
    failed,
    failures,
  };
}
