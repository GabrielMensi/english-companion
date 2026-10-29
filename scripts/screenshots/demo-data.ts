/**
 * Invented data for the README screenshots: a Spanish-speaking developer practicing English for five weeks.
 * Built as an export file (Settings > Your data) and imported through the app's own import, so it goes
 * through the same validation as a real file. Dates are relative to now, so "this week" and the charts
 * always have something to show. Nothing here comes from a real account.
 */
import { EXPORT_FORMAT, EXPORT_VERSION, type ExportFile, type Row } from "@/lib/data-transfer-core";
import { mistakeKey } from "@/lib/flashcards-core";
import { wordKey } from "@/lib/vocabulary-core";

const DAY = 24 * 60 * 60 * 1000;

/** [original, correction, category, subtype, severity, explanation, tense needed, tense used] */
type Mistake = [string, string, string, string, string, string, string?, string?];

interface DemoMessage {
  text: string;
  corrected: string;
  natural?: string;
  mistakes: Mistake[];
  vocabulary?: [string, string[], string?][];
  spoken?: boolean;
}

const M = {
  since: [
    "I work here since 2021",
    "I have worked here since 2021",
    "verb_tense",
    "tense_choice",
    "major",
    "With 'since' and an action that is still true, use the present perfect.",
    "present_perfect",
    "present_simple",
  ],
  dependOf: [
    "depends of",
    "depends on",
    "prepositions",
    "dependent_preposition",
    "moderate",
    "'Depend' goes with 'on', not 'of'.",
  ],
  informations: [
    "informations",
    "information",
    "plurals_countability",
    "uncountable_plural",
    "moderate",
    "'Information' is uncountable: it has no plural.",
  ],
  engineer: [
    "I am engineer",
    "I am an engineer",
    "articles",
    "missing_a_an",
    "moderate",
    "Jobs take 'a' or 'an' in English.",
  ],
  enjoyTo: [
    "enjoy to work",
    "enjoy working",
    "gerund_infinitive",
    "verb_plus_ing",
    "moderate",
    "'Enjoy' is followed by -ing.",
  ],
  doMistake: [
    "do a mistake",
    "make a mistake",
    "collocations",
    "light_verb",
    "moderate",
    "In English you 'make' a mistake.",
  ],
  actually: [
    "Actually I live in Córdoba",
    "Currently I live in Córdoba",
    "false_friends",
    "false_cognate",
    "major",
    "'Actually' means 'en realidad'. 'Actualmente' is 'currently'.",
  ],
  buyed: [
    "buyed",
    "bought",
    "verb_form",
    "irregular_past",
    "moderate",
    "'Buy' is irregular: buy, bought, bought.",
    "past_simple",
  ],
  heGo: [
    "he go",
    "he goes",
    "subject_verb_agreement",
    "third_person_s",
    "moderate",
    "Third person singular in the present simple needs -s.",
    "present_simple",
  ],
  yesterdayHave: [
    "Yesterday I have finished",
    "Yesterday I finished",
    "verb_tense",
    "tense_choice",
    "major",
    "With a finished time like 'yesterday', use the past simple.",
    "past_simple",
    "present_perfect",
  ],
  isNecessary: [
    "is necessary that we test",
    "we need to test",
    "sentence_structure",
    "spanish_calque",
    "moderate",
    "This structure comes from Spanish ('es necesario que'). 'We need to' sounds natural.",
  ],
  explainMe: [
    "explain me",
    "explain to me",
    "prepositions",
    "dependent_preposition",
    "moderate",
    "You explain something 'to' someone.",
  ],
  whenWill: [
    "when the release will be ready",
    "when the release is ready",
    "verb_tense",
    "future_in_time_clause",
    "moderate",
    "After 'when' about the future, use the present simple.",
    "present_simple",
    "future_will",
  ],
  teh: ["teh", "the", "spelling", "other", "typo", "Typo."],
  peoples: ["peoples", "people", "plurals_countability", "irregular_plural", "moderate", "'People' is already plural."],
  discussAbout: [
    "discuss about",
    "discuss",
    "prepositions",
    "dependent_preposition",
    "moderate",
    "'Discuss' takes a direct object: no 'about'.",
  ],
} satisfies Record<string, Mistake>;

/** Oldest first: earlier messages have more mistakes, so the trend goes down. */
const MESSAGES: DemoMessage[] = [
  {
    text: "Hi! My name is Lucas. I am engineer and Actually I live in Córdoba. I work here since 2021 and I enjoy to work with my team, but sometimes I do a mistake when I write emails.",
    corrected:
      "Hi! My name is Lucas. I am an engineer and Currently I live in Córdoba. I have worked here since 2021 and I enjoy working with my team, but sometimes I make a mistake when I write emails.",
    mistakes: [M.engineer, M.actually, M.since, M.enjoyTo, M.doMistake],
  },
  {
    text: "The deploy depends of the tests. Yesterday I have finished the migration and I buyed a new monitor for teh office.",
    corrected:
      "The deploy depends on the tests. Yesterday I finished the migration and I bought a new monitor for the office.",
    mistakes: [M.dependOf, M.yesterdayHave, M.buyed, M.teh],
  },
  {
    text: "My manager asked for more informations about the bug. I think is necessary that we test it again before the release.",
    corrected:
      "My manager asked for more information about the bug. I think we need to test it again before the release.",
    mistakes: [M.informations, M.isNecessary],
    vocabulary: [["reproducir el error", ["reproduce the bug", "reproduce the issue"]]],
  },
  {
    text: "Can you explain me how the cache works? The peoples in my team discuss about it every week.",
    corrected: "Can you explain to me how the cache works? The people in my team discuss it every week.",
    mistakes: [M.explainMe, M.peoples, M.discussAbout],
  },
  {
    text: "I will tell you when the release will be ready. The QA team depends of us for the demo.",
    corrected: "I will tell you when the release is ready. The QA team depends on us for the demo.",
    mistakes: [M.whenWill, M.dependOf],
    spoken: true,
  },
  {
    text: "My brother he go to the gym every morning and then he works from home.",
    corrected: "My brother goes to the gym every morning and then he works from home.",
    mistakes: [M.heGo],
    spoken: true,
  },
  {
    text: "Last weekend I visited my parents. We cooked together and watched an old movie. It was really nice.",
    corrected: "Last weekend I visited my parents. We cooked together and watched an old movie. It was really nice.",
    mistakes: [],
  },
  {
    text: "I need more informations to [estimar] the task, it depends of the API limits.",
    corrected: "I need more information to estimate the task, it depends on the API limits.",
    mistakes: [M.informations, M.dependOf],
    vocabulary: [["estimar", ["estimate", "size"], "In agile teams, 'size' is also common."]],
  },
  {
    text: "I have been learning English for two years and I want to [aprovechar] every meeting to practice.",
    corrected: "I have been learning English for two years and I want to make the most of every meeting to practice.",
    mistakes: [],
    vocabulary: [["aprovechar", ["make the most of", "take advantage of"]]],
  },
  {
    text: "Today we released the new version. Everything went well and the client was happy with the results.",
    corrected: "Today we released the new version. Everything went well and the client was happy with the results.",
    mistakes: [],
  },
  {
    text: "Yesterday I have finished the documentation and I sent it to my lead.",
    corrected: "Yesterday I finished the documentation and I sent it to my lead.",
    mistakes: [M.yesterdayHave],
  },
  {
    text: "I'm going to present the project on Friday. I'm a bit nervous but I've practiced a lot.",
    corrected: "I'm going to present the project on Friday. I'm a bit nervous but I've practiced a lot.",
    mistakes: [],
    spoken: true,
  },
];

/** The chat the README shows: recent, with several kinds of mistakes, a suggestion and a native version. */
const SHOWCASE: DemoMessage = {
  text: "Last week I have started a new project at work. It depends of an external API, so I am reading the documentation every day. My lead asked me for more informations about the deadline, but I didn't know how to [plantear] the problem.",
  corrected:
    "Last week I started a new project at work. It depends on an external API, so I am reading the documentation every day. My lead asked me for more information about the deadline, but I didn't know how to raise the problem.",
  natural:
    "Last week I started a new project at work. It relies on an external API, so I've been reading the docs every day. My lead asked me for more details about the deadline, but I didn't know how to bring up the problem.",
  mistakes: [
    [
      "Last week I have started",
      "Last week I started",
      "verb_tense",
      "tense_choice",
      "major",
      "'Last week' is a finished time, so use the past simple, not the present perfect.",
      "past_simple",
      "present_perfect",
    ],
    M.dependOf,
    M.informations,
    [
      "I am reading the documentation every day",
      "I've been reading the documentation every day",
      "verb_tense",
      "tense_choice",
      "suggestion",
      "For something that started in the past and continues, the present perfect continuous sounds more natural.",
    ],
  ],
  vocabulary: [["plantear", ["raise", "bring up"], "'Raise a problem' is formal; 'bring up' is everyday English."]],
};

const CONVERSATION: { user: DemoMessage; reply: string }[] = [
  {
    user: {
      text: "I want to practice for my job interview next week. It's for a backend position.",
      corrected: "I want to practice for my job interview next week. It's for a backend position.",
      mistakes: [],
    },
    reply:
      "Great, let's practice! Tell me about a project you're proud of. What was your role, and what did you learn?",
  },
  {
    user: {
      text: "I'm proud of a payments service. I lead the migration last year and we reduce the errors a lot.",
      corrected: "I'm proud of a payments service. I led the migration last year and we reduced the errors a lot.",
      mistakes: [
        [
          "I lead",
          "I led",
          "verb_form",
          "irregular_past",
          "moderate",
          "'Lead' is irregular: lead, led, led.",
          "past_simple",
        ],
        [
          "we reduce",
          "we reduced",
          "verb_tense",
          "tense_choice",
          "major",
          "'Last year' is in the past: use the past simple.",
          "past_simple",
          "present_simple",
        ],
      ],
    },
    reply:
      "Impressive! Reducing errors is a strong result. How did you measure it, and what was the hardest part of the migration?",
  },
];

let counter = 0;
const id = (prefix: string) => `demo-${prefix}-${String(++counter).padStart(4, "0")}`;
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

export function buildDemoExport(now = Date.now()): ExportFile {
  counter = 0;
  const data: ExportFile["data"] = {
    sessions: [],
    classSessions: [],
    messages: [],
    corrections: [],
    vocabulary: [],
    reviews: [],
    missedExercises: [],
    reviewLog: [],
    readAloudAttempts: [],
    pronunciationIssues: [],
  };
  const settings: Record<string, unknown> = { app: { explanationLanguage: "en", provider: "gemini" } };

  function addSession(title: string, mode: string, at: number) {
    const sessionId = id("chat");
    data.sessions.push({ id: sessionId, title, mode, createdAt: at, updatedAt: at });
    return sessionId;
  }

  function addMessage(sessionId: string, message: DemoMessage, at: number, extra: Row = {}) {
    const messageId = id("msg");
    data.messages.push({
      id: messageId,
      sessionId,
      role: "user",
      content: message.text,
      status: "done",
      correctedText: message.corrected,
      naturalText: message.natural ?? null,
      wordCount: words(message.corrected.replace(/\[|\]/g, "")),
      provider: "gemini",
      model: "gemini-flash-lite-latest",
      durationMs: 1800 + (counter % 7) * 130,
      inputMode: message.spoken ? "spoken" : "typed",
      transcriptRaw: message.spoken ? message.text : null,
      transcriptEdited: message.spoken ? false : null,
      transcriptionProvider: message.spoken ? "groq" : null,
      transcriptionModel: message.spoken ? "whisper-large-v3-turbo" : null,
      audioDurationMs: message.spoken ? words(message.text) * 420 : null,
      createdAt: at,
      ...extra,
    });
    for (const [original, correction, category, subtype, severity, explanation, tense, tenseUsed] of message.mistakes) {
      data.corrections.push({
        id: id("fix"),
        messageId,
        original,
        correction,
        category,
        subcategory: subtype,
        severity,
        explanation,
        subtype,
        tense: tense ?? null,
        tenseUsed: tenseUsed ?? null,
        classification: "done",
        classifiedBy: "gemini:gemini-flash-lite-latest",
        classificationAttempts: 1,
        source: extra.source === "class" ? "class" : "ai",
        createdAt: at,
      });
    }
    for (const [spanish, english, note] of message.vocabulary ?? []) {
      data.vocabulary.push({ id: id("voc"), messageId, spanish, english, note: note ?? null, createdAt: at });
    }
    return messageId;
  }

  // Five weeks of practice: one or two messages every few days, in a handful of chats.
  const titles = ["About me", "Work updates", "Bug report email", "Team meeting notes", "Weekend", "Sprint planning"];
  let sessionId = "";
  // Messages without mistakes share a day with another one, so the progress line goes down instead of hitting 0.
  const DAYS_AGO = [34, 31, 28, 25, 22, 18, 18, 14, 14, 14, 6, 6];
  MESSAGES.forEach((message, i) => {
    const at = now - DAYS_AGO[i] * DAY + (10 + i) * 60 * 60 * 1000;
    if (i % 2 === 0) sessionId = addSession(titles[(i / 2) % titles.length], "correction", at);
    addMessage(sessionId, message, at);
  });

  // A conversation with replies.
  const conversationAt = now - 2 * DAY;
  const conversation = addSession("Job interview practice", "conversation", conversationAt);
  CONVERSATION.forEach(({ user, reply }, i) => {
    const at = conversationAt + i * 5 * 60 * 1000;
    const userId = addMessage(conversation, user, at);
    data.messages.push({
      id: id("msg"),
      sessionId: conversation,
      role: "assistant",
      replyToId: userId,
      content: reply,
      status: "done",
      wordCount: 0,
      provider: "gemini",
      model: "gemini-flash-lite-latest",
      inputMode: "typed",
      createdAt: at + 1000,
    });
  });

  // The showcase chat, newest.
  const showcaseAt = now - 60 * 60 * 1000;
  addMessage(addSession("New project at work", "correction", showcaseAt), SHOWCASE, showcaseAt);

  // A class with the teacher ten days ago, with what the teacher corrected.
  const classAt = now - 10 * DAY;
  const classChat = addSession("Class", "class", classAt);
  data.classSessions.push({
    id: id("class"),
    heldAt: classAt,
    teacherLevel: "B1",
    notes: "Talked about my weekend and work. Review irregular verbs and 'since / for'.",
    chatSessionId: classChat,
    createdAt: classAt,
  });
  addMessage(
    classChat,
    {
      text: "I have went → I went\nI'm agree → I agree\nNew word: bucket list",
      corrected: "",
      mistakes: [
        ["I have went", "I went", "verb_form", "past_participle", "moderate", "Use the past simple: 'I went'."],
        ["I'm agree", "I agree", "sentence_structure", "spanish_calque", "moderate", "'Agree' is a verb: 'I agree'."],
      ],
      vocabulary: [["lista de deseos", ["bucket list"]]],
      spoken: true,
    },
    classAt,
    { correctedText: null, wordCount: 0, transcriptRaw: null, source: "class" },
  );

  // Flashcards: two weeks of reviews (a streak), some cards due today.
  const cards: [string, string][] = [
    ["vocabulary", wordKey("aprovechar")],
    ["vocabulary", wordKey("estimar")],
    ["vocabulary", wordKey("reproducir el error")],
    ["mistake", mistakeKey(M.dependOf[0], M.dependOf[1])],
    ["mistake", mistakeKey(M.informations[0], M.informations[1])],
    ["mistake", mistakeKey(M.since[0], M.since[1])],
    ["mistake", mistakeKey(M.doMistake[0], M.doMistake[1])],
  ];
  cards.forEach(([kind, cardKey], i) => {
    data.reviews.push({
      id: id("rev"),
      kind,
      cardKey,
      ease: 2.5,
      intervalDays: i % 3,
      repetitions: 2,
      lapses: i % 4 === 0 ? 1 : 0,
      dueAt: now - (i % 2) * DAY,
      reviewCount: 3,
      lastGrade: i % 4 === 0 ? "hard" : "good",
      lastReviewedAt: now - DAY,
      createdAt: now - 14 * DAY,
    });
  });
  for (let day = 13; day >= 1; day--) {
    if (day === 9) continue;
    for (let n = 0; n < 4 + (day % 5); n++) {
      const [kind, cardKey] = cards[(day + n) % cards.length];
      data.reviewLog.push({
        id: id("log"),
        kind,
        cardKey,
        grade: n % 5 === 0 ? "again" : n % 3 === 0 ? "hard" : "good",
        wasNew: day > 11,
        intervalDays: 1 + (n % 4),
        reviewedAt: now - day * DAY + n * 60 * 1000,
      });
    }
  }

  // Read aloud: a few attempts, with the sounds a Spanish speaker usually changes.
  const attempts: [string, string, [string, string, string, string][]][] = [
    [
      "I think this is very good.",
      "I tink this is bery good.",
      [
        ["think", "tink", "th_sounds", "/θ/ → /t/"],
        ["very", "bery", "b_v", "/v/ → /b/"],
      ],
    ],
    [
      "She will leave the ship tomorrow.",
      "She will live the sheep tomorrow.",
      [
        ["leave", "live", "vowel_length", "/iː/ → /ɪ/"],
        ["ship", "sheep", "vowel_length", "/ɪ/ → /iː/"],
      ],
    ],
    [
      "Three thousand people were there.",
      "Tree thousand people were there.",
      [["Three", "Tree", "th_sounds", "/θ/ → /t/"]],
    ],
    [
      "I studied Spanish in school.",
      "I studied espanish in school.",
      [["Spanish", "espanish", "initial_s_cluster", "/sp/ → /esp/"]],
    ],
  ];
  attempts.forEach(([text, transcript, issues], i) => {
    const at = now - (12 - i * 3) * DAY;
    const attemptId = id("read");
    data.readAloudAttempts.push({
      id: attemptId,
      source: "sounds",
      text,
      transcript,
      correctWords: words(text) - issues.length,
      totalWords: words(text),
      audioDurationMs: words(text) * 450,
      transcriptionProvider: "groq",
      transcriptionModel: "whisper-large-v3-turbo",
      createdAt: at,
    });
    for (const [expected, heard, category, detail] of issues) {
      data.pronunciationIssues.push({ id: id("sound"), attemptId, expected, heard, category, detail, createdAt: at });
    }
  });

  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: new Date(now).toISOString(), data, settings };
}
