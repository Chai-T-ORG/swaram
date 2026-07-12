/**
 * intlCommands.ts — multilingual keyword lexicon for Swaram's small, closed set
 * of voice commands.
 *
 * The regex command matchers elsewhere are authored in English, so when the
 * recognizer runs in Hindi / Malayalam / French (which return native script for
 * hi & ml, Latin for fr) a spoken command matches nothing and the fill flow —
 * which has no LLM fallback — silently drops it. These keyword lists let the
 * same commands be recognised in every supported language, instantly and
 * offline (no translate/LLM round-trip).
 *
 * Matching is deliberately conservative: a command is only recognised when the
 * utterance is SHORT (commands are terse) and the keyword appears as a whole
 * token or phrase, so a long spoken answer that merely contains a command word
 * is not mistaken for a command.
 *
 * Note: the translations are pragmatic, common phrasings — a native speaker
 * should review/extend them. English stays covered by the existing regexes.
 */

export type IntlIntent =
  | "repeat"
  | "skip"
  | "back"
  | "type"
  | "pause"
  | "help"
  | "spell"
  | "yes"
  | "no"
  | "home"
  | "upload"
  | "scan"
  | "history"
  | "profile"
  | "stop"
  | "read_page"
  | "start"
  | "resume";

/**
 * Keyword lists per intent — Hindi (Devanagari), Malayalam, French only.
 * English is deliberately EXCLUDED: it's already matched by precise, anchored
 * regexes at each call site, and adding loose English tokens here would make an
 * English answer that merely contains a command word (e.g. "my previous
 * address") be mistaken for a command.
 */
export const INTL_KEYWORDS: Record<IntlIntent, string[]> = {
  repeat: [
    "दोहराओ", "दोहरा", "दुबारा", "फिर से", "फिर से बोलो", "दुबारा बोलो",
    "ആവർത്തിക്കുക", "വീണ്ടും", "വീണ്ടും പറയൂ", "വീണ്ടും പറയുക", "ഒന്നുകൂടി",
    "répète", "répéter", "redis",
  ],
  skip: [
    "छोड़ो", "छोड़ दो", "आगे", "अगला", "आगे बढ़ो",
    "ഒഴിവാക്കുക", "ഒഴിവാക്കൂ", "അടുത്തത്", "അടുത്തതിലേക്ക്",
    "passer", "suivant", "sauter", "ignorer",
  ],
  back: [
    "पीछे", "वापस", "पिछला", "पीछे जाओ", "वापस जाओ",
    "പിന്നോട്ട്", "തിരികെ", "മുൻപത്തേത്", "പിന്നിലേക്ക്", "തിരിച്ചു പോകൂ",
    "retour", "précédent", "arrière", "reviens", "retourne",
  ],
  type: [
    "टाइप", "टाइप करूँगा", "कीबोर्ड", "लिखूँगा",
    "ടൈപ്പ്", "ടൈപ്പ് ചെയ്യാം", "കീബോർഡ്", "എഴുതാം",
    "taper", "clavier", "écrire",
  ],
  pause: [
    "रुको", "रुकिए", "ठहरो", "रुक जाओ",
    "നിർത്തുക", "നിർത്തൂ", "കാത്തിരിക്കൂ", "ഒന്ന് നിർത്തൂ",
    "attends", "attendez", "un instant",
  ],
  help: [
    "मदद", "सहायता", "क्या बोलूँ", "क्या कह सकता हूँ", "मदद करो",
    "സഹായം", "സഹായിക്കൂ", "സഹായിക്കുക", "എന്ത് പറയാം",
    "aide", "aidez-moi", "aide-moi", "au secours",
  ],
  spell: [
    "वर्तनी", "अक्षर से", "अक्षर दर अक्षर", "स्पेल",
    "അക്ഷരം", "അക്ഷരമായി", "അക്ഷരം അക്ഷരമായി", "സ്പെൽ",
    "épeler", "épelle", "lettre par lettre",
  ],
  yes: [
    "haan", "हाँ", "हां", "जी", "जी हाँ", "सही", "ठीक", "ठीक है", "बिल्कुल",
    "അതെ", "ശരി", "ഉവ്വ്", "ശരിയാണ്", "അതെയതെ",
    "oui", "exact", "c'est juste", "c'est correct",
  ],
  no: [
    "nahi", "नहीं", "नही", "ना", "गलत", "ग़लत", "गलत है",
    "അല്ല", "അല്ലാ", "തെറ്റ്", "വേണ്ട", "തെറ്റാണ്",
    "non", "faux", "c'est faux",
  ],
  home: [
    "होम", "मुख्य", "होम पेज", "मुख्य मेनू",
    "ഹോം", "ഹോം പേജ്", "പ്രധാന താൾ", "മുഖ്യതാൾ",
    "accueil", "menu principal", "page d'accueil",
  ],
  upload: [
    "अपलोड", "फ़ाइल चुनें", "नया फॉर्म",
    "അപ്‌ലോഡ്", "അപ്ലോഡ്", "ഫയൽ", "പുതിയ ഫോം",
    "télécharger", "importer", "nouveau formulaire", "fichier",
  ],
  scan: [
    "स्कैन", "कैमरा", "फोटो", "तस्वीर",
    "സ്കാൻ", "ക്യാമറ", "ഫോട്ടോ",
    "scanner", "caméra", "numériser",
  ],
  history: [
    "मेरे फॉर्म", "इतिहास", "दस्तावेज़",
    "എന്റെ ഫോമുകൾ", "ചരിത്രം", "രേഖകൾ",
    "mes formulaires", "historique", "mes documents",
  ],
  profile: [
    "प्रोफ़ाइल", "सेटिंग", "मेरी जानकारी", "प्राथमिकताएं",
    "പ്രൊഫൈൽ", "ക്രമീകരണങ്ങൾ", "സെറ്റിംഗ്സ്", "എന്റെ വിവരങ്ങൾ",
    "profil", "paramètres", "réglages", "mes détails",
  ],
  stop: [
    "चुप", "बंद करो", "चुप रहो",
    "മിണ്ടരുത്", "നിശ്ശബ്ദം", "സംസാരം നിർത്തൂ",
    "tais-toi", "arrête de parler",
  ],
  read_page: [
    "यह पेज पढ़ो", "मैं कहाँ हूँ", "पेज पढ़ो",
    "ഈ പേജ് വായിക്കൂ", "ഞാൻ എവിടെയാണ്", "പേജ് വായിക്കുക",
    "lis cette page", "où suis-je", "lire la page",
  ],
  start: [
    "shuru", "शुरू", "शुरू करो", "चलो", "भरना शुरू", "तैयार",
    "തുടങ്ങുക", "തുടങ്ങാം", "തുടങ്ങൂ", "ആരംഭിക്കുക", "തയ്യാർ",
    "commencer", "démarrer", "c'est parti", "allons-y", "prêt", "remplir",
  ],
  resume: [
    "फिर शुरू", "जारी रखो", "आगे बढ़ो", "चालू करो",
    "തുടരുക", "തുടരൂ", "വീണ്ടും തുടങ്ങൂ",
    "reprendre", "continuer", "reprends",
  ],
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalize an utterance for keyword matching (lowercase, strip punctuation). */
function normalize(utterance: string): string {
  return utterance
    .toLowerCase()
    .replace(/[.,!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does a short utterance express any of these keywords? Multi-word keywords
 * match as a phrase; single-word keywords match as a whole token. Utterances
 * longer than `maxTokens` are treated as free text (an answer), not a command.
 */
export function containsKeyword(utterance: string, keywords: string[], maxTokens = 6): boolean {
  const t = normalize(utterance);
  if (!t) return false;
  const tokenCount = t.split(" ").length;
  for (const kw of keywords) {
    const k = normalize(kw);
    if (!k) continue;
    if (k.includes(" ")) {
      if (t.includes(k)) return true;
    } else {
      if (t === k) return true;
      if (tokenCount <= maxTokens && new RegExp(`(^|\\s)${escapeRegExp(k)}(\\s|$)`, "u").test(t)) {
        return true;
      }
    }
  }
  return false;
}

/** Convenience: does the utterance match the given intent in any language? */
export function matchesIntent(utterance: string, intent: IntlIntent, maxTokens = 6): boolean {
  return containsKeyword(utterance, INTL_KEYWORDS[intent], maxTokens);
}

/**
 * A case-insensitive, Unicode-aware regex that matches any keyword for an
 * intent — for the substring-style global command table in GlobalVoice.
 */
export function intentRegex(intent: IntlIntent): RegExp {
  const parts = INTL_KEYWORDS[intent].map((k) => escapeRegExp(k.toLowerCase()));
  return new RegExp(parts.join("|"), "iu");
}
