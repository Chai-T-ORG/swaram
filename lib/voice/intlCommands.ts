/**
 * intlCommands.ts — multilingual keyword lexicon for Swaram's small, closed set
 * of voice commands.
 *
 * The regex command matchers elsewhere are authored in English, so when the
 * recognizer runs in Hindi / Malayalam / French (which return native script for
 * hi & ml, Latin for fr) a spoken command matches nothing and the fill flow
 * silently drops it. These keyword lists let the same commands be recognised in
 * every supported language, instantly and offline (no translate/LLM round-trip).
 *
 * Matching is deliberately conservative: a command is only recognised when the
 * utterance is SHORT (commands are terse) and the keyword appears as a whole
 * token or phrase, so a long spoken answer that merely contains a command word
 * is not mistaken for a command.
 *
 * Note: these are pragmatic, common phrasings — a native speaker should
 * review/extend them. English stays covered by the existing regexes.
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
    "दोहराओ", "दोहरा", "दोहराइए", "दुबारा", "दुबारा बोलो", "दुबारा बोलिए",
    "फिर से", "फिर से बोलो", "फिर से बोलिए", "फिर से कहो", "एक बार फिर", "एक बार और",
    "ആവർത്തിക്കുക", "ആവർത്തിക്കൂ", "വീണ്ടും", "വീണ്ടും പറയൂ", "വീണ്ടും പറയുക",
    "വീണ്ടും പറയാമോ", "ഒന്നുകൂടി", "ഒന്നുകൂടി പറയൂ", "ഒരിക്കൽ കൂടി",
    "répète", "répétez", "répéter", "encore", "encore une fois", "redis", "redites",
  ],
  skip: [
    "छोड़ो", "छोड़ दो", "छोड़ दीजिए", "छोड़ें", "आगे", "आगे बढ़ो", "अगला",
    "अगला सवाल", "इसे छोड़ो", "यह छोड़ो", "स्किप",
    "ഒഴിവാക്കുക", "ഒഴിവാക്കൂ", "ഒഴിവാക്കാം", "അടുത്തത്", "അടുത്തതിലേക്ക്",
    "അടുത്ത ചോദ്യം", "ഇത് വിടുക", "വിട്ടേക്കൂ", "സ്കിപ്പ്",
    "passer", "passe", "passez", "suivant", "suivante", "sauter", "ignorer", "ignore",
  ],
  back: [
    "पीछे", "पीछे जाओ", "पीछे जाइए", "वापस", "वापस जाओ", "वापस जाइए", "पिछला",
    "पिछला सवाल", "बदलो", "बदलना है", "ठीक करो", "सुधारो",
    "പിന്നോട്ട്", "പിന്നിലേക്ക്", "തിരികെ", "തിരിച്ചു", "തിരിച്ചു പോകൂ",
    "മുൻപത്തേത്", "മുമ്പത്തെ ചോദ്യം", "മാറ്റണം", "മാറ്റുക", "തിരുത്തുക", "തിരുത്തണം",
    "retour", "retourne", "précédent", "précédente", "arrière", "reviens", "revenir",
    "corriger", "modifier", "changer",
  ],
  type: [
    "टाइप", "टाइप करूँगा", "टाइप करना है", "कीबोर्ड", "लिखूँगा", "लिखना है",
    "ടൈപ്പ്", "ടൈപ്പ് ചെയ്യാം", "ടൈപ്പ് ചെയ്യണം", "കീബോർഡ്", "എഴുതാം", "എഴുതണം",
    "taper", "je tape", "clavier", "écrire", "saisir",
  ],
  pause: [
    "रुको", "रुकिए", "रुक जाओ", "ठहरो", "ठहरिए", "एक मिनट", "एक पल", "थोड़ा रुको",
    "നിർത്തുക", "നിർത്തൂ", "കാത്തിരിക്കൂ", "ഒന്ന് നിർത്തൂ", "ഒരു നിമിഷം", "തൽക്കാലം നിർത്തൂ",
    "attends", "attendez", "un instant", "un moment", "patiente",
  ],
  help: [
    "मदद", "मदद करो", "मदद चाहिए", "सहायता", "सहायता करो", "क्या बोलूँ", "क्या कहूँ",
    "क्या कह सकता हूँ", "क्या कर सकता हूँ", "विकल्प",
    "സഹായം", "സഹായിക്കൂ", "സഹായിക്കുക", "സഹായം വേണം", "എന്ത് പറയാം",
    "എന്ത് ചെയ്യാം", "എന്ത് പറയണം", "ഓപ്ഷനുകൾ",
    "aide", "aidez-moi", "aide-moi", "à l'aide", "au secours", "que dire", "quoi dire", "options",
  ],
  spell: [
    "वर्तनी", "अक्षर से", "अक्षर दर अक्षर", "एक एक अक्षर", "स्पेल", "स्पेलिंग",
    "അക്ഷരം", "അക്ഷരമായി", "അക്ഷരം അക്ഷരമായി", "ഓരോ അക്ഷരം", "സ്പെൽ", "സ്പെല്ലിംഗ്",
    "épeler", "épelle", "épelez", "lettre par lettre", "en lettres",
  ],
  yes: [
    "haan", "हाँ", "हां", "जी", "जी हाँ", "जी हां", "सही", "सही है", "ठीक", "ठीक है",
    "बिल्कुल", "बिलकुल", "सच", "ओके", "कर दो",
    "അതെ", "ശരി", "ശരിയാണ്", "ഉവ്വ്", "അതെയതെ", "ആയിക്കോട്ടെ", "ശരിയാ", "മതി",
    "കറക്റ്റ്", "ഓകെ", "ശരി തന്നെ",
    "oui", "correct", "exact", "c'est juste", "c'est correct", "c'est ça", "tout à fait",
    "d'accord", "ouais", "valider",
  ],
  no: [
    "nahi", "नहीं", "नही", "ना", "नाहीं", "गलत", "ग़लत", "गलत है", "नहीं जी",
    "बिल्कुल नहीं", "रहने दो",
    "അല്ല", "അല്ലാ", "തെറ്റ്", "തെറ്റാണ്", "തെറ്റി", "വേണ്ട", "വേണ്ടാ", "ശരിയല്ല", "അല്ലല്ലോ",
    "non", "faux", "c'est faux", "incorrect", "pas correct", "pas ça", "ce n'est pas ça",
  ],
  home: [
    "होम", "होम पेज", "मुख्य", "मुख्य पेज", "मुख्य मेनू", "घर", "होम स्क्रीन", "शुरुआत",
    "ഹോം", "ഹോം പേജ്", "പ്രധാന താൾ", "മുഖ്യതാൾ", "പ്രധാന പേജ്", "ഹോമിലേക്ക്", "തുടക്കത്തിലേക്ക്",
    "accueil", "page d'accueil", "menu principal", "à l'accueil", "écran d'accueil",
  ],
  upload: [
    "अपलोड", "अपलोड करो", "फ़ाइल", "फ़ाइल चुनें", "फाइल अपलोड", "नया फॉर्म", "पीडीएफ",
    "അപ്‌ലോഡ്", "അപ്ലോഡ്", "അപ്‌ലോഡ് ചെയ്യുക", "ഫയൽ", "ഫയൽ തിരഞ്ഞെടുക്കുക", "പുതിയ ഫോം", "പിഡിഎഫ്",
    "télécharger", "téléverser", "importer", "fichier", "choisir un fichier", "nouveau formulaire", "pdf",
  ],
  scan: [
    "स्कैन", "स्कैन करो", "कैमरा", "फोटो", "फोटो खींचो", "तस्वीर", "कागज़", "कैमरे से",
    "സ്കാൻ", "സ്കാൻ ചെയ്യുക", "ക്യാമറ", "ഫോട്ടോ", "ഫോട്ടോ എടുക്കുക", "ചിത്രം", "കടലാസ്",
    "scanner", "scanne", "numériser", "caméra", "appareil photo", "photo", "prendre une photo",
  ],
  history: [
    "मेरे फॉर्म", "फॉर्म", "इतिहास", "हिस्ट्री", "हाल के फॉर्म", "दस्तावेज़", "मेरे दस्तावेज़", "पुराने फॉर्म",
    "എന്റെ ഫോമുകൾ", "ഫോമുകൾ", "ചരിത്രം", "രേഖകൾ", "എന്റെ രേഖകൾ", "പഴയ ഫോമുകൾ", "ഹിസ്റ്ററി",
    "mes formulaires", "formulaires", "historique", "mes documents", "documents", "anciens formulaires",
  ],
  profile: [
    "प्रोफ़ाइल", "प्रोफाइल", "सेटिंग", "सेटिंग्स", "सेटिंग्स खोलो", "मेरी जानकारी", "प्राथमिकताएं", "आवाज़ सेटिंग",
    "പ്രൊഫൈൽ", "പ്രൊഫൈൽ തുറക്കുക", "ക്രമീകരണങ്ങൾ", "സെറ്റിംഗ്സ്", "സെറ്റിംഗ്", "എന്റെ വിവരങ്ങൾ", "വോയ്സ് ക്രമീകരണം",
    "profil", "paramètres", "réglages", "mes détails", "mes informations", "préférences",
  ],
  stop: [
    "चुप", "चुप रहो", "चुप हो जाओ", "बंद करो", "बंद", "रोको", "बोलना बंद करो", "शांत",
    "മിണ്ടരുത്", "നിശ്ശബ്ദം", "സംസാരം നിർത്തൂ", "മിണ്ടാതിരിക്കൂ", "ശബ്ദം നിർത്തൂ",
    "silence", "tais-toi", "taisez-vous", "arrête de parler", "arrêtez", "chut",
  ],
  read_page: [
    "यह पेज पढ़ो", "पेज पढ़ो", "पढ़ो", "मैं कहाँ हूँ", "यह क्या है", "यहाँ क्या है", "स्क्रीन पढ़ो",
    "ഈ പേജ് വായിക്കൂ", "പേജ് വായിക്കുക", "വായിക്കൂ", "ഞാൻ എവിടെയാണ്", "ഇത് എന്താണ്", "സ്ക്രീൻ വായിക്കൂ",
    "lis cette page", "lire la page", "lis", "où suis-je", "c'est quoi", "lis l'écran",
  ],
  start: [
    "shuru", "शुरू", "शुरू करो", "शुरू करें", "शुरू करते हैं", "चलो", "चलिए", "भरना शुरू",
    "फॉर्म भरो", "तैयार", "हाँ शुरू करो",
    "തുടങ്ങുക", "തുടങ്ങാം", "തുടങ്ങൂ", "ആരംഭിക്കുക", "ആരംഭിക്കാം", "ഫോം പൂരിപ്പിക്കാം", "തയ്യാർ", "തയ്യാറാണ്",
    "commencer", "commençons", "démarrer", "démarre", "c'est parti", "allons-y", "prêt", "prête", "remplir",
  ],
  resume: [
    "फिर शुरू", "जारी रखो", "जारी रखें", "आगे बढ़ो", "चालू करो", "वापस शुरू", "चलते रहो",
    "തുടരുക", "തുടരൂ", "തുടരാം", "വീണ്ടും തുടങ്ങൂ", "തുടർന്ന് പോകൂ", "മുന്നോട്ട് പോകൂ",
    "reprendre", "reprends", "reprenez", "continuer", "continue", "continuez", "poursuivre",
  ],
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalize an utterance for keyword matching. The NFC pass is essential for
 * Indic scripts: the recognizer and our source literals can encode the same
 * Malayalam/Hindi word with different Unicode code-point sequences, which would
 * otherwise never compare equal.
 */
function normalize(utterance: string): string {
  return utterance
    .normalize("NFC")
    .toLowerCase()
    .replace(/[.,!?;:।॥]+/g, " ")
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
