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
- **Sin tests**: los 22 route handlers de `src/app/api/`, los 23 módulos `server-only` de `src/lib/` (los que tocan la base o llaman a la IA: `chat.ts`, `classification.ts`, `flashcards.ts`, `practice.ts`, `settings.ts`, `secrets.ts`, `stats.ts`...), las 12 migraciones de `drizzle/` y la UI.
- **IA**: la calidad se mide aparte con los evals, que llaman a los proveedores reales y gastan free tier. No tienen umbrales: muestran números y una persona decide.
- **CI**: GitHub Actions (`.github/workflows/ci.yml`, #87) corre typecheck, lint, test, knip, format:check y build en cada PR a `develop` y `main` y en cada push a `develop`, con Node 22 (`.nvmrc`) y una base temporal para el build. La cobertura todavía no.
- **Seguridad**: hoy no hay auth (la app es local). `POST /api/transcribe` y `PUT /api/eval/asr-samples/[id]` leen el body entero sin límite de tamaño. Las demás rutas validan con zod y casi todas limitan largos.

## Las capas

### Unit: lógica pura

Sigue la regla de `CLAUDE.md`: la lógica pura va en archivos sin `server-only`, con su `*.test.ts` al lado. Cuando una función con lógica interesante vive en un módulo `server-only`, se extrae a un `*-core.ts` antes de testearla, como ya se hizo con stats, flashcards y tiempos verbales.

### Integración: rutas + base + IA mockeada

Es la capa que más falta y la que más protege antes del deploy: cubre lo que une las piezas (validación de la request, queries de Drizzle, migraciones, transacciones, la cadena de fallback, el stream NDJSON) sin levantar un servidor.

**Cómo** (ver el test de ejemplo):

- El route handler se importa y se llama con un `Request` y `{ params: Promise.resolve({ id }) }`. No hace falta levantar Next.
- **Base**: `DATABASE_PATH` apunta a un archivo en un directorio temporal, y se setea en `vi.hoisted` porque `@/db` lo lee al importarse. `@/db` aplica las migraciones al abrirla, así que cada archivo de test arranca con el esquema real. Nunca `data/companion.db` ni `data/dev.db`.
- **IA**: se mockean `@ai-sdk/google` y `@ai-sdk/groq` para que devuelvan un `MockLanguageModelV4` de `ai/test`. Se reemplaza solo el borde (el cliente HTTP del proveedor), así que `resolveModel`, `withFallback`, `analyzeMessage`, el streaming y `normalizeAnalysis` corren de verdad. Las keys se ponen como variables de entorno falsas.
- **`server-only`**: se mockea con `vi.mock("server-only", () => ({}))`.

**Lo que aprendimos con el ejemplo**:

- Un error de proveedor _reintentable_ (429, 503) hace que el último modelo de la cadena reintente con backoff y el test tarde segundos o haga timeout. Los mocks tiran `APICallError` con `isRetryable: false`.
- `@/db` guarda la conexión en `globalThis.__sqlite` (para el hot reload). El test la cierra y la borra en `afterAll`, para que otro archivo en el mismo worker no reuse una base ajena.
- `withChatPriority` deja un timer de 5 minutos para la clasificación diferida. No molesta (vitest cierra el worker), pero un test de la clasificación tiene que usar fake timers.
- Corre en menos de un segundo, así que va en `pnpm test` con los unit. No hace falta separar comandos.

**Cuando haya un segundo test de integración**: pasar el mock de `server-only` y la base temporal a un `setupFiles` compartido (`src/test/`) y dejar en cada test solo los mocks de IA.

**Qué cubrir** (por prioridad): mandar un mensaje y reintentar (`messages`, `retry`), práctica (`practice`), flashcards (`cards`, `reviews`), settings y keys (`settings`, `settings/keys`: que la key nunca vuelva entera), corrections y vocabulary, y la clasificación diferida (`classification`).

### Migraciones

Las migraciones se aplican solas al arrancar sobre la base real del usuario, así que un error ahí rompe la app con datos. Dos tests:

1. **Base vacía**: aplica todas las migraciones y compara el esquema resultante con `schema.ts` (cubierto en parte por el test de integración, que ya las aplica).
2. **Fixture con datos viejos**: un `.sql` chico con filas creadas por una versión vieja del esquema (sesiones, mensajes con correcciones, vocabulario, flashcards). Se aplican las migraciones nuevas encima y se verifica que no se pierdan filas y que las columnas nuevas tengan sus defaults. Cuando una migración agregue un backfill, se suma un caso.

Además, un check barato: que ningún `.sql` nuevo de `drizzle/` tenga `DROP COLUMN`, `DROP TABLE` o `RENAME` sin una marca explícita, porque los cambios tienen que ser aditivos.

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
- Con `--check`, `eval:models`, `eval:classify` y `eval:asr` imprimen PASS/FAIL por modelo contra los umbrales de `scripts/eval/thresholds.json` (puntaje y fallas en models, tipo y tiempos verbales en classify, WER y fallas en asr) y salen con código 1 si algo empeora (#117). La comparación vive en `src/lib/eval/thresholds.ts`, con tests; los números son pisos holgados sobre las últimas corridas buenas: subirlos al mejorar. Opcional: un workflow manual (`workflow_dispatch`) con las keys como secrets.

### Seguridad como tests de regresión

Cuando _Security review_ (#76) agregue auth:

- Un test que recorra **todos** los `route.ts` de `src/app/api/` (glob) y verifique que sin sesión responden 401. Así una ruta nueva sin auth falla sola, sin acordarse de agregarla.
- Límites de entrada: un caso por ruta con body de más (texto, audio). Primero hay que agregar el límite a `transcribe` y `eval/asr-samples`.
- Las rutas de `eval/` no deberían existir en la instancia pública: un test que lo verifique cuando se decida cómo apagarlas.

### Cobertura

- `@vitest/coverage-v8` y `pnpm test:coverage`.
- Piso solo para `src/lib/**` (thresholds por glob de vitest), arrancando un par de puntos debajo de lo que se mida al agregarlo y subiéndolo de a poco. Sin meta global: la UI y las rutas se cubren con E2E e integración, y una meta global empuja a tests que no aportan.
- No se midió en esta investigación porque requiere la dependencia.

## Qué corre dónde

| Cuándo                                   | Qué                                                                                                             | Tiempo aprox.            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Cada PR y push a `develop`               | `pnpm typecheck`, `pnpm lint`, `pnpm test` (unit + integración + migraciones), cobertura con piso, `pnpm build` | ~2-3 min                 |
| Nightly y antes de un release            | Lo anterior + E2E con Playwright                                                                                | ~5-8 min                 |
| Manual, antes de cambiar modelo o prompt | `pnpm eval:*` con proveedores reales                                                                            | minutos, gasta free tier |

Esto se engancha con el draft _Release workflow_: el release solo sale con el E2E en verde.

## Plan

En este orden (la prioridad se puede revisar con el tablero):

1. **CI en GitHub Actions** con los checks que ya existen + build. Es lo más barato y lo que más protege. Hecho en #87.
2. **Integración de rutas**: setup compartido y tests de las rutas del chat, retry, práctica, flashcards y settings/keys.
3. **Test de migraciones** con fixture de datos viejos y el check de migraciones aditivas.
4. **Cobertura** con piso para `src/lib/**`.
5. **Tests de seguridad** (auth en todas las rutas, límites de entrada), junto con #76.
6. **E2E con Playwright** y el modo de IA falsa, nightly y antes de cada release.
7. **Umbrales en los evals**.
