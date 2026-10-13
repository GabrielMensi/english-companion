# Calidad de código antes de desplegar

> Area: Platform · Kind: Chore · Status: Done · Board: #77

Revisión del código entero (creció feature por feature) antes de _Deploy the app_, y las reglas que tiene que mantener. Hecha sobre la rama de #72 (sin Ollama), en octubre de 2026: ~200 archivos en `src/`, 22 rutas de API, 380 tests.

**Resumen**: el código está sano. TypeScript strict sin escapes (ningún `any`, `@ts-ignore` ni `eslint-disable`), la frontera `server-only` / lógica pura se respeta en todos los módulos que tocan la base, las llamadas a la IA pasan todas por `providers.ts`, las rutas validan el body con zod y devuelven errores con la misma forma (`{ error }` + `errorToMessage`), y `pnpm build` pasa sin warnings. Lo que falta es tooling (formato, reglas más estrictas, código muerto) y algunas cosas de producción (logs del servidor, validar la configuración al arrancar).

## Qué se cambió en #77

- **Prettier** (`.prettierrc.json`: 120 columnas, comillas dobles, con `prettier-plugin-tailwindcss` para ordenar las clases) y el script `pnpm format:check`. En #77 no se formateó el código porque había ramas abiertas que un reformateo masivo habría roto; se hizo después, en #86 (ver abajo).
- **ESLint más estricto** (`eslint.config.mjs`), con reglas que usan los tipos (`projectService`):
  - Errores (el código ya las cumple): `await-thenable`, `no-unused-vars` (con `_` para ignorar), `eqeqeq` (salvo `== null`).
  - Warnings (marcan código existente o son de estilo): `no-floating-promises`, `no-misused-promises`, `no-unnecessary-type-assertion`, `switch-exhaustiveness-check`, `consistent-type-imports`, `import/no-duplicates`, `no-console` (permite `debug`, `warn` y `error`; los scripts de eval quedan afuera porque imprimir es su salida).
  - `eslint-config-prettier` apaga las reglas de estilo que pelearían con Prettier.
  - Con las reglas que usan tipos, `pnpm lint` tarda ~12 s.
- **knip** (`knip.json`, `pnpm knip`): archivos, exports y dependencias sin usar. Toma los scripts de `scripts/` como puntos de entrada (son CLIs sueltos, no los importa nadie). Ignora `src/components/ui/` (componentes de shadcn: se copian enteros y exportan de más a propósito) y los exports que se usan dentro del mismo archivo. Hoy da limpio.
- **Código muerto** (lo encontró knip): `card`, `scroll-area`, `separator` y `skeleton` de shadcn, que no usaba nadie, y `getPracticeTargets` (lo reemplazó `getPracticeSuggestions`).
- **Duplicado**: `escapeRegExp` estaba copiado en tres archivos; ahora vive en `src/lib/text.ts`.
- **Error boundaries**: no había ninguno, así que un error al renderizar dejaba la pantalla en blanco. `src/app/error.tsx` muestra "Something went wrong" con _Try again_ y deja la barra lateral para ir a otra página; `src/app/global-error.tsx` cubre un error del layout raíz (por ejemplo, que no abra la base) con una página simple, sin estilos de la app.
- CLAUDE.md: los warnings conocidos no deben crecer y `pnpm knip` tiene que quedar limpio.

## Reformateo con Prettier (#86)

- Todo el árbol se formateó con `pnpm exec prettier --write .` en **un solo commit**, sin otros cambios (respeta `.prettierignore`: `data/`, `drizzle/`, `public/`, `pnpm-lock.yaml`, `next-env.d.ts`).
- Script `pnpm format` (`prettier --write .`) junto a `pnpm format:check`, y `pnpm format:check` es parte de los checks en CLAUDE.md. Antes de commitear: `pnpm exec prettier --write <archivos cambiados>` (o `pnpm format`).
- `.git-blame-ignore-revs` tiene el sha de ese commit para que `git blame` lo saltee. GitHub lo usa solo; en local hay que activarlo una vez: `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Hallazgos que quedan

### Warnings de lint (10)

Todas son promesas que se lanzan sin esperar a propósito (fire-and-forget) en componentes de cliente; ninguna es un bug hoy, pero si la promesa falla el error se pierde en silencio:

- `src/components/audio/speech.ts:210` (`speakBrowser(...).then(finish)`)
- `src/components/chat/chat-view.tsx:214` (`speak(...)` del modo voz)
- `src/components/chat/composer.tsx:140,141,179,185` (empezar/terminar la grabación, `submit()`)
- `src/components/dashboard/classification-status.tsx:32,42` (el polling)
- `src/components/settings/provider-card.tsx:263`, `src/components/settings/settings-form.tsx:73`

Arreglo: `void` donde es intencional y `.catch` con un toast donde el usuario debería enterarse. Después, subir esas reglas a error. No se tocaron acá porque `chat-view`, `composer` y `settings` están en ramas abiertas.

### Producción

- **Sin logs en el servidor**: las rutas atrapan los errores de la IA y los devuelven como mensaje (502), pero no los registran en ningún lado. En local se ven en la UI; desplegada, un error no deja rastro. Hace falta un logger mínimo (nivel, ruta, tipo de error) que **nunca** loguee API keys ni el texto del alumno.
- **Configuración sin validar al arrancar**: `DATABASE_PATH` y `ASR_SAMPLES_DIR` se leen con un default y las keys pueden venir del entorno o de Settings. Para desplegar conviene un esquema zod de las variables de entorno que falle al arrancar con un mensaje claro.
- `errorToMessage` devuelve el mensaje crudo del proveedor cuando no reconoce el error. Útil en local; para desplegar, revisarlo junto con la revisión de seguridad (#76).
- `/api/transcribe` lee el body entero antes de mirar el tamaño (`MAX_BYTES`); con la app expuesta, el límite debería aplicarse antes (también para #76).

### Duplicación y archivos grandes

- La validación del body se repite en 12 rutas (`bodySchema.safeParse(await request.json().catch(() => null))` + 400). Un helper `parseBody(request, schema, message)` lo dejaría en una línea. Chico, pero toca todas las rutas.
- Helpers repetidos: `humanize` (`top-mistakes.tsx`, `digest-core.ts`), `formatDate` de claves `YYYY-MM-DD` (`review-panel.tsx`, `timeline-chart.tsx`), cuatro `round` con distinta precisión. Los dos `formatDuration` y los dos `splitSentences` hacen cosas distintas a propósito (formato y criterio de corte), así que se quedan, pero convendría nombrarlos distinto.
- Archivos que piden partirse: `flashcards/review-session.tsx` (648 líneas: sesión, tarjeta y controles juntos), `insights/level-core.ts` (525), `taxonomy.ts` (469, aunque es casi todo datos), `tense-practice.ts` (427), `pronunciation-core.ts` (401), `chat/chat-view.tsx` (387), `exercise-set.ts` (379), `audio/kokoro.ts` (364), `audio/speech.ts` (332).

### Dependencias

- Ninguna dependencia sin usar (knip). `cn` y `shadcn` parecen raras pero se usan (`cn` en los componentes de UI, `shadcn/tailwind.css` en `globals.css`).
- Majors atrasados: `typescript` 5 → 7, `eslint` 9 → 10 (esperar a que `eslint-config-next` lo soporte), `@huggingface/transformers` 3 → 4 (fijo en 3.8.1 por `kokoro-js`: no tocar sin probar la voz), `@types/node` 20 → debería seguir al Node que se use (22 hoy; vitest ya avisa del peer `@types/node >= 22`).
- Minors al día salvo `next` 16.3 → 16.4, `react` 19.2 → 19.3, `ai`, `radix-ui`: una actualización de rutina.

## Follow-ups

En el tablero como Backlog (Area Platform salvo que se diga otra cosa):

| Item                                                                                      | Priority | Size | Kind    |
| ----------------------------------------------------------------------------------------- | -------- | ---- | ------- |
| Arreglar los 10 warnings de promesas y subir esas reglas a error                          | P2       | S    | Chore   |
| Logger mínimo en el servidor para los errores de las rutas (sin keys ni texto del alumno) | P1       | S    | Feature |
| Validar las variables de entorno al arrancar (zod)                                        | P1       | XS   | Chore   |
| Helper `parseBody` para las rutas                                                         | P2       | S    | Chore   |
| Partir `review-session.tsx` y los archivos grandes de lógica                              | P2       | M    | Chore   |
| Actualizar dependencias: minors, `@types/node` a 22; evaluar TypeScript 7 y ESLint 10     | P2       | M    | Chore   |
| Correr lint, knip y `format:check` en CI (parte de _Release workflow_)                    | P1       | S    | Chore   |
