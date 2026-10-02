# Roadmap

## Hecho (v0.1)

- Chat por sesiones (modos corrección y conversación) con historial en SQLite.
- Corrección estructurada: diff, errores con categoría fija, gravedad y explicación.
- Tolerancia a typos (gravedad `typo`, excluida de las estadísticas por defecto).
- "Cómo lo diría un nativo" y escape al español con `[corchetes]` → vocabulario.
- Convertir un mensaje corregido en prompt estructurado.
- Dashboard: errores cada 100 palabras, evolución, áreas a trabajar, tendencias, errores frecuentes.
- Providers: Ollama (local), Gemini y Groq (free tier), con API keys y URL de Ollama configurables desde la app.
- Página Vocabulary y panel en el dashboard con las palabras buscadas entre [corchetes].
- Set de evaluación de modelos (`pnpm eval:models`) y timeouts por request.
- Selector de modelo en el chat, modelo registrado en cada respuesta y fallback automático entre modelos configurados.
- Clasificación diferida de errores: tipos fijos por categoría, tiempo verbal que correspondía y que se usó, "Wrong type?" para corregirlo a mano y `pnpm eval:classify` ([ERROR_CLASSIFICATION.md](ERROR_CLASSIFICATION.md)).
- Diagnóstico de tiempos verbales: precisión por tiempo, errores de uso vs forma, confusiones y tiempos poco usados ([VERB_TENSES.md](VERB_TENSES.md)).
- Rediseño de Configuración: una tarjeta por proveedor (key, modelo, prueba y estado) editable sin cambiar el principal, una "cadena de modelos" que se puede reordenar y desactivar, guardado automático y puntaje, velocidad y límite gratis de cada modelo.
- Nivel `suggestion` para mejoras opcionales (contracciones, puntuación opcional), que no cuentan como errores, y tiempo de respuesta en cada mensaje.
- Ventana flotante (Document Picture-in-Picture, como Google Meet): composer con dictado, última corrección y "Copy & close" siempre visibles sobre otras apps; el botón "Native" muestra u oculta cómo lo diría un nativo (se recuerda en el navegador). Se abre con el botón del chat o Alt+P, y sola al cambiar de pestaña mientras dictás (por eso `pnpm dev` usa HTTPS).
- Voz, fase 2: botones ▶ para escuchar correcciones, versión nativa, vocabulario y respuestas; push-to-talk con Ctrl+Space; modo voz en conversación (manda al soltar y lee la respuesta); métricas de fluidez (ritmo, pausas largas, muletillas) por mensaje y en el dashboard. También en la ventana flotante ([VOICE.md](VOICE.md)).
- Streaming de la corrección: se ve mientras se genera (en el chat y en la ventana flotante); lo que se guarda sale siempre del objeto completo y validado.
- Práctica de tiempos verbales (página Practice): ejercicios de contraste, de forma y "usalo" generados para los tiempos más flojos, y conversación dirigida que obliga a usarlos. Las respuestas se corrigen y suman a las estadísticas ([VERB_TENSES.md](VERB_TENSES.md#práctica)).
- Flashcards (página Flashcards): vocabulario español → inglés y repaso espaciado de tus errores reales con un algoritmo tipo SM-2 (tabla `reviews`), filtrable por tiempo verbal o tipo de error.
- Insights: reporte de la semana o del mes, plan de estudio escrito por la IA (exportable en Markdown, base para el reporte de clase) y nivel CEFR estimado con reglas fijas y transparentes.
- Flashcards, mantenimiento: suspender o borrar tarjetas, limpieza de repasos huérfanos, el tipo de error pasa a ser una pista y "nuevas por sesión" configurable. Panel de repasos en el dashboard (retención, repasos por día, racha, pendientes) con la tabla `review_log`.
- Nivel CEFR calibrado con ~3.300 textos de Write & Improve corregidos por Cambridge (`pnpm eval:level`): coincidencia exacta del 20% al 59% y siempre a ±1 nivel con 1.000 palabras ([LEVEL_CALIBRATION.md](LEVEL_CALIBRATION.md)).

## Próximo

### Kev como clasificador
La clasificación en dos etapas ya está hecha con el LLM. Falta evaluar Kev-0.8B (o Jev / Jeeves) como backend cuando haya etiquetas reales de "Wrong type?". Ver [ERROR_CLASSIFICATION.md](ERROR_CLASSIFICATION.md).

### Voz
Dictado, estadísticas escritas vs habladas, escuchar, conversación por voz y fluidez ya están hechos (fases 1 y 2). Falta: lectura en voz alta y pronunciación (fase 3), whisper.cpp local como fallback, Kokoro como voz local y las clases (fase 4). Investigación y plan en [VOICE.md](VOICE.md).

### Ejercicios dirigidos
A partir de las 3 categorías más flojas del dashboard, generar ejercicios cortos: completar huecos, reescribir oraciones o elegir la opción correcta. La respuesta del usuario también se corrige y suma a las estadísticas.

Estado: **implementado** (rama `feature/practice-exercises`), junto con el repaso espaciado de los ítems fallados.
- **Qué practicar**: `selectCategoryTargets` (`src/lib/category-practice.ts`, puro, con tests) ordena las categorías de los últimos 90 días por errores que cuentan cada 100 palabras (`countsInStats`, vía las estadísticas del dashboard), deja afuera `verb_tense` (tiene su propia práctica), ortografía, puntuación, mayúsculas y "other", pide ≥ 2 errores y enfoca el tipo más frecuente si se repite. Sin datos sugiere artículos, preposiciones dependientes y verb patterns.
- **Generación**: mismo motor que los tiempos (`generateItems` en `src/lib/ai/exercises.ts`, fallback entre modelos y `withChatPriority`), con un schema plano `items: [{sentence, options, answer, why}]` (`options` aparte porque los modelos chicos no las ponían en la oración). El prompt incluye hasta 6 errores reales del usuario en esa categoría/tipo. `normalizeCategoryExercises` descarta respuestas que no siguen la oración, huecos vacíos, opciones que no incluyen la respuesta, "errores" que ya están bien y duplicados; el formato (fill / choice / rewrite) se deduce de la oración.
- **Chat**: el mismo chat de ejercicios (modo corrección, `practice:<session id>` en `settings` con `kind: "category"`). El chequeo es determinístico: en los huecos compara lo que llena el hueco (vale escribir la oración o solo la palabra); si no se puede, decide la corrección (un error de esa categoría = ✗; un rewrite sin errores = ✓).
- **Repaso espaciado**: los ítems fallados (tiempos: tiempo equivocado en contraste, o un drill de forma con errores verbales; categorías: ✗) se guardan en la tabla `missed_exercises` (una fila por ítem de cada chat; reintentar el mensaje y acertar la borra con su repaso) y forman el mazo **Missed exercises** de Flashcards (`kind = "exercise"` en `reviews`). Las filas sobreviven al borrar el chat.

Limitaciones:
- Responder solo con la palabra del hueco ("on") es un mensaje sin contexto para la corrección: suma pocas palabras a las estadísticas y casi nunca errores.
- Las tareas "use" de tiempos no se guardan como falladas (son respuestas abiertas).
- Las tarjetas de ejercicios no tienen tolerancia a typos: "in" por "on" es otra respuesta.

## Integración con las clases

Las clases son con un profesor por Google Meet, siguiendo un libro. La app ve cómo **escribís** todos los días y el profesor ve cómo **hablás**; hoy ninguno ve lo que ve el otro. La idea es cerrar ese círculo.

### Los libros
Los PDFs están en `books/` (ignorado en git: tienen copyright y pesan ~680 MB; nunca se suben).

| Archivo | Curso | Páginas |
|---|---|---|
| `Roadmap.pdf` / `Roadmap - Workbook.pdf` | Roadmap B1 (Pearson): Student's Book y Workbook | 161 / 86 |
| `Speak up.pdf` / `Speak up - Workbook.pdf` | Speakout (Pearson / BBC): Student's Book y Workbook | 170 / 96 |

Lo que se verificó (2026-09-28):
- **Los Student's Books son escaneos**: no tienen texto extraíble (`pdftotext` devuelve páginas vacías). Hay que leerlos como imagen, con un modelo de visión (Gemini Flash-Lite acepta imágenes y es gratis) o con OCR.
- **Los Workbooks sí tienen texto en parte y traen answer key** (verificado 2026-09-30): el de Speakout tiene una capa OCR con ruido en todas las páginas; el de Roadmap, texto digital limpio en la answer key y los audio scripts (pp. 69–86). Detalle en [TEXTBOOKS.md](TEXTBOOKS.md).
- **El índice es muy aprovechable**: está en las páginas 2–5 de cada libro y se lee bien renderizado a 70 dpi (`pdftoppm -f 2 -l 5 -r 70`). Cada lección (1A, 1B…) tiene columnas *Grammar/Function*, *Vocabulary* y *Pronunciation* (Roadmap agrega *Speaking goal*; Speakout, *Reading*).
- **La gramática se mapea directo a la taxonomía** de `src/lib/taxonomy.ts`. Ejemplos: present simple/continuous y past simple → `verb_tense`; *used to*, *be going to* → `verb_tense`; articles → `articles`; question forms → `question_formation`; verb patterns → `gerund_infinitive`; comparatives/superlatives → `comparatives`; modals for rules/advice, possibility/deduction → `modals`; zero/first conditional → `conditionals`; quantifiers → `plurals_countability`; phrasal verbs → `phrasal_verbs`; collocations with *get/make* → `collocations`.

### Resolver los ejercicios del libro en la app
Un espacio para los libros: visor de PDF, un botón que pasa la página actual a texto y detecta los ejercicios, resolverlos en la app y corregirlos de a uno (o en grupo), contra la answer key cuando existe y con la IA cuando no. Registra el avance por lección y usa el índice para recomendar ejercicios. Cubre la extracción del índice de §2. Investigación y diseño en [TEXTBOOKS.md](TEXTBOOKS.md).

### 1. Reporte para llevar a clase (prioridad 1)
Antes de cada clase, la app genera una página con: los errores más repetidos de la semana con ejemplos reales, las palabras buscadas con `[corchetes]` y las categorías que empeoraron. Se comparte pantalla en Meet o se manda antes, y el profesor dedica la clase a lo que realmente te cuesta en vez de adivinarlo.
- Barato: los datos ya están en el dashboard (`getDashboardData`). Es una vista imprimible / exportable (Markdown o PDF) con rango "desde la última clase".
- Opcional: un párrafo generado por la IA con "qué preguntarle al profesor".

### 2. La app sigue el libro (prioridad 2)
Se extrae una sola vez el índice de cada libro a un "syllabus" local (JSON en `data/`, no en git): unidades, lecciones, gramática, vocabulario y a qué categoría de la taxonomía corresponde cada tema. Se elige el libro y la **unidad actual** en Configuración, y con eso:
- **Alerta de errores en temas ya vistos**: "Viste present perfect en la unidad 3 (Roadmap 3A) y lo erraste 6 veces esta semana". Distingue "todavía no lo estudié" de "lo estudié y no se me fijó", que es lo que más le sirve al profesor.
- **Práctica enfocada**: los ejercicios dirigidos y las flashcards se generan con la gramática y el vocabulario de la unidad actual; el modo conversación propone temas de la unidad (p. ej. "Culture shock", "Bucket lists").
- **Vocabulario activo**: marcar si usás al escribir las palabras de la unidad, no solo si las reconocés.
- Extracción: renderizar las páginas del índice a imagen y pasarlas a un modelo de visión con un schema (unidad, lección, título, gramática, vocabulario, categoría), revisando el resultado a mano una vez. Es un paso único por libro.

### 3. Correcciones del profesor después de la clase
Después de la clase se cargan las correcciones y palabras nuevas que dio el profesor, como una nueva fuente "From class" (columna `source` en `corrections` / `vocabulary`). Suman a las estadísticas y al vocabulario junto con las de la IA, y después entran en las flashcards. Se puede cargar en texto libre y que la IA lo estructure con la misma taxonomía.

### 4. Tareas sin spoilers
Para las tareas de escritura que da el profesor: un modo "homework" donde escribís el texto y las correcciones de la IA quedan ocultas hasta que lo marcás como entregado. Así el profesor ve tus errores reales, y después podés comparar su corrección con la de la IA, que además sirve para evaluar qué tan buenos son los modelos.

### 5. Speaking desde la transcripción de la clase (más adelante)
Google Meet puede generar transcripciones, pero en general solo en cuentas pagas de Workspace. Con una transcripción, la app analizaría solo tus intervenciones y llevaría estadísticas de errores **hablados** separadas de las escritas.
- Problemas: los errores del reconocimiento de voz parecen errores de gramática, y grabar localmente (Whisper) requiere el consentimiento del profesor.
- Ver [VOICE.md](VOICE.md), fase 4.

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
- Tiene que ser rápido: con un modelo local conviene un timeout corto y, si la app no responde, dejar pasar el prompt original sin bloquear.
- Ignorar prompts en español o muy cortos (comandos, "sí", "dale").
- El endpoint sería el mismo análisis que usa el chat, sin la UI.

### Otras
- Exportar/importar la base de datos para mover el historial entre PCs. El export tiene que excluir la fila `api-keys` de `settings`, para no compartir keys por accidente.
