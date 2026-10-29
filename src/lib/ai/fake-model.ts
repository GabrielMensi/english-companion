/**
 * A fake language model for the end-to-end tests (`AI_FAKE=1`, see `fakeAiEnabled` in providers.ts).
 * It answers every AI call of the app with fixed, deterministic JSON that satisfies the call's schema,
 * so the whole pipeline (streaming, normalization, saving) runs for real without a provider.
 * No server-only import, so it can be unit tested against the real normalizers.
 */
import { APICallError, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

type CallOptions = MockLanguageModelV4["doGenerateCalls"][number];

/** Mistakes the fake tutor recognizes in the learner's message: `[wrong, right, category, subcategory, explanation]`. */
const KNOWN_MISTAKES: readonly (readonly [string, string, string, string, string])[] = [
  ["goed", "went", "verb_form", "irregular_past", "The past of 'go' is 'went'."],
  ["childs", "children", "plurals_countability", "irregular_plural", "The plural of 'child' is 'children'."],
  ["more better", "better", "comparatives", "double_comparative", "'Better' already is a comparative."],
];

const TEXT_BETWEEN_MARKS = /<<<\n([\s\S]*?)\n>>>/;

function promptText(options: CallOptions): string {
  return options.prompt
    .flatMap((message) =>
      typeof message.content === "string"
        ? [message.content]
        : message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])),
    )
    .join("\n");
}

function analysis(prompt: string) {
  const text = TEXT_BETWEEN_MARKS.exec(prompt)?.[1] ?? "";
  const found = KNOWN_MISTAKES.filter(([wrong]) => text.toLowerCase().includes(wrong));
  const correctedText = found.reduce((acc, [wrong, right]) => acc.replace(new RegExp(wrong, "i"), right), text);
  return {
    correctedText,
    naturalText: null,
    errors: found.map(([wrong, right, category, subcategory, explanation]) => ({
      original: wrong,
      correction: right,
      category,
      subcategory,
      severity: "moderate",
      explanation,
    })),
    spanishPhrases: [],
    reply: "That sounds great. Tell me more about it.",
  };
}

/** Items that pass the real normalizers (a gap or a mistake to fix, and an answer that matches). */
const CATEGORY_ITEMS = [
  { sentence: "She ___ (go) to work by bus every day.", options: "", answer: "She goes to work by bus every day." },
  { sentence: "I ___ (be) very tired yesterday.", options: "", answer: "I was very tired yesterday." },
  {
    sentence: "He ___ (like / likes) playing the guitar.",
    options: "like / likes",
    answer: "He likes playing the guitar.",
  },
  { sentence: "We ___ (have) dinner at eight.", options: "", answer: "We have dinner at eight." },
  { sentence: "Fix the mistake: He go to school.", options: "", answer: "He goes to school." },
  { sentence: "Fix the mistake: They is happy.", options: "", answer: "They are happy." },
].map((item) => ({ ...item, why: "This is the rule for this sentence." }));

/** Answers in tenses the counter recognizes, so the tense practice keeps them. */
const TENSE_ITEMS = [
  { sentence: "She ___ (work) in a bank.", answer: "She works in a bank." },
  { sentence: "He ___ (not / eat) meat.", answer: "He doesn't eat meat." },
  { sentence: "They ___ (play) football on Sundays.", answer: "They play football on Sundays." },
  { sentence: "I ___ (visit) my aunt last week.", answer: "I visited my aunt last week." },
  { sentence: "We ___ (see) a film yesterday.", answer: "We saw a film yesterday." },
  { sentence: "She ___ (buy) a car last year.", answer: "She bought a car last year." },
  { sentence: "I ___ (finish) the report already.", answer: "I have finished the report already." },
  { sentence: "He ___ (write) three emails today.", answer: "He has written three emails today." },
  { sentence: "They ___ (be) to Japan twice.", answer: "They have been to Japan twice." },
].map((item) => ({ ...item, why: "This is the tense the sentence needs." }));

/**
 * A message that contains this marker fails the first time it is analyzed (a provider out of quota) and works
 * after that, so the E2E tests can show the error and use "Retry". Kept in globalThis: Next may load this module
 * once per route bundle, and the send and retry routes must share it.
 */
const FAIL_ONCE_MARKER = "fail-once";
const failedOnce = ((globalThis as { __fakeAiFailedOnce?: Set<string> }).__fakeAiFailedOnce ??= new Set<string>());

function failOnce(prompt: string) {
  const text = TEXT_BETWEEN_MARKS.exec(prompt)?.[1];
  if (!text?.includes(FAIL_ONCE_MARKER) || failedOnce.has(text)) return;
  failedOnce.add(text);
  throw new APICallError({
    message: "Quota exceeded (fake)",
    url: "https://fake.invalid",
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: false,
  });
}

/** One answer for a call, chosen by the shape of its output schema. */
export function fakeAnswer(options: CallOptions): unknown {
  const schema = options.responseFormat?.type === "json" ? (options.responseFormat.schema as unknown) : undefined;
  const props = (schema as { properties?: Record<string, unknown> } | undefined)?.properties;
  if (!props) return "Write a clear and complete answer. Keep every detail of the original message.";

  if ("correctedText" in props) return analysis(promptText(options));
  if ("goal" in props) {
    return {
      summary: "You write clearly. Keep practicing the past tense.",
      focus: [
        {
          topic: "Past simple",
          why: "A few irregular verbs went wrong.",
          practice: "Write five sentences a day.",
          example: "I went home early.",
        },
      ],
      goal: "Write ten messages with no verb form mistakes.",
    };
  }
  if ("nextSteps" in props) {
    return {
      explanation: "Your messages are mostly correct, with some slips in irregular verbs.",
      nextSteps: ["Review irregular past forms.", "Write longer messages."],
    };
  }
  if ("items" in props) {
    const item = (props.items as { items?: { properties?: Record<string, unknown> } }).items;
    const itemProps = item?.properties ?? {};
    if ("options" in itemProps) return { items: CATEGORY_ITEMS };
    if ("answer" in itemProps) return { items: TENSE_ITEMS };
  }
  return { items: [] };
}

function usage() {
  return {
    inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 20, text: 20, reasoning: undefined },
  };
}

const finishReason = { unified: "stop" as const, raw: undefined };

export function createFakeModel(modelId: string) {
  const text = (options: CallOptions) => {
    failOnce(promptText(options));
    const answer = fakeAnswer(options);
    return typeof answer === "string" ? answer : JSON.stringify(answer);
  };
  return new MockLanguageModelV4({
    provider: "fake",
    modelId,
    doGenerate: async (options) => ({
      content: [{ type: "text", text: text(options) }],
      finishReason,
      usage: usage(),
      warnings: [],
    }),
    doStream: async (options) => {
      const answer = text(options);
      // Two chunks, so the streaming routes send a partial preview before the end.
      const half = Math.floor(answer.length / 2);
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start" as const, warnings: [] },
            { type: "text-start" as const, id: "1" },
            { type: "text-delta" as const, id: "1", delta: answer.slice(0, half) },
            { type: "text-delta" as const, id: "1", delta: answer.slice(half) },
            { type: "text-end" as const, id: "1" },
            { type: "finish" as const, finishReason, usage: usage() },
          ],
          chunkDelayInMs: 20,
        }),
      };
    },
  });
}
