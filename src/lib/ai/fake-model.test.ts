import { generateText, Output, streamText } from "ai";
import { describe, expect, it } from "vitest";

import { levelExplanationSchema, studyPlanSchema } from "@/lib/insights/plan-core";

import { analysisSchema, normalizeAnalysis } from "./analysis";
import { classificationSchema } from "./classify-core";
import {
  categoryExercisesSchema,
  exercisesSchema,
  MIN_EXERCISES,
  normalizeCategoryExercises,
  normalizeExercises,
} from "./exercises-core";
import { createFakeModel } from "./fake-model";

const model = createFakeModel("fake");

function analysisPrompt(text: string) {
  return `Learner's new message to analyze:\n<<<\n${text}\n>>>`;
}

describe("fake model", () => {
  it("corrects the mistakes it knows, with an answer the real normalizer keeps", async () => {
    const text = "I goed to the park with my childs.";
    const { output } = await generateText({
      model,
      prompt: analysisPrompt(text),
      output: Output.object({ schema: analysisSchema }),
    });
    const analysis = normalizeAnalysis(output, "correction", text);
    expect(analysis.correctedText).toBe("I went to the park with my children.");
    expect(analysis.errors.map((e) => e.original)).toEqual(["goed", "childs"]);
  });

  it("finds nothing in a correct message and replies in conversation mode", async () => {
    const text = "I like this park.";
    const { output } = await generateText({
      model,
      prompt: analysisPrompt(text),
      output: Output.object({ schema: analysisSchema }),
    });
    const analysis = normalizeAnalysis(output, "conversation", text);
    expect(analysis.errors).toEqual([]);
    expect(analysis.reply).toBeTruthy();
  });

  it("streams an analysis that validates", async () => {
    const result = streamText({
      model,
      prompt: analysisPrompt("I goed home."),
      output: Output.object({ schema: analysisSchema }),
    });
    const partials: unknown[] = [];
    for await (const partial of result.partialOutputStream) partials.push(partial);
    expect((await result.output).errors).toHaveLength(1);
    expect(partials.length).toBeGreaterThan(0);
  });

  it("writes category exercises that survive the normalizer", async () => {
    const { output } = await generateText({
      model,
      prompt: "Write exercises",
      output: Output.object({ schema: categoryExercisesSchema }),
    });
    const items = normalizeCategoryExercises(output, {
      category: "verb_form",
      subtype: null,
      explanationLanguage: "en",
    });
    expect(items.length).toBeGreaterThanOrEqual(MIN_EXERCISES);
  });

  it.each(["present_simple", "past_simple", "present_perfect"] as const)("writes %s exercises", async (tense) => {
    const { output } = await generateText({
      model,
      prompt: "Write exercises",
      output: Output.object({ schema: exercisesSchema }),
    });
    const items = normalizeExercises(output, { kind: "form", tense, contrastWith: null, explanationLanguage: "en" });
    expect(items.length).toBeGreaterThanOrEqual(MIN_EXERCISES);
  });

  it("answers the plan, level and classification schemas", async () => {
    const plan = await generateText({ model, prompt: "x", output: Output.object({ schema: studyPlanSchema }) });
    expect(plan.output.focus.length).toBeGreaterThan(0);
    const level = await generateText({ model, prompt: "x", output: Output.object({ schema: levelExplanationSchema }) });
    expect(level.output.nextSteps.length).toBeGreaterThan(0);
    const { output } = await generateText({
      model,
      prompt: "x",
      output: Output.object({ schema: classificationSchema }),
    });
    expect(output.items).toEqual([]);
  });

  it("fails a message with the marker once, then answers it", async () => {
    const request = () =>
      generateText({
        model,
        prompt: analysisPrompt("I goed home, fail-once."),
        output: Output.object({ schema: analysisSchema }),
        maxRetries: 0,
      });
    await expect(request()).rejects.toThrow(/quota/i);
    expect((await request()).output.errors).toHaveLength(1);
  });

  it("answers plain text without a schema", async () => {
    const { text } = await generateText({ model, prompt: "Improve this" });
    expect(text.length).toBeGreaterThan(10);
  });
});
