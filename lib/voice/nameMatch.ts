/**
 * nameMatch.ts — the SINGLE source of truth for "is this spoken name the same
 * as a stored one, just misheard?". Imported by BOTH the client name dictionary
 * (snapToKnownName) and the server ensemble (snapToKnown in the transcribe
 * route), so the two can never drift apart and silently re-introduce the
 * over-snap bug that once turned a mother's "Maria …" into the father's
 * "Gordan …".
 *
 * THE INVARIANT (locked by unit tests, see scripts/smoke.test.ts):
 *   A stored name matches a spoken one ONLY when they have the SAME number of
 *   words AND every word is independently a near-miss — NEVER on an aggregate
 *   distance budget. Consequences that must always hold:
 *     • a different GIVEN name never snaps just because the surname matches
 *       (nameClose("Maria Kimmich Ramodaran","Gordan Kimmich Ramodaran") = false)
 *     • an initial never maps to a full word ("Tejas K M" ≠ "Tejas Kumar Menon")
 *     • only genuine mishearings heal ("Twinsh T Thilakan" → "Twinsha T Thilakan")
 *
 * Self-contained (own edit-distance) so it is safe to import in any runtime —
 * browser, Node, or the edge API route — with no heavy or DOM-bound deps.
 */

/** Levenshtein distance, case-insensitive. */
export function editDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[t.length];
}

/** Two single WORDS close enough to be the same word misheard. */
export function wordCloseEnough(a: string, b: string): boolean {
  const d = editDistance(a, b);
  if (d === 0) return true;
  const len = Math.max(a.length, b.length);
  // Per-word budget only. Short words must match exactly (too little signal).
  return len >= 4 && d <= Math.max(1, Math.floor(len * 0.34));
}

/**
 * True iff `heard` is `candidate` misheard: same word count, each word an
 * independent near-miss, and an initial (single letter) never maps to a full
 * word (or vice-versa). This is the ONLY predicate any snap may use.
 */
export function nameClose(heard: string, candidate: string): boolean {
  const h = heard.trim().split(/\s+/).filter(Boolean);
  const c = candidate.trim().split(/\s+/).filter(Boolean);
  if (h.length === 0 || h.length !== c.length) return false;
  for (let i = 0; i < h.length; i++) {
    const hi = h[i].replace(/\./g, "");
    const ci = c[i].replace(/\./g, "");
    if ((hi.length === 1) !== (ci.length === 1)) return false; // initial vs word
    if (!wordCloseEnough(hi.toLowerCase(), ci.toLowerCase())) return false;
  }
  return true;
}
