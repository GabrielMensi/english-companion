/**
 * Sentences for the speech-to-text fidelity eval (voice Phase 0). Each one has
 * a mistake a Spanish speaker typically makes when speaking; the learner reads
 * it aloud exactly as written, mistake included. The eval checks whether the
 * transcription keeps the mistake or "fixes" it, which would hide it from the tutor.
 */
export interface AsrSample {
  id: string;
  /** What to read aloud, mistake included. */
  text: string;
  /** The mistake as said. */
  mistake: string;
  /** What a transcriber that normalizes grammar would write instead. */
  fix: string;
}

export const ASR_SAMPLES: AsrSample[] = [
  {
    id: "have-went",
    text: "Yesterday I have went to the park with my friends.",
    mistake: "I have went",
    fix: "I went",
  },
  { id: "he-go", text: "My brother go to the gym every morning.", mistake: "brother go", fix: "brother goes" },
  { id: "she-dont", text: "She don't like working on weekends.", mistake: "she don't", fix: "she doesn't" },
  { id: "didnt-went", text: "I didn't went to the office today.", mistake: "didn't went", fix: "didn't go" },
  { id: "am-agree", text: "I am agree with your proposal.", mistake: "I am agree", fix: "I agree" },
  {
    id: "if-will",
    text: "If I will have time, I will fix the bug tonight.",
    mistake: "if I will have time",
    fix: "if I have time",
  },
  {
    id: "since-2020",
    text: "I live in this city since twenty twenty.",
    mistake: "I live in this city since",
    fix: "I have lived in this city since",
  },
  { id: "people-is", text: "The people is very friendly here.", mistake: "people is", fix: "people are" },
  {
    id: "need-that",
    text: "I need that you review my pull request.",
    mistake: "need that you review",
    fix: "need you to review",
  },
  { id: "for-buy", text: "I went to the store for buy some milk.", mistake: "for buy", fix: "to buy" },
  {
    id: "have-years",
    text: "I have thirty years and I work as a developer.",
    mistake: "I have thirty years",
    fix: "I am thirty years old",
  },
  { id: "depends-of", text: "It depends of the context of the project.", mistake: "depends of", fix: "depends on" },
  { id: "more-bigger", text: "This version is more bigger than the old one.", mistake: "more bigger", fix: "bigger" },
  {
    id: "informations",
    text: "Thanks for all the informations you sent me.",
    mistake: "informations",
    fix: "information",
  },
  {
    id: "the-life",
    text: "The life is too short to worry about small things.",
    mistake: "the life is",
    fix: "life is",
  },
  { id: "where-you-live", text: "Where you live now?", mistake: "where you live", fix: "where do you live" },
  { id: "am-engineer", text: "I am engineer at a small startup.", mistake: "I am engineer", fix: "I am an engineer" },
  { id: "can-to", text: "I can to help you with the deploy tomorrow.", mistake: "can to help", fix: "can help" },
  { id: "enjoy-to", text: "I enjoy to read before going to sleep.", mistake: "enjoy to read", fix: "enjoy reading" },
  {
    id: "is-important",
    text: "Is very important to test this feature.",
    mistake: "is very important",
    fix: "it is very important",
  },
  {
    id: "discuss-about",
    text: "We need to discuss about the new design.",
    mistake: "discuss about",
    fix: "discuss the",
  },
  {
    id: "when-will",
    text: "When I will arrive home, I will call you.",
    mistake: "when I will arrive",
    fix: "when I arrive",
  },
];
