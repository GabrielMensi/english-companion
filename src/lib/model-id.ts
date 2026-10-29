/** Model ids in Settings (no server-only imports, unit tested). */
import { z } from "@/lib/zod";

/**
 * A model id as providers write them ("gemini-flash-latest", "openai/gpt-oss-120b"). The id goes
 * into the provider's URL path, so no "..", spaces or query characters.
 */
export const modelIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[\w.:/-]+$/)
  .refine((id) => !id.includes(".."));

/** The saved model of each provider, or its default when the saved one is missing or no longer valid. */
export function savedModels<T extends Record<string, string>>(defaults: T, stored: unknown): T {
  const saved = (stored ?? {}) as Partial<Record<string, unknown>>;
  return Object.fromEntries(
    Object.entries(defaults).map(([provider, model]) => {
      const id = saved[provider];
      return [provider, modelIdSchema.safeParse(id).success ? id : model];
    }),
  ) as T;
}
