# Roadmap

## Hecho (v0.1)

- Chat por sesiones (modos corrección y conversación) con historial en SQLite.
- Corrección estructurada: diff, errores con categoría fija, gravedad y explicación.
- Tolerancia a typos (gravedad `typo`, excluida de las estadísticas por defecto).
- "Cómo lo diría un nativo" y escape al español con `[corchetes]` → vocabulario.
- Convertir un mensaje corregido en prompt estructurado.
- Dashboard: errores cada 100 palabras, evolución, áreas a trabajar, tendencias, errores frecuentes.
- Providers: Gemini y Groq (free tier), con API keys configurables desde la app. Ollama (local) estuvo hasta #72 ([LOCAL_MODELS.md](ai/LOCAL_MODELS.md)).
- Página Vocabulary y panel en el dashboard con las palabras buscadas entre [corchetes].
- Set de evaluación de modelos (`pnpm eval:models`) y timeouts por request.
- Selector de modelo en el chat, modelo registrado en cada respuesta y fallback automático entre modelos configurados.
- Clasificación diferida de errores: tipos fijos por categoría, tiempo verbal que correspondía y que se usó, "Wrong type?" para corregirlo a mano y `pnpm eval:classify` ([ERROR_CLASSIFICATION.md](ai/ERROR_CLASSIFICATION.md)).
- Diagnóstico de tiempos verbales: precisión por tiempo, errores de uso vs forma, confusiones y tiempos poco usados ([VERB_TENSES.md](practice/VERB_TENSES.md)).
- Rediseño de Configuración: una tarjeta por proveedor (key, modelo, prueba y estado) editable sin cambiar el principal, una "cadena de modelos" que se puede reordenar y desactivar, guardado automático y puntaje, velocidad y límite gratis de cada modelo.
- Nivel `suggestion` para mejoras opcionales (contracciones, puntuación opcional), que no cuentan como errores, y tiempo de respuesta en cada mensaje.
- Ventana flotante (Document Picture-in-Picture, como Google Meet): composer con dictado, última corrección y "Copy & close" siempre visibles sobre otras apps; el botón "Native" muestra u oculta cómo lo diría un nativo (se recuerda en el navegador). Se abre con el botón del chat o Alt+P, y sola al cambiar de pestaña mientras dictás (por eso `pnpm dev` usa HTTPS).
- Voz, fase 2: botones ▶ para escuchar correcciones, versión nativa, vocabulario y respuestas; push-to-talk con Ctrl+Space; modo voz en conversación (manda al soltar y lee la respuesta); métricas de fluidez (ritmo, pausas largas, muletillas) por mensaje y en el dashboard. También en la ventana flotante ([VOICE.md](voice/VOICE.md)).
- Streaming de la corrección: se ve mientras se genera (en el chat y en la ventana flotante); lo que se guarda sale siempre del objeto completo y validado.
- Práctica de tiempos verbales (página Practice): ejercicios de contraste, de forma y "usalo" generados para los tiempos más flojos, y conversación dirigida que obliga a usarlos. Las respuestas se corrigen y suman a las estadísticas ([VERB_TENSES.md](practice/VERB_TENSES.md#práctica)).
- Flashcards (página Flashcards): vocabulario español → inglés y repaso espaciado de tus errores reales con un algoritmo tipo SM-2 (tabla `reviews`), filtrable por tiempo verbal o tipo de error.
- Insights: reporte de la semana o del mes, plan de estudio escrito por la IA (exportable en Markdown, base para el reporte de clase) y nivel CEFR estimado con reglas fijas y transparentes.
- Flashcards, mantenimiento: suspender o borrar tarjetas, limpieza de repasos huérfanos, el tipo de error pasa a ser una pista y "nuevas por sesión" configurable. Panel de repasos en el dashboard (retención, repasos por día, racha, pendientes) con la tabla `review_log`.
- Nivel CEFR calibrado con ~3.300 textos de Write & Improve corregidos por Cambridge (`pnpm eval:level`): coincidencia exacta del 20% al 59% y siempre a ±1 nivel con 1.000 palabras ([LEVEL_CALIBRATION.md](progress/LEVEL_CALIBRATION.md)).
- Ejercicios dirigidos (página Practice, "Your weakest areas"): sets de completar huecos, elegir opción y corregir el error generados a partir de las 3 categorías más flojas y de tus errores reales; las respuestas se corrigen y suman a las estadísticas.
- Mazo **Missed exercises** en Flashcards: los ítems fallados de los ejercicios (tiempos y categorías) vuelven con repaso espaciado.
- Kokoro-82M como voz local opcional (Settings → Listening), en el navegador con `kokoro-js`; en CPU (WASM) anda bien y rápido. En WebGPU todavía no (bug #45), y cae al CPU o a la voz del navegador.
- UI, fase 1 ([UI-PLAN.md](ui/UI-PLAN.md)): Hanken Grotesk para la app y Newsreader para tu inglés, escala tipográfica, colores de área (Write, Review, Train) separados de los colores de datos, estructura de página compartida y un solo vocabulario de estados.
- Botón de copiar en "Cómo lo diría un nativo", en el chat y en la ventana flotante (#69).
- UI, fase 2: sidebar agrupada en Review, Train y Chats, con íconos por área, un ícono por tipo de chat (corrección, conversación, práctica), tarjetas pendientes en Flashcards y Settings abajo.
- UI, fase 3: tarjeta de corrección con números de referencia entre el texto y cada error, versión nativa arriba, errores agrupados por categoría y ordenados por gravedad, typos y sugerencias plegados; en el header, Correction / Conversation como switch y un menú para el modelo y la ventana flotante.
- UI, fase 4: página Today en lugar de la home: qué hacer hoy en una frase, seguir el último chat, la semana en números y las sugerencias de Train (tarjetas, tiempo verbal, tipo de error y el sonido más flojo de Read aloud).
- UI, fases 5 y 6: dashboard con titular en una frase y "Practice this" por área, detalles agrupados; Practice y Flashcards con jerarquía sección → ítem; foco visible en todos los controles, `prefers-reduced-motion` y contraste AA revisado en los dos temas.
- Voz, fase 3: página Read aloud (#56, #60): leés una oración y las palabras que Whisper escucha distinto se clasifican sin IA, comparando fonemas con el CMU Pronouncing Dictionary, con una taxonomía fija de pronunciación para hispanohablantes, oraciones de pares mínimos por sonido, de tus correcciones y de tu vocabulario, y el panel "Sounds to work on". `?focus=<sonido>` abre la página en un sonido ([VOICE.md](voice/VOICE.md)).
- Mazo **Hard to say** en Flashcards (#65): las oraciones leídas en voz alta con palabras escuchadas distinto vuelven con repaso espaciado; se responden leyéndolas, con el mismo puntaje que Read aloud y la nota sugerida por la lectura ([VOICE.md](voice/VOICE.md)).
- Solo APIs (#72): se sacaron los modelos locales (Ollama); la cadena es Gemini → Groq y sin ninguna API key la app lo avisa en el chat. Tag `archive/local-models-ollama` para volver ([LOCAL_MODELS.md](ai/LOCAL_MODELS.md)).
- Panel de pronunciación en el dashboard (#73): porcentaje de palabras escuchadas como están escritas, sonidos cada 100 palabras leídas con tendencia contra el período anterior y link a Read aloud con ese sonido.
- Clases (#158, #159, #160): página Class con las clases del profesor y su nivel CEFR, reporte imprimible y exportable para llevar ("desde la última clase", sin lo que cargó el profesor, con preguntas sugeridas por la IA) y correcciones y palabras del profesor como fuente "From class" que cuentan en las estadísticas y las flashcards ([CLASS_REPORT.md](class/CLASS_REPORT.md)).
- Insights (#75): el reporte muestra las áreas flojas con tasa, cantidad de errores y tipos como chips, sin cadenas "A · B · C".
- Conversaciones sobre un tema (#71): "Talk about…" con 5 temas (entrevista de SWE, entrevista técnica, tecnología e IA, daily stand-up, small talk y viajes) o uno propio; la corrección y las estadísticas son las de siempre.
- Investigación de pronunciación con modelos de audio (#74): wav2vec2 de fonemas en CPU para la schwa y las formas débiles; el acento por Gemini se descartó ([PRONUNCIATION_AUDIO.md](voice/PRONUNCIATION_AUDIO.md)).
- Chequeo de sonidos en Read aloud (beta, #132, #133): wav2vec2 de fonemas en CPU marca vocales débiles dichas plenas (`schwa_reduction`, sin contar en estadísticas) y confirma o anota los problemas de th, b/v y vocales; acento de palabra por prosodia (#134) y wav2vec2 en el navegador (#135) medidos, sin función por ahora; script y guía para el eval con grabaciones reales (#136), pendiente de las grabaciones ([PRONUNCIATION_AUDIO.md](voice/PRONUNCIATION_AUDIO.md)).
- Antes de publicar: estrategia de tests (#78, [TESTING.md](platform/TESTING.md), con un primer test de ruta con la IA simulada), revisión de calidad de código (#77, [CODE_QUALITY.md](platform/CODE_QUALITY.md): Prettier, ESLint más estricto, knip, páginas de error) y de seguridad (#76, [SECURITY_REVIEW.md](platform/SECURITY_REVIEW.md): bloqueo de escrituras cross-site, límites de tamaño, headers, Next 16.3.8, la base con permisos 600; el login queda para Authentication).
- Plataforma (#86–#94, #109): todo el código formateado con Prettier (`pnpm format:check`, commit en `.git-blame-ignore-revs`); CI en cada PR (typecheck, lint, tests, knip, build), gitleaks y Dependabot (CodeQL espera a que el repo sea público); dependencias al día (Next 16.4, React 19.3, TypeScript 6); las reglas de promesas de ESLint son errores y el lint queda en 0 warnings; lista de hosts permitidos contra DNS rebinding, `pnpm dev` escucha solo en 127.0.0.1 y las variables de entorno se validan con zod al arrancar; las migraciones ya no chocan si varios procesos abren la base a la vez.
- Deploy listo, sin publicar (#127, #139, #140): `Dockerfile`, `deploy/` (compose, Caddy, `deploy.sh`, `backup.sh`), `pnpm db:migrate` con backup y `MIGRATE_ON_START`, `/api/health`, puerto e IPv6 en los hosts permitidos; pasos en [DEPLOY.md](platform/DEPLOY.md).
- Descartar errores (#95, #96): "Wrong type?" marca un error como typo y "Discard" lo saca de las estadísticas cuando la corrección estaba mal (se puede deshacer); la tarjeta de corrección y el dashboard se actualizan al momento.
- Sin API key (#97, #98): Today, Practice e Insights avisan y desactivan los botones de IA con un link a Settings; la configuración vieja se reescribe al leerla, sin los campos de Ollama.
- Progreso (#99–#101): sección de pronunciación en el reporte de Insights, gráfico de precisión de Read aloud en el dashboard y la proporción de errores del nivel CEFR revisada por proveedor y con chats reales ([LEVEL_CALIBRATION.md](progress/LEVEL_CALIBRATION.md)).

- Login (#124, #138): la app pide cuenta siempre, también en local (Better Auth, primera cuenta en `/signup`, `pnpm auth:reset-password`), con tests que recorren cada ruta y página para que ninguna quede abierta ([AUTH_MULTIUSER.md](platform/AUTH_MULTIUSER.md)).
- Varias cuentas (#125, #155): cada cuenta ve solo sus datos y sus ajustes; lo que guardaste antes de las cuentas pasa a la tuya con `pnpm auth:claim-data <email>` (con respaldo).
- API keys por cuenta, cifradas (#126, #156, #157): se guardan cifradas con `data/encryption.key`, `pnpm keys:reencrypt` al rotarla, y Configuración > Your data exporta e importa tus datos en JSON para mover el historial entre PCs.
- CSP con nonce y Kokoro sin `eval` (#137, #153) y Next 16.4.3 con el arreglo de seguridad (#142).
- Tests (#111–#114, #164): rutas con login y la IA simulada, tests de aislamiento entre cuentas y E2E con Playwright (`pnpm test:e2e`, nocturno y antes de un release; [TESTING.md](platform/TESTING.md)).
- IA más robusta (#115–#118): el fallback entre modelos cubre más fallas y los errores de proveedor no filtran tu texto a los logs.
- Limpieza (#119–#123): logger de rutas sin texto del alumno, lectura de bodies con límite y código muerto fuera ([CODE_QUALITY.md](platform/CODE_QUALITY.md)).
- Releases (#128): ramas `main`/`develop`, SemVer, tags y workflow de release ([RELEASES.md](platform/RELEASES.md)).
- Evals de chats de tema y de correcciones descartadas (#146, #147): `pnpm eval:export-discards` y `eval:models --topics` miden si el modelo repite lo que descartaste ([TOPIC_EVAL.md](ai/TOPIC_EVAL.md)).
- Ventana flotante y dashboard (#154, #166): "Wrong type?" y "Discard" en las correcciones de la ventana flotante, aviso si falta la API key y página con la lista de errores descartados para deshacerlos.
- Herramientas en chats de tema (#161–#163): feedback al final de la entrevista, tiempo verbal a practicar según el tema y frases del chat al Vocabulario ([TOPIC_TOOLS.md](chat/TOPIC_TOOLS.md)).

## Próximo

### Voz

Dictado, estadísticas escritas vs habladas, escuchar, conversación por voz y fluidez ya están hechos (fases 1 y 2). La lectura en voz alta con pronunciación por reglas ya está (fase 3, #53); el repaso espaciado de pronunciación también (mazo Hard to say, #65); el panel en el dashboard también (#73). La schwa y las formas débiles con wav2vec2 ya están como beta en Read aloud (#132, #133; falta el eval con grabaciones reales, [PRONUNCIATION_AUDIO.md](voice/PRONUNCIATION_AUDIO.md)). Falta hablar en las clases (fase 4); whisper.cpp local se descartó con #72. Kokoro como voz local ya está (en CPU; WebGPU pendiente, #45). Investigación y plan en [VOICE.md](voice/VOICE.md).

### Ejercicios dirigidos

A partir de las 3 categorías más flojas del dashboard, generar ejercicios cortos: completar huecos, reescribir oraciones o elegir la opción correcta. La respuesta del usuario también se corrige y suma a las estadísticas.

Estado: **hecho** (#39), junto con el repaso espaciado de los ítems fallados. El detalle queda acá como referencia.

- **Qué practicar**: `selectCategoryTargets` (`src/lib/category-practice.ts`, puro, con tests) ordena las categorías de los últimos 90 días por errores que cuentan cada 100 palabras (`countsInStats`, vía las estadísticas del dashboard), deja afuera `verb_tense` (tiene su propia práctica), ortografía, puntuación, mayúsculas y "other", pide ≥ 2 errores y enfoca el tipo más frecuente si se repite. Sin datos sugiere artículos, preposiciones dependientes y verb patterns.
- **Generación**: mismo motor que los tiempos (`generateItems` en `src/lib/ai/exercises.ts`, fallback entre modelos y `withChatPriority`), con un schema plano `items: [{sentence, options, answer, why}]` (`options` aparte porque los modelos chicos no las ponían en la oración). El prompt incluye hasta 6 errores reales del usuario en esa categoría/tipo. `normalizeCategoryExercises` descarta respuestas que no siguen la oración, huecos vacíos, opciones que no incluyen la respuesta, "errores" que ya están bien y duplicados; el formato (fill / choice / rewrite) se deduce de la oración.
- **Chat**: el mismo chat de ejercicios que los drills de tiempos (modo corrección, `practice:<session id>` en `settings` con `kind: "category"`): el set completo se muestra de una vez y se responde en un solo mensaje, que pasa una vez por la corrección; la respuesta es un resumen fijo con ✓/✗ por ítem, la respuesta, el porqué y el puntaje (2 requests por set: generar + revisar; ver "Práctica" en docs/VERB_TENSES.md). El chequeo es determinístico (`src/lib/exercise-set.ts`): en los huecos compara lo que llena el hueco (vale escribir la oración o solo la palabra); si no se puede, deciden los errores que la corrección encontró en esa respuesta (uno de esa categoría = ✗; un rewrite sin errores = ✓).
- **Repaso espaciado**: los ítems fallados (tiempos: tiempo equivocado en contraste o un error verbal en esa respuesta, o un drill de forma con otras palabras; categorías: ✗) se guardan en la tabla `missed_exercises` (una fila por ítem de cada chat; reintentar el mensaje y acertar, o dejarlo sin responder, la borra con su repaso). Los ítems sin responder no se guardan. Forman el mazo **Missed exercises** de Flashcards (`kind = "exercise"` en `reviews`), que cuenta en las tarjetas pendientes del dashboard, se puede suspender o borrar desde el menú de la tarjeta (borra solo el ítem fallado, no el chat) y entra en la limpieza de reviews huérfanas (la clave es el id de la fila). Las filas sobreviven al borrar el chat.

Limitaciones:

- Responder solo con la palabra del hueco ("on") es un mensaje sin contexto para la corrección: suma pocas palabras a las estadísticas y casi nunca errores.
- Las tareas "use" de tiempos no se guardan como falladas (son respuestas abiertas).
- Las tarjetas de ejercicios no tienen tolerancia a typos: "in" por "on" es otra respuesta.

## Integración con las clases

Las clases son con un profesor por Google Meet, siguiendo un libro. La app ve cómo **escribís** todos los días y el profesor ve cómo **hablás**; hoy ninguno ve lo que ve el otro. La idea es cerrar ese círculo.

### Los libros

Los PDFs están en `books/` (ignorado en git: tienen copyright y pesan ~680 MB; nunca se suben).

| Archivo                                    | Curso                                               | Páginas  |
| ------------------------------------------ | --------------------------------------------------- | -------- |
| `Roadmap.pdf` / `Roadmap - Workbook.pdf`   | Roadmap B1 (Pearson): Student's Book y Workbook     | 161 / 86 |
| `Speak up.pdf` / `Speak up - Workbook.pdf` | Speakout (Pearson / BBC): Student's Book y Workbook | 170 / 96 |

Lo que se verificó (2026-09-28):

- **Los Student's Books son escaneos**: no tienen texto extraíble (`pdftotext` devuelve páginas vacías). Hay que leerlos como imagen, con un modelo de visión (Gemini Flash-Lite acepta imágenes y es gratis) o con OCR.
- **Los Workbooks sí tienen texto en parte y traen answer key** (verificado 2026-09-30): el de Speakout tiene una capa OCR con ruido en todas las páginas; el de Roadmap, texto digital limpio en la answer key y los audio scripts (pp. 69–86). Detalle en [TEXTBOOKS.md](class/TEXTBOOKS.md).
- **El índice es muy aprovechable**: está en las páginas 2–5 de cada libro y se lee bien renderizado a 70 dpi (`pdftoppm -f 2 -l 5 -r 70`). Cada lección (1A, 1B…) tiene columnas _Grammar/Function_, _Vocabulary_ y _Pronunciation_ (Roadmap agrega _Speaking goal_; Speakout, _Reading_).
- **La gramática se mapea directo a la taxonomía** de `src/lib/taxonomy.ts`. Ejemplos: present simple/continuous y past simple → `verb_tense`; _used to_, _be going to_ → `verb_tense`; articles → `articles`; question forms → `question_formation`; verb patterns → `gerund_infinitive`; comparatives/superlatives → `comparatives`; modals for rules/advice, possibility/deduction → `modals`; zero/first conditional → `conditionals`; quantifiers → `plurals_countability`; phrasal verbs → `phrasal_verbs`; collocations with _get/make_ → `collocations`.

### Resolver los ejercicios del libro en la app

Un espacio para los libros: visor de PDF, un botón que pasa la página actual a texto y detecta los ejercicios, resolverlos en la app y corregirlos de a uno (o en grupo), contra la answer key cuando existe y con la IA cuando no. Registra el avance por lección y usa el índice para recomendar ejercicios. Cubre la extracción del índice de §2. Investigación y diseño en [TEXTBOOKS.md](class/TEXTBOOKS.md).

### 1. Reporte para llevar a clase (hecho)

> Implementado (#158): página `/class/report`, ver [CLASS_REPORT.md](class/CLASS_REPORT.md).

Antes de cada clase, la app genera una página con: los errores más repetidos de la semana con ejemplos reales, las palabras buscadas con `[corchetes]` y las categorías que empeoraron. Se comparte pantalla en Meet o se manda antes, y el profesor dedica la clase a lo que realmente te cuesta en vez de adivinarlo.

- Barato: los datos ya están en el dashboard (`getDashboardData`). Es una vista imprimible / exportable (Markdown o PDF) con rango "desde la última clase".
- Opcional: un párrafo generado por la IA con "qué preguntarle al profesor".

### 2. La app sigue el libro (prioridad 2)

Se extrae una sola vez el índice de cada libro a un "syllabus" local (JSON en `data/`, no en git): unidades, lecciones, gramática, vocabulario y a qué categoría de la taxonomía corresponde cada tema. Se elige el libro y la **unidad actual** en Configuración, y con eso:

- **Alerta de errores en temas ya vistos**: "Viste present perfect en la unidad 3 (Roadmap 3A) y lo erraste 6 veces esta semana". Distingue "todavía no lo estudié" de "lo estudié y no se me fijó", que es lo que más le sirve al profesor.
- **Práctica enfocada**: los ejercicios dirigidos y las flashcards se generan con la gramática y el vocabulario de la unidad actual; el modo conversación propone temas de la unidad (p. ej. "Culture shock", "Bucket lists").
- **Vocabulario activo**: marcar si usás al escribir las palabras de la unidad, no solo si las reconocés.
- Extracción: renderizar las páginas del índice a imagen y pasarlas a un modelo de visión con un schema (unidad, lección, título, gramática, vocabulario, categoría), revisando el resultado a mano una vez. Es un paso único por libro.

### 3. Correcciones del profesor después de la clase (hecho)

> Implementado (#159, #160): fuente "From class" y nivel del profesor por clase, ver [CLASS_REPORT.md](class/CLASS_REPORT.md).

Después de la clase se cargan las correcciones y palabras nuevas que dio el profesor, como una nueva fuente "From class" (columna `source` en `corrections` / `vocabulary`). Suman a las estadísticas y al vocabulario junto con las de la IA, y después entran en las flashcards. Se puede cargar en texto libre y que la IA lo estructure con la misma taxonomía.

### 4. Tareas sin spoilers

Para las tareas de escritura que da el profesor: un modo "homework" donde escribís el texto y las correcciones de la IA quedan ocultas hasta que lo marcás como entregado. Así el profesor ve tus errores reales, y después podés comparar su corrección con la de la IA, que además sirve para evaluar qué tan buenos son los modelos.

### 5. Speaking desde la transcripción de la clase (más adelante)

Google Meet puede generar transcripciones, pero en general solo en cuentas pagas de Workspace. Con una transcripción, la app analizaría solo tus intervenciones y llevaría estadísticas de errores **hablados** separadas de las escritas.

- Problemas: los errores del reconocimiento de voz parecen errores de gramática, y grabar localmente (Whisper) requiere el consentimiento del profesor.
- Ver [VOICE.md](voice/VOICE.md), fase 4.

## Ideas a futuro

### Claude Code como paso intermedio

Objetivo: escribir el prompt una sola vez, en inglés, directamente en Claude Code, y obtener igual todo el beneficio de la app.

> La ventana flotante ya cubre buena parte de esto sin integrar nada: escribir o dictar el prompt ahí, copiar la versión corregida y pegarla en Claude Code. El hook solo vale la pena si ese paso de copiar y pegar molesta.

Flujo:

1. Escribo el prompt en Claude Code.
2. Un hook `UserPromptSubmit` manda el texto a un endpoint de la app (p. ej. `POST /api/correct`), que lo corrige y lo guarda en las estadísticas como cualquier mensaje (en una sesión "Claude Code").
3. El hook devuelve el prompt corregido como `additionalContext`, así Claude trabaja con la versión corregida.
4. La corrección (diff y errores principales) se muestra en el chat de Claude Code vía `systemMessage`.

Consideraciones:

- Tiene que ser rápido: conviene un timeout corto y, si la app no responde, dejar pasar el prompt original sin bloquear.
- Ignorar prompts en español o muy cortos (comandos, "sí", "dale").
- El endpoint sería el mismo análisis que usa el chat, sin la UI.

### Otras

- ~~Exportar/importar la base de datos para mover el historial entre PCs~~ (#157): hecho, por cuenta y en JSON, sin keys (Configuración > Your data).
