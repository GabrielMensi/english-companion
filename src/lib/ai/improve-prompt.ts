import "server-only";

import { generateText } from "ai";

import type { Settings } from "@/lib/settings";

import { withFallback } from "./providers";

const INSTRUCTIONS = `You turn a message into a clear, well-structured prompt for an AI assistant (such as Claude or ChatGPT, often a coding agent).

Rules:
- Keep the author's intent and every concrete detail (names, files, errors, constraints). Do not invent requirements, technologies or facts.
- Write in clear, direct English, addressed to the assistant.
- Scale the structure to the message: a one-line request stays short. For longer requests, organize it with short markdown sections only when they add value, such as: Context, Task, Requirements, Constraints, Expected output.
- Turn vague wording into explicit instructions, and make implicit acceptance criteria explicit when they are clearly implied.
- Keep code, identifiers, paths and commands exactly as written.
- Output ONLY the final prompt, without preamble or explanations.`;

export async function improvePrompt(userId: string, text: string, settings: Settings) {
  const { result, used } = await withFallback(userId, settings, (resolved, { isLast }) =>
    generateText({
      ...resolved.call({ temperature: 0.3, retry: isLast }),
      instructions: INSTRUCTIONS,
      prompt: `Message:\n<<<\n${text}\n>>>`,
    }),
  );
  return { prompt: stripFences(result.text.trim()), provider: used.provider, modelId: used.modelId };
}

/** Some models wrap the whole answer in a code fence. */
function stripFences(text: string): string {
  const match = text.match(/^```(?:markdown|md|text)?\n([\s\S]*)\n```$/);
  return match ? match[1].trim() : text;
}
