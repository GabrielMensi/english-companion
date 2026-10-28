# Estrategia de tests

> Area: Platform · Kind: Research · Status: Decided · Board: #78

Qué hay que testear y cómo, para poder desplegar una instancia pública (_Deploy the app_) y seguir cambiando cosas sin miedo. Va antes del deploy, junto con _Security review_ (#76), _Code quality review_ (#77) y el draft _Release workflow_.

## Decisión

- **Unit (vitest)**: se queda como está. La lógica pura vive en archivos sin `server-only` (`*-core.ts`, `analysis.ts`, `fallback.ts`...) y se testea ahí.
- **Integración (vitest, sin dependencias nuevas)**: los route handlers se llaman como funciones, con las migraciones reales sobre un SQLite temporal y los proveedores reemplazados por los modelos mock del AI SDK (`ai/test`). Corre en `pnpm test`. Hay un primer test de ejemplo: `src/app/api/sessions/[id]/messages/route.test.ts`.
- **Migraciones**: un test que aplica todas a una base vacía y a un fixture con datos de una versión vieja.
- **E2E (Playwright, solo Chromium)**: pocos flujos críticos contra `next build && next start`, con base temporal y una IA falsa. Nightly y antes de cada release, no en cada PR.
- **IA real**: nunca en CI. Los evals (`pnpm eval:*`) siguen manuales o programados, con umbrales que marquen regresiones.
- **Cobertura**: `@vitest/coverage-v8`, con un piso para `src/lib/**`, no una meta global.
- **Component tests (Testing Library + jsdom)**: no por ahora. La lógica de los componentes ya está extraída a archivos `*-core.ts`, y lo que queda (render, interacción) lo cubre mejor el E2E.
- **CI (GitHub Actions)**: en cada PR, typecheck + lint + unit/integración + cobertura + build. Nightly y antes de un release, el E2E.

## Estado actual

- **Unit**: 33 archivos y ~380 tests de vitest, todos sobre lógica pura (normalización del análisis, stats, flashcards, SRS, fallback, tiempos verbales, fluidez, nivel CEFR, preferencias de voz...). Corren en ~1 s. Están bien y se quedan.
- **Integración (#111)**: tests de rutas con base temporal e IA mockeada para mensajes (envío, reintento y errores reintentables con fake timers), reintento, práctica, flashcards (reviews y cards) y settings/keys. Setup compartido en `src/test/`.
- **Migraciones (#112, #113)**: `src/db/migrations.test.ts` (base vacía contra `schema.ts`, fixture de datos viejos, chequeo de migraciones aditivas) y `src/db/migrate.test.ts` (migrador con varias conexiones y procesos).
- **Cobertura (#114)**: `pnpm test:coverage`, con piso para `src/lib/**` (ver abajo).
- **Sin tests**: las rutas que faltan (`corrections`, `vocabulary`, `classification`, `insights`, `read-aloud`, `transcribe`, `tts`, `eval/*`, `sessions/[id]`), los módulos `server-only` que no pasan por esas rutas y la UI.
- **IA**: la calidad se mide aparte con los evals, que llaman a los proveedores reales y gastan free tier. No tienen umbrales: muestran números y una persona decide.
- **CI**: GitHub Actions (`.github/workflows/ci.yml`, #87) corre typecheck, lint, test (con cobertura), knip, format:check y build en cada PR a `develop` y `main` y en cada push a `develop`, con Node 22 (`.nvmrc`) y una base temporal para el build.
- **Seguridad**: hoy no hay auth (la app es local). `POST /api/transcribe` y `PUT /api/eval/asr-samples/[id]` leen el body entero sin límite de tamaño. Las demás rutas validan con zod y casi todas limitan largos.

## Las capas

### Unit: lógica pura

Sigue la regla de `CLAUDE.md`: la lógica pura va en archivos sin `server-only`, con su `*.test.ts` al lado. Cuando una función con lógica interesante vive en un módulo `server-only`, se extrae a un `*-core.ts` antes de testearla, como ya se hizo con stats, flashcards y tiempos verbales.

### Integración: rutas + base + IA mockeada

Es la capa que más falta y la que más protege antes del deploy: cubre lo que une las piezas (validación de la request, queries de Drizzle, migraciones, transacciones, la cadena de fallback, el stream NDJSON) sin levantar un servidor.

**Cómo** (ejemplo completo: `src/app/api/sessions/[id]/messages/route.test.ts`; los demás están al lado de cada `route.ts`):

- El route handler se importa y se llama con un `Request` y `{ params: Promise.resolve({ id }) }`. No hace falta levantar Next. Los imports del handler van con `await import(...)` o estáticos, da igual: el setup ya corrió.
- **Setup compartido** (`src/test/setup.ts`, `setupFiles` de vitest, corre antes de cada archivo): crea una base temporal por archivo y apunta `DATABASE_PATH` a ella, pone keys falsas, mockea `server-only` y reemplaza `@ai-sdk/google` y `@ai-sdk/groq` por modelos mock. `@/db` aplica las migraciones reales al abrirla. Al terminar cierra la conexión y borra el directorio.
- **Guard** (allowlist): la base tiene que vivir dentro del directorio temporal del sistema (`fs.realpathSync(os.tmpdir())`, resolviendo symlinks y `..`); cualquier otra ruta (`data/companion.db`, `data/dev.db`, la carpeta de la app en uso por path absoluto) tira un error (`assertSafeDatabasePath`). Se verifica en el setup, y sobre la conexión realmente abierta (`globalThis.__sqlite.name`) en `@/db` de los helpers, en `resetDb` y en un `beforeAll` del setup. Nunca se toca una base real.
- **IA**: solo se reemplaza el borde (el cliente HTTP del proveedor), así que `resolveModel`, `withFallback`, `analyzeMessage`, el streaming y `normalizeAnalysis` corren de verdad.

**Helpers** (`src/test/`, pensados para que los equipos siguientes — auth, multiusuario — los extiendan en vez de copiar):

| Archivo      | Qué da                                                                                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai.ts`      | `fakeAi.gemini` / `fakeAi.groq` (`output`: el JSON que "escribe" el modelo; `fail`: `"quota"`, `"unavailable"` o `"unavailable-retryable"`; `calls`: pedidos recibidos) y `resetFakeAi(output)` para el `beforeEach`. |
| `db.ts`      | `db` y `schema` de la app, `resetDb()` (vacía las tablas entre tests), `seedSession`, `seedUserMessage`, `seedCorrection` (filas con valores por defecto, se pisan con un objeto).                                    |
| `temp-db.ts` | Sin `@/db`: `tempDatabasePath()`, `makeTempDir()`/`removeTempDir()`, `openDatabase(file)` (conexión con los pragmas de la app) y el guard `assertSafeDatabasePath` (allowlist del directorio temporal).               |
| `setup.ts`   | El setup global descrito arriba; no se importa a mano.                                                                                                                                                                |

Un test nuevo de ruta es casi siempre: `beforeEach(() => { resetDb(); resetFakeAi(salida); })`, sembrar filas con `seed*`, llamar al handler y mirar la respuesta y `db`. Si hace falta otro proveedor o un modo de fallo nuevo, se agrega en `ai.ts`.

**Lo que aprendimos con el ejemplo**:

- Un error de proveedor _reintentable_ (429, 503) hace que el último modelo de la cadena reintente con backoff y el test tarde segundos o haga timeout. `fail: "quota"` y `"unavailable"` tiran un `APICallError` no reintentable y el test termina al toque; `"unavailable-retryable"` ejercita el reintento: usar `vi.useFakeTimers()` y `vi.advanceTimersByTimeAsync(30_000)` (no `runAllTimersAsync`, que dispararía también el timer de 5 minutos de la clasificación diferida). Ver el test "retries a retryable error on the last provider".
- `@/db` guarda la conexión en `globalThis.__sqlite` (para el hot reload). El setup la cierra y la borra en `afterAll`, para que otro archivo en el mismo worker no reuse una base ajena.
- `withChatPriority` deja un timer de 5 minutos para la clasificación diferida. No molesta (vitest cierra el worker), pero un test de la clasificación tiene que usar fake timers.
- Corre en menos de un segundo, así que va en `pnpm test` con los unit. No hace falta separar comandos.

**Qué cubrir** (por prioridad): mandar un mensaje y reintentar, práctica, flashcards, settings y keys (la key nunca vuelve entera) — hecho; falta corrections y vocabulary, y la clasificación diferida (`classification`, con fake timers).

### Migraciones

Las migraciones se aplican solas al arrancar sobre la base real del usuario, así que un error ahí rompe la app con datos. El migrador vive en `src/db/migrate.ts` (sin `server-only`, para poder testearlo) y los tests en `src/db/`:

1. **Base vacía** (`migrations.test.ts`): aplica todas, verifica que cada una quede registrada, que el esquema resultante coincida con `schema.ts` (tablas, columnas, NOT NULL y claves primarias) y que aplicar de nuevo no haga nada.
2. **Datos viejos** (`migrations.test.ts`): se arma la base con las migraciones hasta `0005_tense_counts` (copia de `drizzle/` con el journal recortado), se insertan filas representativas (chat, mensajes, correcciones clasificadas y sin clasificar, vocabulario, settings), se aplican las migraciones actuales encima y se verifica que no se pierda ninguna fila, que los valores viejos sigan igual, que las columnas nuevas tengan sus defaults y que el `ON DELETE CASCADE` funcione. Cuando una migración agregue un backfill, se suma un caso con filas que lo ejerciten.
3. **Migraciones aditivas** (`migrations.test.ts`): ninguna migración posterior al fixture puede tener `DROP TABLE`, `DROP COLUMN`, `RENAME`, `DELETE FROM` ni `ADD ... NOT NULL` sin `DEFAULT`. Si de verdad hace falta, se marca con un comentario `-- allow-destructive: <motivo>` dentro del statement (el trozo de SQL entre `--> statement-breakpoint`); la marca vale solo para ese statement. **Ojo con la reconstrucción de tablas de drizzle-kit** (`__new_x`, `INSERT ... SELECT`, `DROP TABLE`, `RENAME`), que la regla siempre marca: `migrate()` corre todo en una transacción con `foreign_keys = ON`, donde `PRAGMA foreign_keys=OFF` se ignora, así que el `DROP TABLE` borra en cascada las filas hijas (por ejemplo, reconstruir `messages` borra sus correcciones). Preferir `ALTER TABLE ... ADD` o una tabla nueva; si no hay otra, escribir la migración a mano y probarla con datos en el fixture. Al subir el fixture a una versión más nueva, se actualiza `FIXTURE_LAST_TAG`.
4. **Concurrencia** (`migrate.test.ts`): una conexión con el lock de escritura bloquea a la otra sin dejar nada a medias; una segunda conexión después de la primera no encuentra nada pendiente; y cuatro procesos (`src/test/migrate-worker.ts`, con `tsx`) migran la misma base a la vez sin errores ni filas duplicadas en `__drizzle_migrations`. También verifica que la conexión reusada tras un hot reload recibe el `busy_timeout` de 30 s.

### E2E: Playwright

Pocos tests, solo de los flujos que el usuario no puede perder:

1. Crear un chat, mandar un mensaje y ver la corrección (modo corrección y modo conversación).
2. Un mensaje que falla y se reintenta.
3. Empezar una práctica desde el dashboard.
4. Repasar flashcards.
5. Guardar settings y una API key (que se vea enmascarada).
6. Que el dashboard e Insights carguen con datos.

**Cómo**: `@playwright/test` con solo Chromium, contra `next build && next start` (lo que recomienda la guía de Next) en otro puerto, con `DATABASE_PATH` temporal. La IA no se puede mockear con `vi.mock` porque corre en otro proceso: la opción más simple es un modo falso en `src/lib/ai/providers.ts` (por ejemplo `AI_FAKE=1`) donde `resolveModel` devuelve un `MockLanguageModelV4` con respuestas fijas. Queda detrás de `resolveModel`, como pide `CLAUDE.md`, y no se activa sin la variable. La voz (micrófono, Kokoro, Whisper) queda fuera: se prueba a mano.

Cuesta: una dependencia de desarrollo, los navegadores (~150 MB en CI, cacheables) y un build por corrida. Por eso no va en cada PR.

### IA real: evals

- Nunca en CI de PRs: gastan free tier y dan resultados que varían.
- Siguen manuales (`pnpm eval:*`), y antes de cambiar de modelo o de prompt.
- Agregarles umbrales (por ejemplo, F1 de errores en `eval:models`, acierto del clasificador en `eval:classify`) para que salgan con código distinto de 0 cuando algo empeora contra el último resultado guardado. Opcional: un workflow manual (`workflow_dispatch`) con las keys como secrets.

### Seguridad como tests de regresión

Cuando _Security review_ (#76) agregue auth:

- Un test que recorra **todos** los `route.ts` de `src/app/api/` (glob) y verifique que sin sesión responden 401. Así una ruta nueva sin auth falla sola, sin acordarse de agregarla.
- Límites de entrada: un caso por ruta con body de más (texto, audio). Primero hay que agregar el límite a `transcribe` y `eval/asr-samples`.
- Las rutas de `eval/` no deberían existir en la instancia pública: un test que lo verifique cuando se decida cómo apagarlas.

### Cobertura

- `@vitest/coverage-v8` (misma versión mayor que vitest) y `pnpm test:coverage`, que corre los mismos tests con cobertura. `pnpm test` queda sin cobertura, más rápido. CI corre `pnpm test:coverage` en lugar de `pnpm test` (cuesta ~1 s más).
- Piso solo para `src/lib/**` (`coverage.thresholds` en `vitest.config.ts`); sin meta global: la UI y las rutas se cubren con E2E e integración, y una meta global empuja a tests que no aportan.
- Línea base medida al agregarlo (2026-10-28): statements 80,8 %, branches 76,1 %, functions 76,4 %, lines 81,5 %. Piso: 78 / 73 / 73 / 78. Se sube de a poco cuando la cobertura crece; no se baja para que pase un PR.

## Qué corre dónde

| Cuándo                                   | Qué                                                                                                                         | Tiempo aprox.            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Cada PR y push a `develop`               | `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` (unit + integración + migraciones, con piso de cobertura), `pnpm build` | ~2-3 min                 |
| Nightly y antes de un release            | Lo anterior + E2E con Playwright                                                                                            | ~5-8 min                 |
| Manual, antes de cambiar modelo o prompt | `pnpm eval:*` con proveedores reales                                                                                        | minutos, gasta free tier |

Esto se engancha con el draft _Release workflow_: el release solo sale con el E2E en verde.

## Plan

En este orden (la prioridad se puede revisar con el tablero):

1. **CI en GitHub Actions** con los checks que ya existen + build. Es lo más barato y lo que más protege. Hecho en #87.
2. **Integración de rutas**: setup compartido y tests de las rutas del chat, retry, práctica, flashcards y settings/keys. Hecho en #111.
3. **Test de migraciones** con fixture de datos viejos y el check de migraciones aditivas. Hecho en #112 y #113.
4. **Cobertura** con piso para `src/lib/**`. Hecho en #114.
5. **Tests de seguridad** (auth en todas las rutas, límites de entrada), junto con #76.
6. **E2E con Playwright** y el modo de IA falsa, nightly y antes de cada release.
7. **Umbrales en los evals**.
