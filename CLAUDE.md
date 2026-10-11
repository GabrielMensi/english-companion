@AGENTS.md

# English Companion

Free-first AI English tutor that runs on your machine with API models (Gemini, Groq free tiers); see README.md. Local LLMs (Ollama) were removed in #72: see `docs/ai/LOCAL_MODELS.md` and the `archive/local-models-ollama` tag. Not deployed yet.

- UI text is in English. Error explanations follow the "explanation language" setting (Spanish or English); prompts sent to the model are in English.
- The error taxonomy in `src/lib/taxonomy.ts` is fixed on purpose so stats group consistently: add categories there, never let the model invent them.
- Fine error types (`SUBTYPES`, `TENSES`) are assigned later by the deferred classifier (`src/lib/classification.ts`), never in the chat prompt. Chat AI calls go through `withChatPriority` so classification batches wait for them.
- Tense uses are counted without AI in `src/lib/tenses-core.ts` and stored in `messages.tense_counts`; bump `TENSE_COUNTER_VERSION` when the rules change so stored counts get recomputed.
- Dictated messages (`input_mode = "spoken"`): speech-to-text decides spelling, punctuation and capitalization, so those are never reported, and categories it fills in (`NOT_MEASURABLE_WHEN_SPOKEN`) never count in the stats. Use `countsInStats` in any new statistic.
- Keep AI calls behind `src/lib/ai/providers.ts` (`resolveModel`); prefer simple, flat output schemas: they're cheap, every provider fills them reliably and they work with Groq's structured output. Without any API key, AI calls fail with `NO_PROVIDER_MESSAGE`.
- The correction streams to the chat (`analyzeMessage` with `onPreview`, NDJSON from the send/retry routes) only for display: what gets saved always comes from the complete, validated object through `normalizeAnalysis`, and a failed stream falls back to `generateText`.
- Pure logic (analysis normalization, stats) lives in files without `server-only` and has vitest tests: `pnpm test`.
- After changing `src/db/schema.ts`, run `pnpm db:generate`; migrations apply automatically on startup.
- Checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check`. `pnpm lint` must pass with 0 errors and 0 warnings: the stricter rules (docs/platform/CODE_QUALITY.md) are errors. `pnpm knip` must stay clean (unused files, exports, dependencies).
- Formatting is Prettier (`.prettierrc.json`, 120 columns, Tailwind class sorting) and the codebase is formatted: run `pnpm exec prettier --write <files you changed>` (or `pnpm format`) before committing.

## The app is always in use

The user runs the app every day from this folder (`pnpm dev` on port 3737, `develop` branch, real database in `data/companion.db`). Never break it:

- Develop in a separate git worktree on a feature branch, never in this folder. Give the worktree its own dev server on another port (e.g. `pnpm dev --port 3738`) and a copy of the database (`DATABASE_PATH=data/dev.db` in the worktree's `.env.local`, copied from the real one), because migrations apply automatically on startup.
- Exception, small changes: when the user asks for a small change (an XS fix or tweak of a few lines, like adding a button) or a docs update, skip the worktree and the PR: make it in this folder, run the checks, then commit and push straight to `develop`. The running app hot-reloads, so the user sees it right away. Not for anything with schema changes, migrations, new or updated dependencies, or changes to the AI pipeline; those follow the worktree flow. If it has a board item, close the issue by hand (`Closes #N` only works when merging into `main`) and move the item to _Done_ with today as Target date.
- Never point a development server, script or migration at `data/companion.db`.
- Merge a feature into `develop` only after the user has tested it in the worktree and accepted it. Back up `data/companion.db` first: the running app hot-reloads and applies the new migrations to the real data.
- If the merge adds or updates dependencies, run `pnpm install` in this folder right after pulling (in the same command), or the running app breaks on the missing package.
- Before removing a worktree, move anything the user created there that git doesn't track (recordings in `data/asr-samples/`, eval results in `.eval-results/`) into this folder: removing the worktree deletes it.
- Schema changes must be additive and migrations safe on existing data (nullable columns or defaults, backfills that don't lose rows).

## Project board (mandatory)

Task status lives in the GitHub Project **English Companion**: https://github.com/users/GabrielMensi/projects/1 (project #1, owner `GabrielMensi`, linked to this repo). Keep it up to date in every session without being asked, using `gh project` / `gh issue` (the token has the `project` scope; get field and option IDs with `gh project field-list 1 --owner GabrielMensi --format json`).

- **Fields**: Status (Backlog → Ready → In progress → In review → Done, plus In pause and Discard), Priority (P0 next or blocking, P1 important, P2 later), Size (XS to XL), Start date and Target date (for the Roadmap view).
- **Categories (set both on every item, drafts and PRs included)**: _Area_ (Chat & corrections, Voice, Practice, Progress, Class & textbook, AI pipeline, UI/UX, Platform) and _Kind_ (Feature, Bug, Research, Eval, Chore). Area is where the user sees it (a dashboard panel about pronunciation is Progress); AI pipeline is only for cross-cutting work (providers, prompts, model choice, the classifier). Research produces a doc and a decision; Eval measures quality (model evals, calibration, manual test passes).
- **Cycle**: two-week iterations starting on Mondays. Set the current cycle when an item moves to _In progress_. If the next cycles are missing, add them (`updateProjectV2Field` with `iterationConfiguration` via `gh api graphql`, passing the existing iterations too).
- **Before starting a task**: find its item on the board (or create it). If it's a draft, convert it to an issue. Move it to _In progress_ and set its Start date.
- **Pull requests**: put `Closes #N` in the PR body so the merge closes the issue, and move the item to _In review_ when the PR is opened.
- **After merging**: make sure the item is _Done_ (merged PRs are on the board too, as _Done_), with the merge date as its Target date. Also update "Hecho" in `docs/ROADMAP.md`.
- **Docs** go in `docs/<area>/` with the `> Area · Kind · Status · Board` header line, and are listed in `docs/README.md` (see the rules there).
- **New ideas and follow-ups** found while working (limitations, TODOs, things the user asks to "leave for later") go on the board as _Backlog_ drafts with a Priority and a Size, not only in the docs. Docs keep the detail; the board tracks the status.
- **Issues vs drafts**: the next 3–4 tasks are real issues; the rest of the backlog stays as drafts. Categories live in the Area and Kind fields, not in labels (drafts can't have labels).
- If an item's scope or priority changes (the user decides something isn't important right now, or a finding changes the plan), update the item and its issue body; don't leave stale plans.
- Small housekeeping (docs-only fixes, config) doesn't need an item.
