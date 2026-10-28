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
  /** Fragments the learner discarded as wrong: no reported error may overlap them (see export-discards). */
  forbidden?: string[];
  /** Defaults to typed. */
  inputMode?: "typed" | "spoken";
}

/** A sample from a topic or role-play chat: the learner answers the tutor's opening question. */
export interface TopicSample extends Sample {
  /** Id of a preset in `src/lib/topics.ts`; its rule and an opening question go with the message. */
  topic: string;
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

/**
 * Messages from topic and role-play chats (conversation mode with the preset's reply rule), written
 * the way a Spanish speaker answers an interviewer, a teammate or a stranger. Synthetic.
 * `pnpm eval:models <spec> --topics` runs them; `--topics-plain` runs the same messages in a plain
 * conversation chat, to compare.
 */
export const TOPIC_SAMPLES: TopicSample[] = [
  {
    topic: "swe-interview",
    text: "I have five years of experience working like backend developer, and I am specialized in build APIs.",
    expect: [
      { fragment: "working like", fix: "working as" },
      { fragment: "specialized in build", fix: "building" },
    ],
  },
  {
    topic: "swe-interview",
    text: "In my last job I led a small team and we deployed the new billing service without downtime.",
    expect: [],
  },
  {
    topic: "technical-interview",
    text: "I will use a cache for the most visited links, because the reads are much more than the writes.",
    expect: [{ fragment: "much more than", fix: "far outnumber" }],
  },
  {
    topic: "standup",
    text: "Yesterday I finished the login page and today I am going to fix the bugs that the QA team found.",
    expect: [],
  },
  {
    topic: "standup",
    text: "Yesterday I have worked in the migration, but I am blocked because the staging server is down since monday.",
    expect: [
      { fragment: "have worked", fix: "worked" },
      { fragment: "worked in", fix: "worked on" },
      { fragment: "since monday", fix: "since Monday" },
    ],
  },
  {
    topic: "travel-small-talk",
    text: "I am here for holidays, I arrived two days ago and I am staying in a hostel near of the beach.",
    expect: [
      { fragment: "for holidays", fix: "on holiday" },
      { fragment: "near of", fix: "near the" },
    ],
  },
  {
    topic: "travel-small-talk",
    text: "No, it is my first time here! Do you know any good restaurant for try the local food?",
    expect: [
      { fragment: "any good restaurant", fix: "restaurants" },
      { fragment: "for try", fix: "to try" },
    ],
  },
  {
    topic: "tech-news",
    text: "I think AI tools are very useful, but sometimes they give you answers that sounds correct and are wrong.",
    expect: [{ fragment: "answers that sounds", fix: "that sound" }],
  },
];
