# Calidad de código antes de desplegar

> Area: Platform · Kind: Chore · Status: Done · Board: #77

Revisión del código entero (creció feature por feature) antes de _Deploy the app_, y las reglas que tiene que mantener. Hecha sobre la rama de #72 (sin Ollama), en octubre de 2026: ~200 archivos en `src/`, 22 rutas de API, 380 tests.

**Resumen**: el código está sano. TypeScript strict sin escapes (ningún `any`, `@ts-ignore` ni `eslint-disable`), la frontera `server-only` / lógica pura se respeta en todos los módulos que tocan la base, las llamadas a la IA pasan todas por `providers.ts`, las rutas validan el body con zod y devuelven errores con la misma forma (`{ error }` + `errorToMessage`), y `pnpm build` pasa sin warnings. Lo que falta es tooling (formato, reglas más estrictas, código muerto) y algunas cosas de producción (logs del servidor, validar la configuración al arrancar).

## Qué se cambió en #77

- **Prettier** (`.prettierrc.json`: 120 columnas, comillas dobles, con `prettier-plugin-tailwindcss` para ordenar las clases) y el script `pnpm format:check`. En #77 no se formateó el código porque había ramas abiertas que un reformateo masivo habría roto; se hizo después, en #86 (ver abajo).
- **ESLint más estricto** (`eslint.config.mjs`), con reglas que usan los tipos (`projectService`):
  - Errores (el código ya las cumple): `await-thenable`, `no-unused-vars` (con `_` para ignorar), `eqeqeq` (salvo `== null`).
  - Warnings (marcaban código existente o son de estilo; desde #91 son errores, ver abajo): `no-floating-promises`, `no-misused-promises`, `no-unnecessary-type-assertion`, `switch-exhaustiveness-check`, `consistent-type-imports`, `import/no-duplicates`, `no-console` (permite `debug`, `warn` y `error`; los scripts de eval quedan afuera porque imprimir es su salida).
  - `eslint-config-prettier` apaga las reglas de estilo que pelearían con Prettier.
  - Con las reglas que usan tipos, `pnpm lint` tarda ~12 s.
- **knip** (`knip.json`, `pnpm knip`): archivos, exports y dependencias sin usar. Toma los scripts de `scripts/` como puntos de entrada (son CLIs sueltos, no los importa nadie). Ignora `src/components/ui/` (componentes de shadcn: se copian enteros y exportan de más a propósito) y los exports que se usan dentro del mismo archivo. Hoy da limpio.
- **Código muerto** (lo encontró knip): `card`, `scroll-area`, `separator` y `skeleton` de shadcn, que no usaba nadie, y `getPracticeTargets` (lo reemplazó `getPracticeSuggestions`).
- **Duplicado**: `escapeRegExp` estaba copiado en tres archivos; ahora vive en `src/lib/text.ts`.
- **Error boundaries**: no había ninguno, así que un error al renderizar dejaba la pantalla en blanco. `src/app/error.tsx` muestra "Something went wrong" con _Try again_ y deja la barra lateral para ir a otra página; `src/app/global-error.tsx` cubre un error del layout raíz (por ejemplo, que no abra la base) con una página simple, sin estilos de la app.
- CLAUDE.md: `pnpm lint` tiene que dar 0 errores y 0 warnings (desde #91) y `pnpm knip` tiene que quedar limpio.

## Reformateo con Prettier (#86)

- Todo el árbol se formateó con `pnpm exec prettier --write .` en **un solo commit**, sin otros cambios (respeta `.prettierignore`: `data/`, `drizzle/`, `public/`, `pnpm-lock.yaml`, `next-env.d.ts`).
- Script `pnpm format` (`prettier --write .`) junto a `pnpm format:check`, y `pnpm format:check` es parte de los checks en CLAUDE.md. Antes de commitear: `pnpm exec prettier --write <archivos cambiados>` (o `pnpm format`).
- `.git-blame-ignore-revs` tiene el sha de ese commit para que `git blame` lo saltee. GitHub lo usa solo; en local hay que activarlo una vez: `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Warnings de lint a error (#91)

- Los 10 warnings de promesas (`no-floating-promises` x7, `no-misused-promises` x3, en `speech.ts`, `chat-view.tsx`, `composer.tsx`, `classification-status.tsx`, `provider-card.tsx` y `settings-form.tsx`) se arreglaron caso por caso: `.catch` que muestra el error donde el usuario debería enterarse, y `void` con un comentario donde la promesa no puede fallar o se lanza sin esperar a propósito (leer la respuesta en voz alta, el polling de la clasificación, guardar una key, que ya muestran sus propios errores).
- Errores que antes se perdían en silencio y ahora se muestran: reintentar la clasificación (toast), un `onSend` que tira (se avisa y se devuelve el borrador), cancelar la grabación con Esc, y un test de proveedor que falla de forma inesperada (queda en error en vez de girar para siempre).
- Todas las reglas que eran warning pasaron a **error**: `no-floating-promises`, `no-misused-promises`, `no-unnecessary-type-assertion`, `switch-exhaustiveness-check`, `consistent-type-imports`, `import/no-duplicates` y `no-console` (con la misma lista de permitidos y los scripts de eval afuera). `pnpm lint` da 0 errores y 0 warnings.
- `no-misused-promises` sigue sin mirar los atributos de JSX (`checksVoidReturn: { attributes: false }`): un `onClick={async () => …}` no se marca, así que esos handlers tienen que atrapar sus errores por su cuenta.

## Hallazgos que quedan

### Producción

- **Sin logs en el servidor**: las rutas atrapan los errores de la IA y los devuelven como mensaje (502), pero no los registran en ningún lado. En local se ven en la UI; desplegada, un error no deja rastro. Hace falta un logger mínimo (nivel, ruta, tipo de error) que **nunca** loguee API keys ni el texto del alumno.
- **Configuración sin validar al arrancar**: `DATABASE_PATH` y `ASR_SAMPLES_DIR` se leen con un default y las keys pueden venir del entorno o de Settings. Para desplegar conviene un esquema zod de las variables de entorno que falle al arrancar con un mensaje claro. **Hecho** en #94: `src/lib/env.ts`, validado en `src/instrumentation.ts` (ver [SECURITY_REVIEW.md](SECURITY_REVIEW.md)).
- `errorToMessage` devuelve el mensaje crudo del proveedor cuando no reconoce el error. Útil en local; para desplegar, revisarlo junto con la revisión de seguridad (#76).
- `/api/transcribe` lee el body entero antes de mirar el tamaño (`MAX_BYTES`); con la app expuesta, el límite debería aplicarse antes (también para #76).

### Duplicación y archivos grandes

- ~~La validación del body se repetía en 12 rutas~~ (hecho: `parseBody` en `src/lib/request-body.ts`).
- Helpers repetidos: `humanize` (`top-mistakes.tsx`, `digest-core.ts`), `formatDate` de claves `YYYY-MM-DD` (`review-panel.tsx`, `timeline-chart.tsx`), cuatro `round` con distinta precisión. Los dos `formatDuration` y los dos `splitSentences` hacen cosas distintas a propósito (formato y criterio de corte), así que se quedan, pero convendría nombrarlos distinto.
- Archivos que piden partirse: `flashcards/review-session.tsx` (429 líneas tras sacar las caras de las tarjetas a `card-faces.tsx`; `insights/level-core.ts` y `taxonomy.ts` ya se partieron en `level-text.ts` y `subtypes.ts`), `tense-practice.ts` (427), `pronunciation-core.ts` (401), `chat/chat-view.tsx` (387), `exercise-set.ts` (379), `audio/kokoro.ts` (364), `audio/speech.ts` (332).

### Dependencias

- Ninguna dependencia sin usar (knip). `cn` y `shadcn` parecen raras pero se usan (`cn` en los componentes de UI, `shadcn/tailwind.css` en `globals.css`).
- Actualizadas en #89/#90 (ver abajo). Quedan atrasados `eslint` 10, `typescript` 7 y `@huggingface/transformers` 4, cada uno con su motivo.

## Actualización de dependencias (#89, #90)

Octubre de 2026, sobre la rama de #86. Un commit por paso para poder revertir uno solo.

- **Minors y patches**: `next` y `eslint-config-next` 16.3.8 → 16.4.0, `react`/`react-dom` 19.2.8 → 19.3.0, `ai` 7.0.116 → 7.0.137, `@ai-sdk/google` 4.0.82 → 4.0.93, `@ai-sdk/groq` 4.0.50 → 4.0.59 (los changelogs son fixes y features nuevas, nada que rompa lo que usa la app), `drizzle-orm` 0.45.3 → 0.45.4 (`pnpm db:generate` no genera migración), `radix-ui` 1.7.0, `lucide-react` 1.55.0, `zod` 4.6.6, `compromise` 14.18.0, `vitest` 5.0.3, `prettier` 3.9.10, `shadcn` 4.21.4. Los rangos sueltos (`^4`, `^19`) quedaron con la versión instalada.
- **`@types/node` 20 → 22**, el Node que se usa (vitest pedía `>= 22`).
- **TypeScript 5.9 → 6.0**: pasa typecheck, lint, tests, knip y build sin cambios.
- **`shadcn` a devDependencies**: es el CLI para agregar componentes. Lo único que usa la app es `shadcn/tailwind.css`, que Tailwind incorpora al CSS en el build, así que alcanza con que esté instalado al buildear.
- **`sharp` 0.34.5 → 0.35.5** con un override en `pnpm-workspace.yaml`: transformers.js 3.8.1 pide `^0.34`, que tiene avisos altos (libvips, libheif, librsvg). Solo lo usan sus helpers de imágenes en Node (Kokoro corre en el navegador y no lo toca); transformers.js 4 usa el mismo código con `^0.35.4`. Se probó `RawImage` (cargar un PNG y redimensionarlo) con 0.35.5. Next venía en 0.35.4 (también afectado por el aviso de librsvg); el override deja a los dos en 0.35.5. La app no usa `next/image`.

**`pnpm audit`**: antes 9 avisos (7 altos, 2 moderados); después 3 (1 alto, 2 moderados). En dependencias de producción (`--prod`) queda 1 moderado:

| Aviso                  | Severidad | Viene de                                              | Por qué queda                                                                                            |
| ---------------------- | --------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `braces` (DoS)         | Alta      | `eslint-config-next` → `fast-glob` → `micromatch`     | Solo lint; no hay versión arreglada                                                                      |
| `esbuild` (dev server) | Moderada  | `drizzle-kit` → `@esbuild-kit/*`                      | Solo `pnpm db:generate`, que no levanta el servidor de esbuild                                           |
| `sprintf-js` (DoS)     | Moderada  | transformers.js → `onnxruntime-node` → `global-agent` | No hay versión arreglada; `onnxruntime-node` no se compila (`ignoredBuiltDependencies`) ni lo usa la app |

Se arreglaron solos con los minors: `source-map-js` (Tailwind) y `@modelcontextprotocol/sdk` (shadcn 4.21.4).

**Majors que no se subieron**:

- **ESLint 10**: `eslint-config-next` 16.4 trae `eslint-plugin-react`, `eslint-plugin-import` y `eslint-plugin-jsx-a11y`, que declaran peer `eslint` hasta `^9`. Probado: `pnpm lint` corre igual (los mismos 10 warnings), pero con peers sin cumplir. Esperar a que esos plugins (o `eslint-config-next`) declaren soporte. Ojo: npm ya marca `eslint@9` como _deprecated_ (sin soporte).
- **TypeScript 7** (el compilador nativo): el paquete no trae la API de JavaScript (`typescript` exporta solo la versión y APIs `unstable/*`), así que `typescript-eslint` (peer `typescript <6.1`), el chequeo de tipos de `next build` y knip no pueden usarlo. Esperar soporte en `typescript-eslint` y Next. Se subió a 6.0, el release puente.
- **`@huggingface/transformers` 4**: `kokoro-js` 1.2.1 depende de `^3.5.1` y la app fija 3.8.1 para compartir la instancia (ver `docs/voice/VOICE.md`). Pasar a 4 implica reemplazar `kokoro-js` y probar la voz en la GPU real.

## Follow-ups

En el tablero como Backlog (Area Platform salvo que se diga otra cosa):

| Item                                                                                                     | Priority | Size | Kind    |
| -------------------------------------------------------------------------------------------------------- | -------- | ---- | ------- |
| ~~Arreglar los 10 warnings de promesas y subir esas reglas a error~~ (hecho en #91)                      | P2       | S    | Chore   |
| Logger mínimo en el servidor para los errores de las rutas (sin keys ni texto del alumno)                | P1       | S    | Feature |
| Validar las variables de entorno al arrancar (zod)                                                       | P1       | XS   | Chore   |
| ~~Helper `parseBody` para las rutas~~ (hecho)                                                            | P2       | S    | Chore   |
| ~~Partir `review-session.tsx` y los archivos grandes de lógica~~ (hecho)                                 | P2       | M    | Chore   |
| ~~Actualizar dependencias: minors, `@types/node` a 22; evaluar TypeScript 7 y ESLint 10~~ (hecho en #89) | P2       | M    | Chore   |
| Subir a ESLint 10 cuando `eslint-config-next` y sus plugins lo soporten                                  | P2       | S    | Chore   |
| Subir a TypeScript 7 cuando `typescript-eslint` y Next lo soporten                                       | P2       | S    | Chore   |
| Correr lint, knip y `format:check` en CI (parte de _Release workflow_)                                   | P1       | S    | Chore   |
