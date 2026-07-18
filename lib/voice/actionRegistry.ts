/**
 * actionRegistry.ts — the set of things the user can do by voice *right now*.
 *
 * Instead of a fixed, hand-maintained command enum, every screen registers the
 * actions it can perform with a plain-language description. The intent router
 * hands that live list to the LLM, which maps whatever the user said — in any
 * phrasing or language — onto one of them. New capabilities become voice-
 * addressable just by registering an action + a sentence, no keyword upkeep.
 *
 * Two tiers use this:
 *   • fast lane — an optional `match` regex for instant, offline recognition of
 *     the common commands.
 *   • adapt lane — the `description`, which the LLM classifies against when the
 *     fast lane misses (see resolveAction in llm.ts).
 */

export interface VoiceAction {
  /** Stable identifier the LLM returns, e.g. "choose_file". */
  id: string;
  /** Natural-language description of what this does — the LLM matches on this. */
  description: string;
  /** Run the action. Params are reserved for future slot-filling. */
  run: (params?: Record<string, string>) => void;
  /** Optional offline fast-lane matcher (tested against the lowercased utterance). */
  match?: RegExp;
}

const globalActions = new Map<string, VoiceAction>();
let pageActions: VoiceAction[] = [];

/** Register always-available actions (navigation, stop, help, language…). Idempotent by id. */
export function registerGlobalActions(actions: VoiceAction[]): void {
  for (const a of actions) globalActions.set(a.id, a);
}

/** Replace the current screen's actions. Returns a cleanup that clears them. */
export function setPageActions(actions: VoiceAction[]): () => void {
  pageActions = actions;
  return () => {
    if (pageActions === actions) pageActions = [];
  };
}

/** Everything callable right now — page actions first (they can shadow a global id). */
export function getAvailableActions(): VoiceAction[] {
  const pageIds = new Set(pageActions.map((a) => a.id));
  return [...pageActions, ...[...globalActions.values()].filter((a) => !pageIds.has(a.id))];
}

/** Look up an action by id (page scope wins over global). */
export function getAction(id: string): VoiceAction | undefined {
  return pageActions.find((a) => a.id === id) ?? globalActions.get(id);
}
