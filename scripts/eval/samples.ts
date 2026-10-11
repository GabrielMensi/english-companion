/**
 * Evaluation set: sentences with known mistakes, written the way a Spanish
 * speaker typically writes them. Each expectation is checked against the
 * model's output:
 * - `fragment`: some reported error must overlap this part of the text.
 * - `fix`: the corrected text must contain this (case-insensitive), which
 *   checks the model actually fixed the meaning, not just flagged it.
 * - `typo`: the error must be classified with severity "typo".
 */
export interface Expectation {
  fragment: string;
  fix?: string;
  typo?: boolean;
}

export interface Sample {
  text: string;
  expect: Expectation[];
  /** Spanish words written between [brackets] that must be translated. */
  spanish?: string[];
}

export const SAMPLES: Sample[] = [
  {
    text: "Yesterday I have went to the park with my freinds",
    expect: [
      { fragment: "have went", fix: "I went" },
      { fragment: "freinds", fix: "friends", typo: true },
    ],
  },
  {
    text: "Actually I am working in a proyect that depends of many things, and I want to [aprovechar] the time.",
    expect: [
      { fragment: "Actually", fix: "currently" },
      { fragment: "working in", fix: "working on" },
      { fragment: "proyect", fix: "project" },
      { fragment: "depends of", fix: "depends on" },
    ],
    spanish: ["aprovechar"],
  },
  {
    text: "I need that you fix the bug in `src/app/page.tsx`, is very important because the users can not login teh app.",
    expect: [
      { fragment: "need that you", fix: "need you to" },
      { fragment: "is very important", fix: "it" },
      { fragment: "login", fix: "log in" },
      { fragment: "teh", typo: true },
    ],
  },
  {
    text: "She don't like to wake up early, she prefer sleep until late.",
    expect: [
      { fragment: "don't", fix: "doesn't" },
      { fragment: "prefer", fix: "prefers" },
    ],
  },
  {
    text: "Can you explain me how works this function? I don't understand what does it return.",
    expect: [
      { fragment: "explain me", fix: "explain" },
      { fragment: "how works", fix: "how this function works" },
      { fragment: "what does it return", fix: "what it returns" },
    ],
  },
  {
    text: "I am agree with you, the informations in the documentation are not enough clear.",
    expect: [
      { fragment: "am agree", fix: "I agree" },
      { fragment: "informations", fix: "information" },
      { fragment: "enough clear", fix: "clear enough" },
    ],
  },
  {
    text: "If I would have more time, I would learn to play the guitar.",
    expect: [{ fragment: "would have", fix: "If I had" }],
  },
  {
    text: "We discussed about the new feature during the meeting and we made a decision.",
    expect: [{ fragment: "discussed about", fix: "discussed the" }],
  },
  {
    text: "Please, remember me to push the changes before to leave the office.",
    expect: [
      { fragment: "remember me", fix: "remind me" },
      { fragment: "before to leave", fix: "before leaving" },
    ],
  },
  {
    text: "I have 25 years and I live in Buenos Aires since 2015.",
    expect: [
      { fragment: "have 25 years", fix: "25 years old" },
      { fragment: "live in Buenos Aires since", fix: "have lived" },
    ],
  },
  {
    text: "My boss said me that the project was delayed, so I'm looking forward to hear the new dates.",
    expect: [
      { fragment: "said me", fix: "told me" },
      { fragment: "to hear", fix: "to hearing" },
    ],
  },
  {
    text: "Wich is the best way for learn english? Its very dificult for me.",
    expect: [
      { fragment: "Wich", typo: true },
      { fragment: "for learn", fix: "to learn" },
      { fragment: "english", fix: "English" },
      { fragment: "Its", fix: "It's" },
      { fragment: "dificult", fix: "difficult" },
    ],
  },
  {
    text: "The meeting is in monday at 10 am, I will send you the link before.",
    expect: [{ fragment: "in monday", fix: "on Monday" }],
  },
  {
    text: "I want to [destacar] the most important points of the report.",
    expect: [],
    spanish: ["destacar"],
  },
  {
    text: "Could you review my pull request when you have a moment?",
    expect: [],
  },
  {
    text: "This is a perfectly fine sentence with no mistakes at all.",
    expect: [],
  },
];
