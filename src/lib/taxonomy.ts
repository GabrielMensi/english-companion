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
  verb_tense: "Tiempos verbales",
  subject_verb_agreement: "Concordancia sujeto-verbo",
  verb_form: "Forma del verbo",
  gerund_infinitive: "Patrones verbales (gerundio / infinitivo)",
  conditionals: "Condicionales",
  modals: "Verbos modales",
  articles: "Artículos",
  prepositions: "Preposiciones",
  pronouns: "Pronombres",
  plurals_countability: "Plurales / contables",
  word_order: "Orden de palabras",
  question_formation: "Formación de preguntas",
  comparatives: "Comparativos / superlativos",
  phrasal_verbs: "Phrasal verbs",
  collocations: "Collocations",
  vocabulary: "Vocabulario",
  false_friends: "Falsos amigos",
  sentence_structure: "Estructura de la oración",
  spelling: "Ortografía",
  punctuation: "Puntuación",
  capitalization: "Mayúsculas",
  register_style: "Registro / estilo",
  other: "Otros",
};

/** One-line guidance for the model, so categories are applied consistently. */
export const CATEGORY_HINTS: Record<ErrorCategory, string> = {
  verb_tense: "wrong tense (e.g. past simple vs present perfect)",
  subject_verb_agreement: "verb doesn't agree with subject (he go → he goes)",
  verb_form: "wrong verb form: participles, irregular verbs, auxiliaries (I have wrote → I have written, he can goes → he can go)",
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

export const SEVERITIES = ["typo", "minor", "moderate", "major"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABELS: Record<Severity, string> = {
  typo: "Typo",
  minor: "Leve",
  moderate: "Moderado",
  major: "Grave",
};

/** Weight used by the dashboard to rank weak areas. Typos don't count. */
export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  typo: 0,
  minor: 1,
  moderate: 2,
  major: 3,
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as ErrorCategory] ?? category;
}
