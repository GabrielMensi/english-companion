import { describe, expect, it } from "vitest";
import type { Tense } from "@/lib/taxonomy";
import { countTenses, detectTenses } from "./tenses-core";

const CASES: [string, Tense[]][] = [
  // Statements
  ["She works in a bank.", ["present_simple"]],
  ["They are working now.", ["present_continuous"]],
  ["I'm working on it.", ["present_continuous"]],
  ["Yesterday I went to the store.", ["past_simple"]],
  ["I was reading when she called.", ["past_continuous", "past_simple"]],
  ["I have lived here since 2020.", ["present_perfect"]],
  ["He's gone home.", ["present_perfect"]],
  ["She's been busy.", ["present_perfect"]],
  ["I have been working all day.", ["present_perfect_continuous"]],
  ["I had finished before he arrived.", ["past_perfect", "past_simple"]],
  ["He had been waiting for hours.", ["past_perfect_continuous"]],
  ["I will call you tomorrow.", ["future_will"]],
  ["I'll check it later.", ["future_will"]],
  ["I am going to buy a car.", ["future_going_to"]],
  ["I will be working at 5.", ["future_continuous"]],
  ["By Friday I will have finished.", ["future_perfect"]],
  ["I used to live in Madrid.", ["used_to_would"]],
  ["I would help you if I could.", ["conditional_would"]],
  ["I would have told you.", ["conditional_would"]],
  ["I'd have told you.", ["conditional_would"]],
  // Negatives and passives
  ["I didn't see it.", ["past_simple"]],
  ["She doesn't work here.", ["present_simple"]],
  ["It was built in 1990.", ["past_simple"]],
  ["It has been fixed.", ["present_perfect"]],
  // Questions: compromise splits the auxiliary from the verb
  ["Did she finish the report?", ["past_simple"]],
  ["Have you ever been to Japan?", ["present_perfect"]],
  ["Where do you live?", ["present_simple"]],
  ["Are you going to deploy today?", ["future_going_to"]],
  ["Is it working?", ["present_continuous"]],
  // Not tenses: infinitives, modals, imperatives
  ["I want to learn English.", ["present_simple"]],
  ["Can you review my PR?", []],
  ["Enjoy reading.", []],
  // Mixed
  ["When I arrive, I will call you.", ["present_simple", "future_will"]],
  ["I think it works.", ["present_simple", "present_simple"]],
];

describe("detectTenses", () => {
  it.each(CASES)("%s", (text, expected) => {
    expect(detectTenses(text)).toEqual(expected);
  });

  it("ignores code, inline code and URLs", () => {
    expect(
      detectTenses(
        "I fixed it:\n```ts\nconst x = await run();\n```\nSee `npm run dev` at https://example.com/was/built",
      ),
    ).toEqual(["past_simple"]);
  });
});

describe("countTenses", () => {
  it("counts each tense", () => {
    expect(countTenses("I went home. Then I watched TV. I have finished.")).toEqual({
      past_simple: 2,
      present_perfect: 1,
    });
  });

  it("returns an empty record for text without verbs", () => {
    expect(countTenses("Thanks!")).toEqual({});
  });
});

describe("detectTenses on prompts", () => {
  it.each<[string, Tense[]]>([
    ["It shows minified code.", ["present_simple"]],
    ["You can explore the work done on the other repo.", []],
    ["When I approve it, work on a new branch and open a PR.", ["present_simple"]],
    ["Don't touch the code yet.", []],
    ["Is the Whisper feature documented?", ["present_simple"]],
    ["My brother worked there for years.", ["past_simple"]],
    ["A report came to me yesterday.", ["past_simple"]],
    ["I left the books in the folder.", ["past_simple"]],
  ])("%s", (text, expected) => {
    expect(detectTenses(text)).toEqual(expected);
  });
});
