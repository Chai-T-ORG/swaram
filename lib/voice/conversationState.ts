/**
 * A small, framework-free state machine for the user-visible voice workflow.
 * Screen hooks emit domain events; this reducer is the single source of truth
 * for what the assistant is currently doing and what it should communicate.
 */
export type ConversationState =
  | "idle"
  | "listening"
  | "upload-intent-detected"
  | "waiting-for-file"
  | "uploading"
  | "processing"
  | "extracting-fields"
  | "ready-to-fill"
  | "filling-form"
  | "reviewing"
  | "completed"
  | "error";

export type ConversationEvent =
  | { type: "LISTENING" }
  | { type: "UPLOAD_INTENT" }
  | { type: "WAITING_FOR_FILE" }
  | { type: "FILE_SELECTED" }
  | { type: "PROCESSING" }
  | { type: "EXTRACTING_FIELDS" }
  | { type: "READY_TO_FILL" }
  | { type: "FILLING_FORM" }
  | { type: "REVIEWING" }
  | { type: "COMPLETED" }
  | { type: "CANCELLED" }
  | { type: "ERROR"; message: string };

export interface ConversationSnapshot {
  state: ConversationState;
  error?: string;
  changedAt: number;
}

export const initialConversation: ConversationSnapshot = {
  state: "idle",
  changedAt: 0,
};

const NEXT_STATE: Record<ConversationEvent["type"], ConversationState> = {
  LISTENING: "listening",
  UPLOAD_INTENT: "upload-intent-detected",
  WAITING_FOR_FILE: "waiting-for-file",
  FILE_SELECTED: "uploading",
  PROCESSING: "processing",
  EXTRACTING_FIELDS: "extracting-fields",
  READY_TO_FILL: "ready-to-fill",
  FILLING_FORM: "filling-form",
  REVIEWING: "reviewing",
  COMPLETED: "completed",
  CANCELLED: "idle",
  ERROR: "error",
};

export function transitionConversation(
  current: ConversationSnapshot,
  event: ConversationEvent,
): ConversationSnapshot {
  const state = NEXT_STATE[event.type];
  if (current.state === state && (event.type !== "ERROR" || current.error === event.message)) return current;
  return {
    state,
    error: event.type === "ERROR" ? event.message : undefined,
    changedAt: Date.now(),
  };
}
