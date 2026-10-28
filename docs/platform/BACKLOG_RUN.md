# Backlog run: plan y estado

> Area: Platform · Kind: Chore · Status: In progress · Board: #111–#128 y siguientes

Plan para cerrar el backlog pendiente (2026-10-28) con equipos de subagentes (implementador Sonnet + revisor Opus, hasta 4 en paralelo) y un orquestador. **Este archivo es el estado del trabajo**: si una sesión se corta, la siguiente retoma desde acá ("seguí con el backlog run").

## Reglas del flujo

- Rama de integración: `integration/backlog` (sale de `develop`). Worktree del orquestador: `~/personal-projects/ec-worktrees/integration`.
- Cada equipo trabaja en su rama `team/<nombre>` y su worktree `~/personal-projects/ec-worktrees/<nombre>` (creado con `ec-worktrees/setup-worktree.sh <nombre> team/<nombre>`: base `integration/backlog`, `data/dev.db` copiada, `DATABASE_PATH=data/dev.db`). Nunca `data/companion.db`.
- Ciclo: implementa → el revisor revisa el diff contra `integration/backlog` → se corrige hasta que el revisor aprueba → PR contra `integration/backlog` (CI corre en esas PRs) → el orquestador mergea con CI verde.
- Tests: durante la iteración, solo los tests de lo que se tocó (`pnpm vitest run <archivos>`). El set completo (`pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm knip`) una sola vez antes de pedir revisión; `pnpm build` lo corre CI. Evals con API: una corrida chica y solo en los ítems que lo piden; si se acaba la cuota, se anota como pendiente en la prueba manual.
- Board: _In progress_ al arrancar la tanda; _In review_ cuando la PR se mergea en la integración (falta la prueba manual); _Done_ recién después del merge a `develop`.
- Cada PR trae una sección "Manual test"; el orquestador la pasa a [BACKLOG_MANUAL_TESTS.md](BACKLOG_MANUAL_TESTS.md).
- Decisiones del usuario (2026-10-28): multiusuario completo con login email + password (Better Auth) **siempre**, también en local, y los datos actuales pasan al primer usuario; deploy listo pero sin subir; libros de texto quedan en Backlog; sin Ollama (si se acaba la cuota, el eval queda pendiente); branch protection activada en `develop`/`main` (checks `checks` y `scan`, sin forzar a admins).

## Tandas

Estado: ⏳ pendiente · 🔨 en curso · 👀 en revisión · ✅ mergeado en la integración

### Tanda 1: bases (sin cambios de esquema)

| Equipo     | Ítems                                                                                                                                                                                                    | Rama              | PR  | Estado |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --- | ------ |
| test-infra | #111 integration tests de rutas, #112 tests de migraciones con fixture viejo, #113 test del migrator race-safe (+ pragma busy_timeout), #114 piso de cobertura `src/lib/**`                              | `team/test-infra` |     | 🔨     |
| ai-fixes   | #115 fallback de Groq en mensajes largos, #116 conservar descartes al reintentar, #117 umbrales de regresión en `pnpm eval:*`, #118 sacar whisper.cpp del eval de ASR                                    | `team/ai-fixes`   |     | ⏳     |
| cleanup    | #119 helper `parseBody`, #120 logger mínimo del servidor, #121 lint de handlers async en JSX + nits, #122 resumen de pronunciación sin usar en Today, #123 partir `review-session.tsx` y los lib grandes | `team/cleanup`    |     | ⏳     |
| design     | Research con docs y decisión: #124 Authentication, #125 Multi-user, #126 keys por usuario, #127 Deploy; implementación de #128 release workflow                                                          | `team/design`     |     | ⏳     |

### Tanda 2: login y plataforma (después de la tanda 1)

| Equipo       | Ítems                                                                                                                                                                                                                                                                   | Estado |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| auth         | #124 Better Auth email + password, login siempre, todas las páginas y rutas protegidas, los datos actuales al primer usuario; _Security regression tests (401 on every route, body limits)_                                                                             | ⏳     |
| voice        | _Read aloud: schwa and weak forms with wav2vec2_, _phonemes as a second signal_, _word stress from prosody_ (research), _wav2vec2 in the browser_ (research), y el script + guía de grabación para _Eval: real read-aloud recordings_ (la grabación la hace el usuario) | ⏳     |
| kokoro-csp   | #45 Kokoro en WebGPU (intento; valida el usuario), _Full Content-Security-Policy, tested with Kokoro_                                                                                                                                                                   | ⏳     |
| deploy-ready | _Migrations as a deploy step, with backup and DB permissions_, _X-Forwarded-Host port handling and IPv6 in ALLOWED_HOSTS_, Dockerfile y guía de deploy según el doc de #127                                                                                             | ⏳     |

### Tanda 3: multiusuario (después de auth)

| Equipo     | Ítems                                                                                                                                            | Estado |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| multi-user | #125: `user_id` en todas las tablas con backfill, todas las queries, estadísticas y jobs por usuario, settings por usuario, tests de aislamiento | ⏳     |
| e2e        | _Playwright E2E smoke with a fake-AI mode_ (con login)                                                                                           | ⏳     |
| evals      | _Eval: correction quality in topic/role-play chats_, _Use discarded corrections as eval examples_                                                | ⏳     |

### Tanda 4: features por usuario (después de multi-user)

| Equipo         | Ítems                                                                                                                                 | Estado |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| keys           | _Encrypt the saved API keys_, #126 keys por usuario, _Export / import the database_ (por usuario, sin keys)                           | ⏳     |
| class          | _Class report to take to class_, _Teacher's corrections after class_, _Store the teacher's CEFR level per class session_              | ⏳     |
| topics         | _Interview feedback summary on request_, _Combine a topic with tense practice_, _Topic vocabulary feeding the Vocabulary page_        | ⏳     |
| corrections-ui | _Floating window: "Wrong type?" button_, _"Show discarded" list on the dashboard_, _Dashboard: show the no-API-key notice at the top_ | ⏳     |

### Tanda 5: cierre (orquestador)

- _Enforce import order with lint_ (autofix sobre todo el código, al final para no generar conflictos).
- Revisión cruzada de toda la integración, checks completos, `docs/ROADMAP.md` y `docs/README.md` al día, [BACKLOG_MANUAL_TESTS.md](BACKLOG_MANUAL_TESTS.md) completo.
- Aviso al usuario para la prueba manual. Los arreglos se hacen en la integración; con todo aceptado, PR `integration/backlog` → `develop`.

### Fuera de esta corrida (quedan en Backlog)

- Libros de texto: _Textbook space_ y _The app follows the textbook_ (decisión del usuario).
- Esperan a terceros: ESLint 10, TypeScript 7, transformers.js 4.
- _Enable CodeQL_ (no se hace público el repo) y _Re-check the dictation factor_ (faltan datos).

## Bitácora

- 2026-10-28: rama `integration/backlog` creada; branch protection en `develop`/`main`; CI y gitleaks corren en las PRs a `integration/**`; #8 cerrado; tanda 1 arrancada en el board (#111–#128).
- 2026-10-28: tanda 1 en curso (implementadores lanzados en los 4 worktrees).
