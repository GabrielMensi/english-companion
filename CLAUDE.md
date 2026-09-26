@AGENTS.md

# English Companion

Local-only, free-first AI English tutor (see README.md). Not meant to be deployed.

- UI text is in English. Error explanations follow the "explanation language" setting (Spanish or English); prompts sent to the model are in English.
- The error taxonomy in `src/lib/taxonomy.ts` is fixed on purpose so stats group consistently: add categories there, never let the model invent them.
- Keep AI calls behind `src/lib/ai/providers.ts` (`resolveModel`); every provider must work with local Ollama models, so prefer simple, flat output schemas.
- Pure logic (analysis normalization, stats) lives in files without `server-only` and has vitest tests: `pnpm test`.
- After changing `src/db/schema.ts`, run `pnpm db:generate`; migrations apply automatically on startup.
- Checks: `pnpm typecheck && pnpm lint && pnpm test`.
