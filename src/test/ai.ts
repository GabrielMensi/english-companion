// Mock AI providers for integration tests, built on the AI SDK's `MockLanguageModelV4`. The setup file
// mocks `@ai-sdk/google` and `@ai-sdk/groq` with these, so tests only set what each provider answers:
//
//   fakeAi.gemini.output = analysis;       // JSON the model "writes"
//   fakeAi.gemini.fail = "unavailable";    // or "quota", "unavailable-retryable"
//
// Call `resetFakeAi(output)` in `beforeEach`.
import { APICallError, simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

export type MockProvider = "gemini" | "groq";
/** "quota" and "unavailable" fail right away; "unavailable-retryable" makes the AI SDK retry with backoff. */
export type FailMode = false | "quota" | "unavailable" | "unavailable-retryable";

export interface FakeProvider {
  /** What the model answers, as a JSON value (the AI SDK parses it with the call's schema). */
  output: unknown;
  fail: FailMode;
  /** Requests received (each SDK retry counts). */
  calls: number;
}

export const fakeAi: Record<MockProvider, FakeProvider> = {
  gemini: { output: null, fail: false, calls: 0 },
  groq: { output: null, fail: false, calls: 0 },
};

/** Every provider answers `output`, nobody fails, call counters back to 0. */
export function resetFakeAi(output: unknown = null): void {
  for (const provider of Object.values(fakeAi)) Object.assign(provider, { output, fail: false, calls: 0 });
}

function failure(mode: Exclude<FailMode, false>): APICallError {
  const status = mode === "quota" ? 429 : 503;
  return new APICallError({
    message: mode === "quota" ? "Quota exceeded" : "The model is overloaded",
    url: "https://example.test",
    requestBodyValues: {},
    statusCode: status,
    isRetryable: mode === "unavailable-retryable",
  });
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};
const finishReason = { unified: "stop" as const, raw: undefined };

function mockModel(provider: MockProvider, modelId: string) {
  const state = fakeAi[provider];
  const answer = () => {
    state.calls++;
    if (state.fail) throw failure(state.fail);
    return JSON.stringify(state.output);
  };
  return new MockLanguageModelV4({
    provider,
    modelId,
    doGenerate: async () => ({ content: [{ type: "text", text: answer() }], finishReason, usage, warnings: [] }),
    doStream: async () => {
      const text = answer();
      // Two chunks, so a streaming route sends at least one partial preview.
      const half = Math.floor(text.length / 2);
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start" as const, warnings: [] },
            { type: "text-start" as const, id: "1" },
            { type: "text-delta" as const, id: "1", delta: text.slice(0, half) },
            { type: "text-delta" as const, id: "1", delta: text.slice(half) },
            { type: "text-end" as const, id: "1" },
            { type: "finish" as const, finishReason, usage },
          ],
        }),
      };
    },
  });
}

/** Replacement for the `@ai-sdk/google` module. */
export function googleModule() {
  const model = mockModel("gemini", "mock-gemini");
  return { createGoogleGenerativeAI: () => () => model };
}

/** Replacement for the `@ai-sdk/groq` module. */
export function groqModule() {
  const model = mockModel("groq", "mock-groq");
  return { createGroq: () => () => model };
}
