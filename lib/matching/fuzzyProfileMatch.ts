/**
 * Fuse.js fuzzy matching between detected field labels and saved profile
 * keys. Sensitive fields (Aadhaar etc.) are excluded before matching — they
 * are never auto-filled and never stored.
 */
import Fuse from "fuse.js";
import type { FormField, ProfileData } from "../types";
import { DICTIONARY, type DictEntry } from "./keywordDictionary";

/** Fuse threshold: 0.0 = exact, 1.0 = anything. Start at 0.7 per spec. */
const FUSE_THRESHOLD = 0.7;

interface SearchDoc {
  profileKey: string;
  label: string;
  synonyms: string[];
}

const searchDocs: SearchDoc[] = DICTIONARY.filter(
  (entry): entry is DictEntry & { profileKey: string } =>
    Boolean(entry.profileKey) && !entry.sensitive,
).map((entry) => ({
  profileKey: entry.profileKey,
  label: entry.label,
  synonyms: entry.synonyms,
}));

const fuse = new Fuse(searchDocs, {
  keys: [
    { name: "label", weight: 2 },
    { name: "synonyms", weight: 1 },
  ],
  includeScore: true,
  threshold: FUSE_THRESHOLD,
  ignoreLocation: true,
});

export interface AutoFillMatch {
  fieldId: string;
  profileKey: string;
  value: string;
  /** Fuse score: 0 is perfect. */
  score: number;
}

/**
 * Match detected fields against the saved profile. Returns one best match
 * per field for which the profile actually has a value.
 */
export function matchFieldsToProfile(
  fields: FormField[],
  profile: ProfileData,
): AutoFillMatch[] {
  const matches: AutoFillMatch[] = [];
  for (const field of fields) {
    if (field.sensitive) continue;
    if (field.status !== "pending") continue;

    // A dictionary hit made during analysis is authoritative.
    let profileKey = field.profileKey ?? null;
    let score = profileKey ? 0 : 1;

    if (!profileKey) {
      const results = fuse.search(field.label);
      if (results.length > 0) {
        profileKey = results[0].item.profileKey;
        score = results[0].score ?? 1;
      }
    }

    if (!profileKey) continue;
    const value = profile[profileKey];
    if (!value) continue;
    // Never force a profile value onto a choice field whose printed options
    // don't include it (e.g. profile "OBC" vs options "Merit-based / Sports").
    if (field.type === "choice" && field.options?.length) {
      const v = value.trim().toLowerCase();
      const match = field.options.find(
        (o) => o.trim().toLowerCase() === v || o.trim().toLowerCase().includes(v) || v.includes(o.trim().toLowerCase()),
      );
      if (!match) continue;
      matches.push({ fieldId: field.id, profileKey, value: match, score });
      continue;
    }
    matches.push({ fieldId: field.id, profileKey, value, score });
  }
  return matches;
}

/** Map a completed form's answers back to profile keys for opt-in saving. */
export function extractProfileUpdates(fields: FormField[]): ProfileData {
  const updates: ProfileData = {};
  for (const field of fields) {
    if (field.sensitive || !field.profileKey) continue;
    if (!field.value.trim()) continue;
    if (field.status !== "answered" && field.status !== "autofilled") continue;
    updates[field.profileKey] = field.value.trim();
  }
  return updates;
}
