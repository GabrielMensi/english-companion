import type { ErrorCategory } from "@/lib/taxonomy";

/**
 * Fine-grained error types, fixed per category. The chat never picks them: a
 * deferred classifier (src/lib/classification.ts) assigns them later, so the
 * chat prompt stays short. Every category ends with "other".
 */
export interface SubtypeInfo {
  label: string;
  /** One-line guidance for the classifier. */
  hint: string;
}

const other: SubtypeInfo = { label: "Other", hint: "doesn't fit the types above" };

export const SUBTYPES: Record<ErrorCategory, Record<string, SubtypeInfo>> = {
  verb_tense: {
    tense_choice: {
      label: "Wrong tense for the meaning",
      hint: "wrong tense for the time or meaning (I live here since 2020 → I have lived)",
    },
    future_in_time_clause: {
      label: "Future after when / if / until",
      hint: "will after when, if, as soon as, until, before (when I will arrive → when I arrive)",
    },
    sequence_of_tenses: {
      label: "Tense doesn't match the sentence",
      hint: "tense inconsistent with the rest of the sentence or reported speech (he said he is tired → he was)",
    },
    stative_continuous: {
      label: "Stative verb in continuous",
      hint: "stative verb used in a continuous tense (I am knowing → I know)",
    },
    other,
  },
  verb_form: {
    irregular_past: { label: "Irregular past", hint: "wrong past simple of an irregular verb (buyed → bought)" },
    past_participle: { label: "Past participle", hint: "wrong past participle (have wrote → have written)" },
    base_form: {
      label: "Base form after modal / do",
      hint: "verb not in base form after a modal or do/does/did (can goes, didn't went, did you went)",
    },
    auxiliary: {
      label: "Auxiliary verb",
      hint: "missing, wrong or extra auxiliary (I not like → I don't like, I am agree → I agree)",
    },
    ing_form: { label: "-ing form", hint: "continuous tense formed wrong (I am go → I am going)" },
    passive: { label: "Passive voice", hint: "passive formed wrong (was build → was built, is call → is called)" },
    other,
  },
  subject_verb_agreement: {
    third_person_s: { label: "Third person -s", hint: "missing or extra -s in the present simple (he go, they goes)" },
    be_have: { label: "Be / have agreement", hint: "wrong form of be or have (they was, he have)" },
    there_is_are: {
      label: "There is / there are",
      hint: "there is/are doesn't agree with the noun (there is many people)",
    },
    tricky_subject: {
      label: "Tricky subject",
      hint: "subject is people, everyone, a collective noun or far from the verb (people is → are, everyone are → is)",
    },
    other,
  },
  gerund_infinitive: {
    verb_plus_ing: { label: "Verb + -ing", hint: "verb that needs -ing (enjoy to read → enjoy reading)" },
    verb_plus_to: { label: "Verb + to", hint: "verb that needs to + verb (decide going → decide to go)" },
    someone_to_do: {
      label: "Want / need someone to do",
      hint: "want/need/ask someone to do (I need that you → I need you to)",
    },
    infinitive_of_purpose: { label: "Purpose: to, not for", hint: "purpose with for + verb (for buy → to buy)" },
    ing_after_preposition: {
      label: "-ing after a preposition",
      hint: "preposition followed by a base verb (before go → before going, interested in learn)",
    },
    make_let: { label: "Make / let + verb", hint: "make/let/help + base verb (make me to feel → make me feel)" },
    other,
  },
  conditionals: {
    will_in_if_clause: {
      label: "Will / would in the if-clause",
      hint: "will or would inside the if-clause (if I will have time, if I would have known)",
    },
    result_clause: { label: "Result clause", hint: "missing or wrong would/could/will in the result clause" },
    conditional_type: {
      label: "Wrong conditional type",
      hint: "real vs unreal or present vs past conditional mixed up for the meaning",
    },
    other,
  },
  modals: {
    modal_choice: { label: "Wrong modal", hint: "wrong modal for the meaning (must → have to, can → could)" },
    modal_plus_to: { label: "To after a modal", hint: "to after a modal (I can to go → I can go)" },
    past_modal: { label: "Past modals", hint: "should have / must have / could have done" },
    missing_modal: { label: "Missing modal", hint: "a modal is needed but missing" },
    other,
  },
  articles: {
    missing_a_an: { label: "Missing a / an", hint: "missing a/an with a singular countable noun (I am engineer)" },
    missing_the: { label: "Missing the", hint: "missing the for something specific or unique" },
    generic_the: {
      label: "The with general ideas",
      hint: "the with general or abstract nouns (the life is hard, I like the music)",
    },
    extra_article: { label: "Extra article", hint: "article with names, meals, languages, places that don't take one" },
    a_vs_the: { label: "A vs the", hint: "a instead of the or the other way around, or a vs an" },
    other,
  },
  prepositions: {
    dependent_preposition: {
      label: "Verb / adjective + preposition",
      hint: "preposition that goes with a verb, adjective or noun (depend of → depend on, interested on → in)",
    },
    time: { label: "Time (in / on / at)", hint: "prepositions of time and dates" },
    place_movement: {
      label: "Place and movement",
      hint: "in/on/at/to for places and movement (arrive to → arrive in)",
    },
    extra: { label: "Unnecessary preposition", hint: "preposition that shouldn't be there (discuss about, enter to)" },
    missing: { label: "Missing preposition", hint: "missing preposition (listen music → listen to music)" },
    other,
  },
  pronouns: {
    missing_subject: { label: "Missing subject", hint: "missing subject pronoun (is important → it is important)" },
    it_vs_there: { label: "It vs there", hint: "it/there confusion (it has many → there are many)" },
    his_her: {
      label: "His / her / its / their",
      hint: "possessive or pronoun gender/number confusion, often from Spanish 'su'",
    },
    relative: { label: "Relative pronouns", hint: "who/which/that/whose/what (the thing what → that)" },
    case: { label: "Subject vs object", hint: "subject vs object form (me and him went → he and I went)" },
    other,
  },
  plurals_countability: {
    uncountable_plural: {
      label: "Uncountable in plural",
      hint: "plural of an uncountable noun (informations, advices)",
    },
    plural_adjective: { label: "Adjective in plural", hint: "adjective with a plural -s (importants things)" },
    missing_plural: { label: "Missing plural", hint: "missing -s after a number or many/several (two year)" },
    irregular_plural: { label: "Irregular plural", hint: "irregular plural (childs, persons)" },
    quantifier: { label: "Quantifiers", hint: "much/many, few/little, less/fewer, a lot of" },
    other,
  },
  word_order: {
    adjective_noun: { label: "Adjective after noun", hint: "adjective after the noun (a car red)" },
    adverb_position: { label: "Adverb position", hint: "adverb in the wrong place (I always am → I am always)" },
    verb_object: {
      label: "Verb and object split",
      hint: "something between the verb and its object (I like very much coffee)",
    },
    noun_modifiers: {
      label: "Noun + noun order",
      hint: "order of nouns and modifiers, or plural modifiers (verb tenses errors → verb tense errors, Spanish native → native Spanish speaker)",
    },
    other,
  },
  question_formation: {
    missing_auxiliary: { label: "Missing do / does / did", hint: "question without its auxiliary (Where you live?)" },
    inversion: { label: "No inversion", hint: "subject and auxiliary not inverted (Where you are going?)" },
    embedded_question: {
      label: "Indirect question order",
      hint: "question order inside an indirect question (Can you tell me where is it?)",
    },
    subject_question: {
      label: "Subject question",
      hint: "extra auxiliary in a subject question (Who did call you? → Who called you?)",
    },
    other,
  },
  comparatives: {
    double_comparative: { label: "Double comparative", hint: "more + -er (more bigger)" },
    comparative_form: {
      label: "-er / more / most",
      hint: "wrong comparative or superlative form (more easy, the most big)",
    },
    than_as: { label: "Than / as", hint: "than/that/as confusion (bigger that, as big than)" },
    other,
  },
  phrasal_verbs: {
    wrong_particle: { label: "Wrong particle", hint: "wrong particle (turn of → turn off)" },
    wrong_phrasal_verb: { label: "Wrong phrasal verb", hint: "phrasal verb with a different meaning" },
    object_position: { label: "Object position", hint: "pronoun after the particle (pick up it → pick it up)" },
    other,
  },
  collocations: {
    light_verb: {
      label: "Make / do / have / take",
      hint: "wrong make/do/have/take/get/give (do a mistake, make a question)",
    },
    adjective_noun: {
      label: "Adjective + noun",
      hint: "adjective that doesn't go with the noun (strong rain → heavy rain)",
    },
    verb_noun: { label: "Verb + noun", hint: "other verb + noun combinations (say a lie → tell a lie)" },
    other,
  },
  vocabulary: {
    wrong_word: { label: "Wrong word", hint: "a word with a different meaning" },
    confused_pair: {
      label: "Commonly confused pair",
      hint: "say/tell, borrow/lend, win/earn, bring/take, remember/remind...",
    },
    word_form: { label: "Word form", hint: "right root, wrong part of speech (very success → very successful)" },
    literal_translation: {
      label: "Literal translation",
      hint: "word-for-word translation from Spanish that isn't a false friend",
    },
    other,
  },
  false_friends: {
    false_cognate: { label: "False cognate", hint: "English word that looks like a Spanish word with another meaning" },
  },
  sentence_structure: {
    spanish_calque: {
      label: "Spanish structure",
      hint: "structure copied from Spanish (I have 30 years, is necessary that)",
    },
    missing_verb: { label: "Missing verb", hint: "missing main verb or be (the app very slow)" },
    run_on: { label: "Run-on sentence", hint: "sentences joined without proper punctuation or connectors" },
    fragment: { label: "Incomplete sentence", hint: "sentence fragment" },
    other,
  },
  spelling: {
    keyboard_typo: { label: "Typo", hint: "keyboard slip in a word the learner knows" },
    spanish_influenced: {
      label: "Spanish-influenced spelling",
      hint: "spelling that resembles the Spanish word (proyect, sistem)",
    },
    double_letters: { label: "Double letters", hint: "missing or extra doubled letters (begining, adress)" },
    homophone: { label: "Sound-alike words", hint: "their/there, your/you're, its/it's, then/than" },
    word_split: {
      label: "One word or two",
      hint: "one word written as two or the other way around (brain storming, alot, every day/everyday)",
    },
    other,
  },
  punctuation: {
    apostrophe: { label: "Apostrophe", hint: "missing or wrong apostrophe" },
    question_mark: { label: "Question mark", hint: "missing question mark or Spanish ¿" },
    comma: { label: "Comma", hint: "missing or wrong comma" },
    other,
  },
  capitalization: {
    pronoun_i: { label: "Pronoun I", hint: "lowercase i" },
    proper_noun: { label: "Names, days, languages", hint: "days, months, languages, nationalities, names" },
    sentence_start: { label: "Sentence start", hint: "sentence starting in lowercase" },
    other,
  },
  register_style: {
    too_informal: { label: "Too informal", hint: "too informal for the context" },
    too_formal: { label: "Too formal", hint: "too formal or stiff for the context" },
    unnatural: { label: "Unnatural phrasing", hint: "grammatical but not how people say it" },
    other,
  },
  other: { other },
};

export function subtypeLabel(category: string, subtype: string | null): string | null {
  if (!subtype) return null;
  return SUBTYPES[category as ErrorCategory]?.[subtype]?.label ?? null;
}

export function isValidSubtype(category: ErrorCategory, subtype: string): boolean {
  return Object.hasOwn(SUBTYPES[category], subtype);
}
