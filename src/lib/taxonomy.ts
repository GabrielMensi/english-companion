/**
 * Fixed error taxonomy. The model must pick from these values so that the
 * dashboard can group errors consistently over time. Add new categories here
 * (and to the labels) rather than letting the model invent them.
 */
export const ERROR_CATEGORIES = [
  "verb_tense",
  "subject_verb_agreement",
  "verb_form",
  "gerund_infinitive",
  "conditionals",
  "modals",
  "articles",
  "prepositions",
  "pronouns",
  "plurals_countability",
  "word_order",
  "question_formation",
  "comparatives",
  "phrasal_verbs",
  "collocations",
  "vocabulary",
  "false_friends",
  "sentence_structure",
  "spelling",
  "punctuation",
  "capitalization",
  "register_style",
  "other",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  verb_tense: "Verb tenses",
  subject_verb_agreement: "Subject-verb agreement",
  verb_form: "Verb forms",
  gerund_infinitive: "Verb patterns (gerund / infinitive)",
  conditionals: "Conditionals",
  modals: "Modal verbs",
  articles: "Articles",
  prepositions: "Prepositions",
  pronouns: "Pronouns",
  plurals_countability: "Plurals / countability",
  word_order: "Word order",
  question_formation: "Question formation",
  comparatives: "Comparatives / superlatives",
  phrasal_verbs: "Phrasal verbs",
  collocations: "Collocations",
  vocabulary: "Vocabulary",
  false_friends: "False friends",
  sentence_structure: "Sentence structure",
  spelling: "Spelling",
  punctuation: "Punctuation",
  capitalization: "Capitalization",
  register_style: "Register / style",
  other: "Other",
};

/** One-line guidance for the model, so categories are applied consistently. */
export const CATEGORY_HINTS: Record<ErrorCategory, string> = {
  verb_tense: "wrong tense (e.g. past simple vs present perfect)",
  subject_verb_agreement: "verb doesn't agree with subject (he go → he goes)",
  verb_form:
    "wrong verb form: participles, irregular verbs, auxiliaries (I have wrote → I have written, he can goes → he can go)",
  gerund_infinitive:
    "verb patterns: gerund vs infinitive (enjoy to read → enjoy reading), want/need someone to do (I need that you → I need you to), infinitive of purpose (for buy → to buy)",
  conditionals: "if-clauses and conditional structures",
  modals: "can/could/should/must/would etc.",
  articles: "a/an/the missing, extra or wrong",
  prepositions: "wrong, missing or extra preposition",
  pronouns: "wrong or missing pronoun, including missing subject (is important → it is important)",
  plurals_countability: "plural forms, countable vs uncountable (informations)",
  word_order: "words in the wrong order (adjective placement, adverbs)",
  question_formation: "question structure, auxiliaries in questions",
  comparatives: "comparative and superlative forms",
  phrasal_verbs: "wrong or misused phrasal verb",
  collocations: "words that don't naturally go together (make a question → ask a question)",
  vocabulary: "wrong word choice not covered by other categories",
  false_friends: "Spanish-English false cognates (actually for actualmente, assist for asistir)",
  sentence_structure: "run-on sentences, fragments, calques of Spanish structure",
  spelling: "misspelled word the learner likely doesn't know how to spell",
  punctuation: "commas, periods, apostrophes, question marks",
  capitalization: "upper/lower case (I, days, languages, sentence start)",
  register_style: "too informal/formal or unnatural phrasing that is still grammatical",
  other: "anything that doesn't fit the categories above",
};

/**
 * "suggestion" is an optional improvement, not a mistake (contractions,
 * optional punctuation...). Suggestions and typos never count as mistakes in
 * the stats (typos can be opted in from Settings).
 */
export const SEVERITIES = ["suggestion", "typo", "minor", "moderate", "major"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABELS: Record<Severity, string> = {
  suggestion: "Suggestion",
  typo: "Typo",
  minor: "Minor",
  moderate: "Moderate",
  major: "Major",
};

/** Weight used by the dashboard to rank weak areas. Suggestions and typos don't count. */
export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  suggestion: 0,
  typo: 0,
  minor: 1,
  moderate: 2,
  major: 3,
};

/** Whether a correction counts as a mistake in the stats. */
export function countsAsMistake(severity: Severity, countTypos: boolean): boolean {
  if (severity === "suggestion") return false;
  return severity !== "typo" || countTypos;
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as ErrorCategory] ?? category;
}

/** Fixed list of tenses, so the dashboard can measure each one. */
export const TENSES = [
  "present_simple",
  "present_continuous",
  "past_simple",
  "past_continuous",
  "present_perfect",
  "present_perfect_continuous",
  "past_perfect",
  "past_perfect_continuous",
  "future_will",
  "future_going_to",
  "future_present_continuous",
  "future_continuous",
  "future_perfect",
  "used_to_would",
  "conditional_would",
] as const;

export type Tense = (typeof TENSES)[number];

export const TENSE_LABELS: Record<Tense, string> = {
  present_simple: "Present simple",
  present_continuous: "Present continuous",
  past_simple: "Past simple",
  past_continuous: "Past continuous",
  present_perfect: "Present perfect",
  present_perfect_continuous: "Present perfect continuous",
  past_perfect: "Past perfect",
  past_perfect_continuous: "Past perfect continuous",
  future_will: "Future with will",
  future_going_to: "Going to",
  future_present_continuous: "Present continuous for the future",
  future_continuous: "Future continuous",
  future_perfect: "Future perfect",
  used_to_would: "Used to / would (past habits)",
  conditional_would: "Would (conditional)",
};

export const TENSE_HINTS: Record<Tense, string> = {
  present_simple: "I work, he works",
  present_continuous: "I am working (now)",
  past_simple: "I worked, I went",
  past_continuous: "I was working",
  present_perfect: "I have worked, I have gone",
  present_perfect_continuous: "I have been working",
  past_perfect: "I had worked",
  past_perfect_continuous: "I had been working",
  future_will: "I will work",
  future_going_to: "I am going to work",
  future_present_continuous: "I am meeting him tomorrow (arrangements)",
  future_continuous: "I will be working",
  future_perfect: "I will have worked",
  used_to_would: "I used to work, I would play (past habits)",
  conditional_would: "I would work, I would have worked",
};

/** Categories whose mistakes are about a verb, so they get a tense. */
export const TENSE_CATEGORIES: readonly ErrorCategory[] = [
  "verb_tense",
  "verb_form",
  "subject_verb_agreement",
  "question_formation",
  "conditionals",
  "modals",
];

export function tenseLabel(tense: string | null): string | null {
  return tense ? (TENSE_LABELS[tense as Tense] ?? null) : null;
}

/**
 * Categories speech-to-text can't measure: it decides spelling, punctuation and
 * capitalization itself, and fills in short unstressed words (articles,
 * prepositions, "it", the "do" of questions, a plural -s) from context
 * (see docs/voice/VOICE.md, Phase 0). Mistakes in these categories are still shown
 * in spoken messages, but never counted in the stats.
 */
export const NOT_MEASURABLE_WHEN_SPOKEN: readonly ErrorCategory[] = [
  "articles",
  "prepositions",
  "pronouns",
  "plurals_countability",
  "question_formation",
  "spelling",
  "punctuation",
  "capitalization",
];

/** Categories that are the transcriber's decision, not the learner's: never reported for spoken messages. */
export const TRANSCRIBER_CATEGORIES: readonly ErrorCategory[] = ["spelling", "punctuation", "capitalization"];

export function isMeasurable(category: ErrorCategory, inputMode: "typed" | "spoken"): boolean {
  return inputMode === "typed" || !NOT_MEASURABLE_WHEN_SPOKEN.includes(category);
}

/** Whether the learner discarded a correction as wrong: it's kept, but never counted anywhere. */
export function isDiscarded(c: { discardedAt: Date | number | null }): boolean {
  return c.discardedAt !== null;
}

/**
 * Whether a mistake counts in the stats: a real mistake, not discarded by the
 * learner, in a category its input mode can measure. `discardedAt` is required
 * so every query that feeds a statistic has to select it.
 */
export function countsInStats(
  c: { severity: Severity; category: ErrorCategory; inputMode: "typed" | "spoken"; discardedAt: Date | number | null },
  countTypos: boolean,
): boolean {
  return !isDiscarded(c) && countsAsMistake(c.severity, countTypos) && isMeasurable(c.category, c.inputMode);
}

/**
 * Fixed pronunciation taxonomy, for Spanish speakers (see docs/voice/VOICE.md, Phase 3).
 * Assigned by rules from read-aloud attempts (`src/lib/pronunciation-core.ts`),
 * never by a model. Apart from the beta ones below, only sounds a transcript can reveal
 * are here: word stress and schwa reduction don't change which word speech-to-text hears
 * (schwa is found from the audio by `src/lib/phonemes-core.ts`).
 */
export const PRONUNCIATION_CATEGORIES = [
  "vowel_length",
  "vowel_quality",
  "th_sounds",
  "b_v",
  "h_j_sounds",
  "initial_s_cluster",
  "final_consonants",
  "schwa_reduction",
  "other",
] as const;

export type PronunciationCategory = (typeof PRONUNCIATION_CATEGORIES)[number];

/**
 * Categories in beta: found from the audio (docs/voice/PRONUNCIATION_AUDIO.md), shown on the attempt
 * as a hint, but never saved as issues, never counted in stats and with no practice sentences until
 * the real-recordings eval (#136) validates them. `summarizePronunciation` also ignores them.
 */
export const BETA_PRONUNCIATION_CATEGORIES: readonly PronunciationCategory[] = ["schwa_reduction"];

export const isBetaPronunciation = (category: PronunciationCategory): boolean =>
  BETA_PRONUNCIATION_CATEGORIES.includes(category);

/** Categories that are saved, counted and practiced. */
export const STABLE_PRONUNCIATION_CATEGORIES = PRONUNCIATION_CATEGORIES.filter((c) => !isBetaPronunciation(c));

export const PRONUNCIATION_LABELS: Record<PronunciationCategory, string> = {
  vowel_length: "Long and short vowels",
  vowel_quality: "Vowel sounds",
  th_sounds: "Th sounds",
  b_v: "B and V",
  h_j_sounds: "H, Y and J",
  initial_s_cluster: "S at the start (st-, sp-)",
  final_consonants: "Final consonants (-ed, -s)",
  schwa_reduction: "Weak vowels (schwa)",
  other: "Other",
};

/** How to fix each sound, in the explanation language. */
export const PRONUNCIATION_TIPS: Record<PronunciationCategory, Record<"es" | "en", string>> = {
  vowel_length: {
    es: "La /iː/ de sheep es larga y tensa, con los labios estirados como al sonreír; la /ɪ/ de ship es corta y relajada, entre una i y una e. Lo mismo con /uː/ (fool) y /ʊ/ (full).",
    en: "The /iː/ in sheep is long and tense, lips spread as in a smile; the /ɪ/ in ship is short and relaxed, between an i and an e. The same goes for /uː/ (fool) and /ʊ/ (full).",
  },
  vowel_quality: {
    es: "El inglés tiene muchas más vocales que el español. La /ʌ/ de bug es una a corta con la boca poco abierta; la /æ/ de cat, una a con la boca bien abierta hacia los costados; la /ɔ/ de call, una o abierta y larga.",
    en: "English has many more vowels than Spanish. The /ʌ/ in bug is a short a with the mouth barely open; the /æ/ in cat is an a with the mouth wide open to the sides; the /ɔ/ in call is an open, long o.",
  },
  th_sounds: {
    es: "Poné la punta de la lengua entre los dientes y soplá: sin voz para think (/θ/, como la z de España), con voz para this (/ð/). No es t, d ni s.",
    en: "Put the tip of your tongue between your teeth and blow: voiceless for think (/θ/), voiced for this (/ð/). It isn't a t, a d or an s.",
  },
  b_v: {
    es: "En inglés la v no es una b: apoyá los dientes de arriba sobre el labio de abajo y hacé vibrar (very, vote). La b se hace con los dos labios (berry, boat).",
    en: "In English, v isn't b: rest your top teeth on your bottom lip and let it buzz (very, vote). B is made with both lips (berry, boat).",
  },
  h_j_sounds: {
    es: "La h inglesa es solo aire, suave, sin la fricción de la jota (hello, hate). No la saques: hate no es ate. La y de yes es una i rápida, no una ll ni una j (yes, no jess).",
    en: "The English h is just a soft breath, without the friction of the Spanish j (hello, hate). Don't drop it: hate isn't ate. The y in yes is a quick i, not a j (yes, not jess).",
  },
  initial_s_cluster: {
    es: "No agregues una e antes de s + consonante: student, no estudent; speak, no espeak. Empezá con una s larga (ssstudent) y pasá directo a la consonante.",
    en: "Don't add an e before s + consonant: student, not estudent; speak, not espeak. Start with a long s (ssstudent) and go straight into the consonant.",
  },
  final_consonants: {
    es: "Pronunciá la consonante final: worked termina en /t/ (workt), wanted en /ɪd/, cats en /s/. En español casi ninguna palabra termina así, por eso se pierde o se cambia (bed / bet).",
    en: "Say the final consonant: worked ends in /t/ (workt), wanted in /ɪd/, cats in /s/. Few Spanish words end like this, so it gets dropped or changed (bed / bet).",
  },
  schwa_reduction: {
    es: "En inglés las sílabas sin acento y las palabras cortas (to, of, and, for, a) se debilitan: la vocal pasa a una /ə/ muy corta y relajada, la boca casi no se mueve. Decí banana como bə-NA-nə y to como /tə/, no /tuː/. En español cada vocal suena plena; acá la clave es acentuar una sílaba fuerte y aflojar las demás.",
    en: "Unstressed syllables and short words (to, of, and, for, a) get weak in English: the vowel becomes a very short, relaxed /ə/, with the mouth barely moving. Say banana as bə-NA-nə and to as /tə/, not /tuː/. In Spanish every vowel stays full; here the trick is one strong syllable and the others relaxed.",
  },
  other: {
    es: "Se escuchó otra palabra. Escuchá la oración, repetila más despacio y fijate en qué sonido cambia.",
    en: "A different word was heard. Listen to the sentence, say it more slowly and notice which sound changes.",
  },
};
