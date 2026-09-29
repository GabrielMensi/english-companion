/**
 * Classification evaluation set: mistakes already detected (as the chat would
 * report them) with the expected fine type and, for verb mistakes, tenses.
 * `tenseUsed: null` means the tense was right and the form was wrong.
 */
import type { ErrorCategory, Tense } from "../../src/lib/taxonomy";

export interface ClassifySample {
  message: string;
  original: string;
  correction: string;
  category: ErrorCategory;
  subtype: string;
  tense?: Tense | null;
  tenseUsed?: Tense | null;
}

export const CLASSIFY_SAMPLES: ClassifySample[] = [
  // verb_tense
  { message: "I live here since 2020.", original: "I live", correction: "I have lived", category: "verb_tense", subtype: "tense_choice", tense: "present_perfect", tenseUsed: "present_simple" },
  { message: "Yesterday I have seen a great movie.", original: "I have seen", correction: "I saw", category: "verb_tense", subtype: "tense_choice", tense: "past_simple", tenseUsed: "present_perfect" },
  { message: "When I will arrive home, I call you.", original: "When I will arrive", correction: "When I arrive", category: "verb_tense", subtype: "future_in_time_clause", tense: "present_simple", tenseUsed: "future_will" },
  { message: "I am knowing the answer to that question.", original: "I am knowing", correction: "I know", category: "verb_tense", subtype: "stative_continuous", tense: "present_simple", tenseUsed: "present_continuous" },
  { message: "He told me that he is very tired after the trip.", original: "he is very tired", correction: "he was very tired", category: "verb_tense", subtype: "sequence_of_tenses", tense: "past_simple", tenseUsed: "present_simple" },
  { message: "I work on this project for three months and it's almost done.", original: "I work on this project for three months", correction: "I have been working on this project for three months", category: "verb_tense", subtype: "tense_choice", tense: "present_perfect_continuous", tenseUsed: "present_simple" },
  { message: "When I arrived, the meeting already started.", original: "already started", correction: "had already started", category: "verb_tense", subtype: "tense_choice", tense: "past_perfect", tenseUsed: "past_simple" },
  { message: "I was reading when she was calling me.", original: "she was calling", correction: "she called", category: "verb_tense", subtype: "tense_choice", tense: "past_simple", tenseUsed: "past_continuous" },
  // verb_form
  { message: "I have wrote the tests for the new endpoint.", original: "have wrote", correction: "have written", category: "verb_form", subtype: "past_participle", tense: "present_perfect", tenseUsed: null },
  { message: "Yesterday I buyed a new keyboard.", original: "buyed", correction: "bought", category: "verb_form", subtype: "irregular_past", tense: "past_simple", tenseUsed: null },
  { message: "I didn't went to the office today.", original: "didn't went", correction: "didn't go", category: "verb_form", subtype: "base_form", tense: "past_simple", tenseUsed: null },
  { message: "I am agree with your proposal.", original: "I am agree", correction: "I agree", category: "verb_form", subtype: "auxiliary", tense: "present_simple", tenseUsed: null },
  { message: "The bridge was build in 1990.", original: "was build", correction: "was built", category: "verb_form", subtype: "passive", tense: "past_simple", tenseUsed: null },
  // subject_verb_agreement
  { message: "My brother work in a bank.", original: "My brother work", correction: "My brother works", category: "subject_verb_agreement", subtype: "third_person_s", tense: "present_simple", tenseUsed: null },
  { message: "There is many people in the room.", original: "There is many people", correction: "There are many people", category: "subject_verb_agreement", subtype: "there_is_are", tense: "present_simple", tenseUsed: null },
  { message: "The people is very friendly here.", original: "people is", correction: "people are", category: "subject_verb_agreement", subtype: "tricky_subject", tense: "present_simple", tenseUsed: null },
  // conditionals and modals
  { message: "If I will have time, I will fix it.", original: "If I will have time", correction: "If I have time", category: "conditionals", subtype: "will_in_if_clause", tense: "present_simple", tenseUsed: "future_will" },
  { message: "I can to help you tomorrow.", original: "can to help", correction: "can help", category: "modals", subtype: "modal_plus_to" },
  // question_formation
  { message: "Where you live now?", original: "Where you live", correction: "Where do you live", category: "question_formation", subtype: "missing_auxiliary", tense: "present_simple", tenseUsed: null },
  { message: "Can you tell me where is the station?", original: "where is the station", correction: "where the station is", category: "question_formation", subtype: "embedded_question" },
  // gerund_infinitive
  { message: "I enjoy to read before sleeping.", original: "enjoy to read", correction: "enjoy reading", category: "gerund_infinitive", subtype: "verb_plus_ing" },
  { message: "I need that you review my PR.", original: "I need that you review", correction: "I need you to review", category: "gerund_infinitive", subtype: "someone_to_do" },
  { message: "I went to the store for buy milk.", original: "for buy", correction: "to buy", category: "gerund_infinitive", subtype: "infinitive_of_purpose" },
  // articles
  { message: "I am engineer at a startup.", original: "I am engineer", correction: "I am an engineer", category: "articles", subtype: "missing_a_an" },
  { message: "The life is too short to worry.", original: "The life", correction: "Life", category: "articles", subtype: "generic_the" },
  // prepositions
  { message: "It depends of the context.", original: "depends of", correction: "depends on", category: "prepositions", subtype: "dependent_preposition" },
  { message: "We have a meeting in Monday.", original: "in Monday", correction: "on Monday", category: "prepositions", subtype: "time" },
  { message: "Let's discuss about the new design.", original: "discuss about", correction: "discuss", category: "prepositions", subtype: "extra" },
  { message: "I like to listen music while I code.", original: "listen music", correction: "listen to music", category: "prepositions", subtype: "missing" },
  // pronouns, plurals, word order
  { message: "Is very important to test this.", original: "Is very important", correction: "It is very important", category: "pronouns", subtype: "missing_subject" },
  { message: "My sister lost his phone yesterday.", original: "his phone", correction: "her phone", category: "pronouns", subtype: "his_her" },
  { message: "Thanks for the informations.", original: "informations", correction: "information", category: "plurals_countability", subtype: "uncountable_plural" },
  { message: "They are importants things.", original: "importants things", correction: "important things", category: "plurals_countability", subtype: "plural_adjective" },
  { message: "I like very much this song.", original: "I like very much this song", correction: "I like this song very much", category: "word_order", subtype: "verb_object" },
  // collocations, vocabulary, structure, spelling
  { message: "I did a mistake in the config.", original: "did a mistake", correction: "made a mistake", category: "collocations", subtype: "light_verb" },
  { message: "Can you borrow me your charger?", original: "borrow me", correction: "lend me", category: "vocabulary", subtype: "confused_pair" },
  { message: "I have 30 years.", original: "I have 30 years", correction: "I am 30 years old", category: "sentence_structure", subtype: "spanish_calque" },
  { message: "The proyect is almost ready.", original: "proyect", correction: "project", category: "spelling", subtype: "spanish_influenced" },
  // Harder cases: none of these appear in the type hints.
  { message: "Since I was a child I always wanted to visit Japan, and finally I booked the tickets.", original: "I always wanted", correction: "I have always wanted", category: "verb_tense", subtype: "tense_choice", tense: "present_perfect", tenseUsed: "past_simple" },
  { message: "By the time you read this, I will finish the migration.", original: "I will finish", correction: "I will have finished", category: "verb_tense", subtype: "tense_choice", tense: "future_perfect", tenseUsed: "future_will" },
  { message: "As soon as the build will pass, we deploy.", original: "the build will pass", correction: "the build passes", category: "verb_tense", subtype: "future_in_time_clause", tense: "present_simple", tenseUsed: "future_will" },
  { message: "When I was young I was playing football every Saturday.", original: "I was playing football every Saturday", correction: "I used to play football every Saturday", category: "verb_tense", subtype: "tense_choice", tense: "used_to_would", tenseUsed: "past_continuous" },
  { message: "Did she finished the report?", original: "Did she finished", correction: "Did she finish", category: "verb_form", subtype: "base_form", tense: "past_simple", tenseUsed: null },
  { message: "The server is crash every night.", original: "is crash", correction: "is crashing", category: "verb_form", subtype: "ing_form", tense: "present_continuous", tenseUsed: null },
  { message: "Everybody in my team have a laptop.", original: "Everybody in my team have", correction: "Everybody in my team has", category: "subject_verb_agreement", subtype: "tricky_subject", tense: "present_simple", tenseUsed: null },
  { message: "If I would know the answer, I would tell you.", original: "If I would know", correction: "If I knew", category: "conditionals", subtype: "will_in_if_clause", tense: "past_simple", tenseUsed: "conditional_would" },
  { message: "You must to restart the service.", original: "must to restart", correction: "must restart", category: "modals", subtype: "modal_plus_to" },
  { message: "Who did send you this link?", original: "Who did send", correction: "Who sent", category: "question_formation", subtype: "subject_question", tense: "past_simple", tenseUsed: null },
  { message: "I'm thinking about change my job.", original: "about change", correction: "about changing", category: "gerund_infinitive", subtype: "ing_after_preposition" },
  { message: "We arrived to Madrid at night.", original: "arrived to Madrid", correction: "arrived in Madrid", category: "prepositions", subtype: "place_movement" },
  { message: "I prefer the coffee without sugar in general.", original: "the coffee", correction: "coffee", category: "articles", subtype: "generic_the" },
  { message: "There were less errors than yesterday.", original: "less errors", correction: "fewer errors", category: "plurals_countability", subtype: "quantifier" },
  { message: "She speaks very well English.", original: "speaks very well English", correction: "speaks English very well", category: "word_order", subtype: "verb_object" },
  { message: "Please remember me to call the client.", original: "remember me", correction: "remind me", category: "vocabulary", subtype: "confused_pair" },
  { message: "It was a very success launch.", original: "very success", correction: "very successful", category: "vocabulary", subtype: "word_form" },
  { message: "We had a strong discussion but we agreed at the end.", original: "strong discussion", correction: "heated discussion", category: "collocations", subtype: "adjective_noun" },
];
