@AGENTS.md

# English Companion

Local-only, free-first AI English tutor (see README.md). Not meant to be deployed.

- UI text is in English. Error explanations follow the "explanation language" setting (Spanish or English); prompts sent to the model are in English.
- The error taxonomy in `src/lib/taxonomy.ts` is fixed on purpose so stats group consistently: add categories there, never let the model invent them.
- Keep AI calls behind `src/lib/ai/providers.ts` (`resolveModel`); every provider must work with local Ollama models, so prefer simple, flat output schemas.
- Pure logic (analysis normalization, stats) lives in files without `server-only` and has vitest tests: `pnpm test`.
- After changing `src/db/schema.ts`, run `pnpm db:generate`; migrations apply automatically on startup.
- Checks: `pnpm typecheck && pnpm lint && pnpm test`.

## The app is always in use

The user runs the app every day from this folder (`pnpm dev` on port 3737, `develop` branch, real database in `data/companion.db`). Never break it:
- Develop in a separate git worktree on a feature branch, never in this folder. Give the worktree its own dev server on another port (e.g. `pnpm dev --port 3738`) and a copy of the database (`DATABASE_PATH=data/dev.db` in the worktree's `.env.local`, copied from the real one), because migrations apply automatically on startup.
- Never point a development server, script or migration at `data/companion.db`.
- Merge a feature into `develop` only after the user has tested it in the worktree and accepted it. Back up `data/companion.db` first: the running app hot-reloads and applies the new migrations to the real data.
- Schema changes must be additive and migrations safe on existing data (nullable columns or defaults, backfills that don't lose rows).
