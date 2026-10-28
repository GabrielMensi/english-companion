# Backlog run: prueba manual

> Area: Platform · Kind: Eval · Status: In progress · Board: #111–#128 y siguientes

Qué probar a mano en la rama `integration/backlog` antes de mergearla en `develop`. Plan y estado del trabajo en [BACKLOG_RUN.md](BACKLOG_RUN.md).

## Cómo levantar la rama

1. Worktree: `~/personal-projects/ec-worktrees/integration` (rama `integration/backlog`). Tiene su propia copia de la base en `data/dev.db` (`DATABASE_PATH=data/dev.db` en `.env.local`); tu `data/companion.db` no se toca.
2. Si querés probar con tus datos de hoy, volvé a copiar la base antes de empezar (con la app cerrada o con `better-sqlite3` `backup`).
3. `pnpm install && pnpm dev --port 3738` y abrir https://localhost:3738.

Cada sección dice qué probar y qué tendrías que ver. Marcá `[x]` lo que funciona y anotá abajo lo que no.

<!-- Las secciones se agregan a medida que se mergea cada PR. -->

## Problemas encontrados

-
