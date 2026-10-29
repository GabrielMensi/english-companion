# Clases: reporte para llevar, correcciones del profesor y su nivel

> Area: Class & textbook · Kind: Feature · Status: In progress · Board: #158, #159, #160

Estado (2026-10-29): implementado en la rama `team/class`, pendiente de la prueba manual. Cubre las secciones 1 y 3 de [ROADMAP.md](../ROADMAP.md#integración-con-las-clases) y el nivel del profesor de [LEVEL_CALIBRATION.md](../progress/LEVEL_CALIBRATION.md).

## Qué hay

Una página **Class** (`/class`, en el grupo Review de la barra lateral) con:

- **Clases**: fecha y hora de cada clase, nivel CEFR que dio el profesor (opcional, editable) y notas. Es la tabla `class_sessions` (`user_id`, `held_at`, `teacher_level`, `notes`, `chat_session_id`), por usuario y con índice `(user_id, held_at)`.
- **Reporte para llevar** (`/class/report`, #158).
- **Cargar las correcciones del profesor** (#159).
- **Nivel del profesor** (#160): se muestra junto a la estimación de la app en Insights.

## Reporte para llevar a clase (#158)

- Período por defecto: **desde la última clase que ya pasó** (`resolveReportPeriod`, en `src/lib/class-core.ts`). Se puede elegir otra clase de la que partir o dos fechas (`?since=<id>` o `?from=YYYY-MM-DD&to=YYYY-MM-DD`). Sin clases, los últimos 7 días.
- Usa el mismo digest que Insights (`buildDigest`, `getPeriodData` en `src/lib/stats.ts`, que es lo que ya usa `getDashboardData`), con el período anterior de igual largo para las tendencias: errores más repetidos con ejemplos reales, áreas que empeoraron o mejoraron, tiempos verbales, palabras buscadas con `[corchetes]`.
- **No incluye lo que cargó el profesor** (`withoutClass`): el profesor ya lo sabe; el reporte es sobre lo que escribiste vos. Tampoco incluye pronunciación (es de escritura).
- Párrafo opcional de la IA, "qué preguntarle al profesor" (3 a 5 preguntas en inglés para decir en voz alta, con el porqué en el idioma de explicación). Va detrás de `providers.ts` (`generateObject`, schema plano, temperatura 0.4), no es de chat, así que no usa `withChatPriority`. Se guarda en `user_settings` (clave `class-report-questions`) con una clave del período y la cantidad de errores: si cambian, se consideran viejas y no se muestran.
- Imprimible: botón "Print / save as PDF" y CSS `@media print` (sin barra lateral, la página fluye). Exporta Markdown: botón copiar y `GET /api/class/report?since=…` (descarga `.md`) con el nivel de la app y del profesor y las preguntas.

## Correcciones del profesor (#159)

Flujo: en una clase, "Load the teacher's corrections" → pegar las notas en texto libre → **Structure with AI** → revisar (se puede quitar cada ítem) → **Save as "From class"**. La estructuración (`structureClassNotes`) usa **la misma taxonomía fija** (`ERROR_CATEGORIES` en el schema y en el prompt, con los mismos `CATEGORY_HINTS`); el modelo no puede inventar categorías y el servidor valida de nuevo lo que vuelve del navegador. Las palabras nuevas son pares español → inglés como cualquier búsqueda con corchetes.

Columna `source` (aditiva, con default): `corrections.source` = `"ai"` | `"class"`, `vocabulary.source` = `"app"` | `"class"`. La UI lo muestra con el badge **From class**: lista de errores del dashboard, Vocabulary, la clase en `/class` y las flashcards de errores.

### Cómo se enlazan (decisión)

`corrections.message_id` y `vocabulary.message_id` son obligatorios, y las estadísticas salen de mensajes + correcciones. En lugar de tablas paralelas (que obligarían a tocar cada estadística, el clasificador y las flashcards), **cada carga es un mensaje del usuario en un chat oculto** (`sessions.mode = "class"`, uno por clase, `class_sessions.chat_session_id`):

- El chat oculto no aparece en la barra lateral ni se puede abrir ni escribir (`listSessions` y `getSession` lo excluyen). Borrar la clase borra el chat y todo lo cargado.
- `created_at` del mensaje, las correcciones y las palabras es la **fecha de la clase**, así caen en el período correcto del dashboard (y se mueven si se cambia la fecha de la clase).
- Las correcciones entran con `classification = "pending"`: el clasificador diferido les asigna el tipo fino y el tiempo verbal como a las de la IA. Cuentan en las estadísticas, el diagnóstico de tiempos y las flashcards de errores; las palabras, en Vocabulary y en las flashcards de vocabulario.
- El mensaje es "lo que dijiste": `content` son los fragmentos originales y `corrected_text` los corregidos (una línea cada uno), así el conteo de tiempos y la oración de la tarjeta funcionan sin código especial. No tiene enlace a un chat: las tarjetas y Vocabulary no muestran el ícono "Open chat" para lo que viene de clase.
- `input_mode` es `typed`: el profesor puede corregir ortografía o puntuación y no es dictado por reconocimiento de voz, así que `countsInStats` no filtra esas categorías.

### Palabras (denominador de "cada 100 palabras")

El profesor corrige oraciones que dijiste, pero no se sabe cuántas palabras hablaste. Sumar errores sin palabras inflaría la tasa del dashboard y el nivel CEFR. Decisión: `message.word_count` = lo que el usuario indique en "About how many words did you speak?" (opcional) o, si lo deja vacío, **12 palabras por corrección** (`WORDS_PER_CLASS_CORRECTION`, una oración corta por corrección). Es una aproximación: la tasa de los errores de clase es alta por construcción (solo se cargan las oraciones corregidas). Una carga con solo palabras tiene `word_count = 0` y no cuenta como mensaje (ni como "mensaje sin errores").

## Nivel del profesor (#160)

`class_sessions.teacher_level` (A1–C2). `getLevelData` agrega `teacher` (el último nivel dado, con su fecha) y `compareWithTeacher` dice a cuántos niveles está la estimación. La tarjeta de nivel de Insights lo muestra debajo de la estimación ("Your teacher's level on …: B1 · The app's estimate is one level above the teacher's") y el reporte lo incluye. **No cambia la estimación**: es contexto para calibrar contra el profesor con chat real, lo que [LEVEL_CALIBRATION.md](../progress/LEVEL_CALIBRATION.md) dejaba bloqueado.

## Dónde está

- Schema y migración: `src/db/schema.ts` (`classSessions`, `source`), `drizzle/0016_*.sql` (aditiva).
- Lógica pura (con tests): `src/lib/class-core.ts`. Servidor: `src/lib/class.ts`, `src/lib/class-report.ts`, `src/lib/ai/class.ts`.
- Rutas: `/api/class`, `/api/class/[id]`, `/api/class/[id]/parse` y `/items`, `/api/class/report` y `/report/questions` (todas con `withUser`).
- Páginas y componentes: `src/app/class/`, `src/components/class/`, `src/components/class-badge.tsx`.
- Tests: `src/lib/class-core.test.ts` y `src/app/api/class.test.ts` (rutas, estadísticas, flashcards, reporte, aislamiento entre dos cuentas).

## Pendiente

- Tareas sin spoilers y transcripción de la clase (secciones 4 y 5 del roadmap).
- Asociar las correcciones del profesor con las de la IA del mismo texto para compararlas (sección 4).
