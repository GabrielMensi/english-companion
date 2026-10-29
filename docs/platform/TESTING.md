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
- **E2E (#149)**: Playwright (solo Chromium) contra `next build && next start`, con base temporal e IA falsa (`AI_FAKE=1`). `pnpm test:e2e`; en CI, `.github/workflows/e2e.yml` (nightly, a pedido y antes de cada release).
- **Cobertura (#114)**: `pnpm test:coverage`, con piso para `src/lib/**` (ver abajo).
- **Sin tests**: las rutas que faltan (`corrections`, `vocabulary`, `classification`, `insights`, `read-aloud`, `transcribe`, `tts`, `eval/*`, `sessions/[id]`), los módulos `server-only` que no pasan por esas rutas y la UI.
- **IA**: la calidad se mide aparte con los evals, que llaman a los proveedores reales y gastan free tier. No tienen umbrales: muestran números y una persona decide.
- **CI**: GitHub Actions (`.github/workflows/ci.yml`, #87) corre typecheck, lint, test (con cobertura), knip, format:check y build en cada PR a `develop` y `main` y en cada push a `develop`, con Node 22 (`.nvmrc`) y una base temporal para el build.
- **Seguridad (#138)**: `src/app/security.test.ts` recorre todos los `route.ts` (401 sin sesión y sin leer el body) y los `page.tsx` (llaman a `requirePageUser`), y comprueba los límites de body (413 y 401 antes que 413); `src/proxy.test.ts` cubre host, CSRF y el redirect a `/login`. `POST /api/transcribe` y `PUT /api/eval/asr-samples/[id]` limitan el body a 413; las demás rutas validan con zod y leen el JSON con tope (`readJson`).

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

| Archivo      | Qué da                                                                                                                                                                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai.ts`      | `fakeAi.gemini` / `fakeAi.groq` (`output`: el JSON que "escribe" el modelo; `fail`: `"quota"`, `"unavailable"` o `"unavailable-retryable"`; `calls`: pedidos recibidos) y `resetFakeAi(output)` para el `beforeEach`.                                                                                            |
| `db.ts`      | `db` y `schema` de la app, `resetDb()` (vacía las tablas entre tests), `seedSession`, `seedUserMessage`, `seedCorrection` (filas con valores por defecto, se pisan con un objeto).                                                                                                                               |
| `auth.ts`    | `createTestUser(email?)`: crea una cuenta y su sesión por Better Auth y devuelve `{ id, email, cookie, request(url, init), headers(init) }`. Toda ruta pide sesión: los tests de rutas llaman al handler con `user.request(...)`, y con `new Request(...)` a secas esperan 401. Llamarlo después de `resetDb()`. |
| `temp-db.ts` | Sin `@/db`: `tempDatabasePath()`, `makeTempDir()`/`removeTempDir()`, `openDatabase(file)` (conexión con los pragmas de la app) y el guard `assertSafeDatabasePath` (allowlist del directorio temporal).                                                                                                          |
| `setup.ts`   | El setup global descrito arriba; no se importa a mano.                                                                                                                                                                                                                                                           |

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

Pocos tests, solo de los flujos que el usuario no puede perder, en `e2e/` (configuración en `playwright.config.ts`). Hechos (#149), todos a nivel de UI (roles y textos visibles, sin tocar la base ni las queries, para que sobrevivan a cambios internos como el multiusuario):

1. Registro de la primera cuenta (proyecto `setup`: la base es nueva, así que `/signup` está abierto) y reuso de la sesión en el resto (`storageState`).
2. Chat de corrección: mandar un mensaje, ver la tarjeta con los errores y descartar uno.
3. Un mensaje que falla (la IA falsa falla una vez si el texto lleva `fail-once`; el test lo hace único por intento, para que el reintento de CI no choque) y se reintenta con _Retry_.
4. Conversación: llega la respuesta.
5. Dashboard con datos, repaso de una flashcard de errores, práctica (genera un set y abre el chat), settings.
6. Cerrar sesión (proyecto `signed-out`, el último), que las páginas redirijan a `/login` y volver a entrar.

Cada test (el registro incluido) falla si el navegador reporta una violación de la Content-Security-Policy (evento `securitypolicyviolation` y mensaje de consola, fixture automático en `e2e/fixtures.ts`): la app manda un CSP con nonce y el build de producción es donde se ve.

**Cómo corre**:

- `pnpm test:e2e` levanta, con el `webServer` de Playwright, `pnpm build` y `next start` en `127.0.0.1:3750` (`E2E_PORT` lo cambia). Es HTTP plano: la cookie de login no usa `__Secure-` fuera de un deploy, así que anda en `localhost`. La base vive en un directorio nuevo (`mkdtemp`) dentro del temporal del sistema en cada corrida (nunca `data/`), así dos corridas en paralelo no se pisan. El `webServer` fija todas las variables de entorno que la app lee (`BETTER_AUTH_*`, `TRUST_PROXY`, `ENABLE_EVAL`...), así que un `.env.local` propio no cambia el resultado. Cada corrida empieza con una base vacía. Si la corrida pasa, se borra ese directorio (un reporter, `e2e/cleanup-reporter.ts`); si falla, queda para inspeccionarlo.
- Un worker y en orden: los archivos comparten la cuenta y los datos (el dashboard y las flashcards dependen de los errores que dejó `chat.spec.ts`).
- **IA falsa**: `AI_FAKE=1` hace que `resolveModel` (`src/lib/ai/providers.ts`) devuelva un `MockLanguageModelV4` (`src/lib/ai/fake-model.ts`) en vez del proveedor. Mira el schema de salida de la llamada y responde un JSON fijo que lo cumple (corrección, plan, nivel, ejercicios por categoría y por tiempo verbal, texto libre), también en streaming, así que `analyzeMessage`, `normalizeAnalysis` y el guardado corren de verdad. El tutor falso corrige tres errores conocidos (`goed`, `childs`, `more better`); un mensaje correcto vuelve sin errores. `src/lib/ai/fake-model.test.ts` comprueba las respuestas contra los normalizadores reales. La app necesita una key configurada (`GOOGLE_GENERATIVE_AI_API_KEY=e2e-fake-key` en el `webServer`), que nunca se manda a ningún proveedor: con `AI_FAKE` el listado de modelos devuelve vacío.
- **No se puede activar fuera del E2E** (`fakeAiProblems` en `src/lib/env.ts`, con tests): hace falta siempre `E2E_TEST_SERVER=1` (solo lo pone el `webServer`, también en desarrollo), nunca vale con `ALLOWED_HOSTS` (un deploy) y `DATABASE_PATH` tiene que estar dentro del directorio temporal del sistema, así que nunca guarda correcciones falsas en `data/`. El servidor se niega a arrancar (`instrumentation.ts`) y `resolveModel` tira el mismo error.
- La voz (micrófono, Kokoro, Whisper) queda fuera: se prueba a mano.

**CI**: `.github/workflows/e2e.yml` corre nightly (`schedule`, sobre `develop`: los workflows programados corren desde la rama por defecto, `main`, y el checkout lo cambia), a pedido (`workflow_dispatch`) y antes de un release (`release.yml` lo llama con `workflow_call` y el job `release` depende de él). No corre en cada PR. Cachea el navegador de Playwright (`~/.cache/ms-playwright`, con la versión de Playwright en la clave); las librerías del sistema se instalan en cada corrida. Si falla, sube `playwright-report/` y `test-results/` (con traces) como artefacto.

Cuesta: una dependencia de desarrollo, el navegador (~150 MB en CI, cacheado) y un build por corrida (~3-5 min en total).

**Agregar un flujo**: un archivo `e2e/*.spec.ts` que importe `test` y `expect` de `./fixtures` (para tener el chequeo de CSP), apoyado en lo que ya dejaron los anteriores o creando lo suyo desde la UI. Si necesita que la IA diga algo distinto, se amplía `fake-model.ts` (y su test), no se mockea desde el navegador.

### IA real: evals

- Nunca en CI de PRs: gastan free tier y dan resultados que varían.
- Siguen manuales (`pnpm eval:*`), y antes de cambiar de modelo o de prompt.
- Con `--check`, `eval:models`, `eval:classify` y `eval:asr` imprimen PASS/FAIL por modelo contra los umbrales de `scripts/eval/thresholds.json` (puntaje y fallas en models, tipo y tiempos verbales en classify, WER y fallas en asr) y salen con código 1 si algo empeora (#117). La comparación vive en `src/lib/eval/thresholds.ts`, con tests; los números son **provisorios**: pisos holgados por debajo de los resultados registrados (README y `MODEL_INFO` para models, `ERROR_CLASSIFICATION.md` para classify, VOICE.md para asr; `gpt-oss-120b`, 81 %, tiene su propio piso de 75 en `overrides`), sin medir de nuevo. `falsePositives` y `failures` son estimaciones. Hay que calibrarlos con la próxima corrida real y subirlos al mejorar. Opcional: un workflow manual (`workflow_dispatch`) con las keys como secrets.

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
| Nightly, a pedido y antes de un release  | E2E con Playwright (`e2e.yml`; el release corre además los mismos chequeos que CI)                                          | ~5-8 min                 |
| Manual, antes de cambiar modelo o prompt | `pnpm eval:*` con proveedores reales                                                                                        | minutos, gasta free tier |

El release solo sale con el E2E en verde (`release.yml` llama a `e2e.yml`).

## Plan

En este orden (la prioridad se puede revisar con el tablero):

1. **CI en GitHub Actions** con los checks que ya existen + build. Es lo más barato y lo que más protege. Hecho en #87.
2. **Integración de rutas**: setup compartido y tests de las rutas del chat, retry, práctica, flashcards y settings/keys. Hecho en #111.
3. **Test de migraciones** con fixture de datos viejos y el check de migraciones aditivas. Hecho en #112 y #113.
4. **Cobertura** con piso para `src/lib/**`. Hecho en #114.
5. **Tests de seguridad** (auth en todas las rutas, límites de entrada), junto con #76.
6. **E2E con Playwright** y el modo de IA falsa, nightly y antes de cada release. Hecho en #149.
7. **Umbrales en los evals**.

## Test de alcance por usuario (`src/db/scoping.test.ts`)

Lee el código fuente y falla si una consulta sobre una tabla con `user_id` no nombra al dueño (`owned(` o un `userId` en el insert). Es una red barata, no una prueba: **no ve** (1) una tabla guardada en una variable (`db.delete(table)`), (2) un `join` de una tabla con dueño sobre una base sin dueño, ni (3) nada de `scripts/` (los evals son del operador y filtran a mano por la primera cuenta). Lo que cubre eso es `src/app/api/isolation.test.ts` (dos cuentas reales por todas las rutas y estadísticas): una consulta nueva de otro tipo necesita su caso ahí. El mismo archivo vigila que la tabla global vieja `settings` solo la use `secrets.ts` (`GLOBAL_SETTINGS` en `src/db/claim.ts`): una clave global nueva se declara a propósito o el claim se la daría a un usuario.
