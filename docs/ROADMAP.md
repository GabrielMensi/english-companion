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
- Ventana flotante (Document Picture-in-Picture, como Google Meet): composer con dictado, última corrección y "Copy & close" siempre visibles sobre otras apps. Se abre con el botón del chat o Alt+P, y sola al cambiar de pestaña mientras dictás (por eso `pnpm dev` usa HTTPS).
- Voz, fase 2: botones ▶ para escuchar correcciones, versión nativa, vocabulario y respuestas; push-to-talk con Ctrl+Space; modo voz en conversación (manda al soltar y lee la respuesta); métricas de fluidez (ritmo, pausas largas, muletillas) por mensaje y en el dashboard. También en la ventana flotante ([VOICE.md](VOICE.md)).

## Próximo

### Práctica de tiempos verbales
Con el diagnóstico ya hecho: ejercicios de contraste para las confusiones más comunes y preguntas en el modo conversación que obliguen a usar los tiempos débiles o poco usados. Ver [VERB_TENSES.md](VERB_TENSES.md).

### Kev como clasificador
La clasificación en dos etapas ya está hecha con el LLM. Falta evaluar Kev-0.8B (o Jev / Jeeves) como backend cuando haya etiquetas reales de "Wrong type?". Ver [ERROR_CLASSIFICATION.md](ERROR_CLASSIFICATION.md).

### Voz
Dictado, estadísticas escritas vs habladas, escuchar, conversación por voz y fluidez ya están hechos (fases 1 y 2). Falta: lectura en voz alta y pronunciación (fase 3), whisper.cpp local como fallback, Kokoro como voz local y las clases (fase 4). Investigación y plan en [VOICE.md](VOICE.md).

### Flashcards de vocabulario
Practicar las palabras de la página Vocabulary (lo que escribiste entre [corchetes]): español → inglés, con la oración original como pista. Cada palabra agrupada (`VocabularyWord`) es una tarjeta.

### Repaso espaciado de tus errores
Flashcards generadas desde tus correcciones reales (el original como pregunta, la corrección como respuesta), con un algoritmo tipo SM-2. Se guarda el estado de cada tarjeta en una tabla `reviews`.

### Ejercicios dirigidos
A partir de las 3 categorías más flojas del dashboard, generar ejercicios cortos: completar huecos, reescribir oraciones o elegir la opción correcta. La respuesta del usuario también se corrige y suma a las estadísticas.

### Reporte semanal / plan de estudio
La IA lee las estadísticas de la semana (categorías, tendencias, errores frecuentes, vocabulario) y arma un plan concreto: qué temas practicar, con qué tipo de ejercicios y ejemplos. Comparte base con el [reporte para la clase](#1-reporte-para-llevar-a-clase-prioridad-1).

### Streaming de la corrección
Mostrar la corrección a medida que se genera (`streamText` + `Output.object`) para que los modelos locales se sientan más rápidos.

## Integración con las clases

Las clases son con un profesor por Google Meet, siguiendo un libro. La app ve cómo **escribís** todos los días y el profesor ve cómo **hablás**; hoy ninguno ve lo que ve el otro. La idea es cerrar ese círculo.

### Los libros
Los PDFs están en `books/` (ignorado en git: tienen copyright y pesan ~680 MB; nunca se suben).

| Archivo | Curso | Páginas |
|---|---|---|
| `Roadmap.pdf` / `Roadmap - Workbook.pdf` | Roadmap B1 (Pearson): Student's Book y Workbook | 161 / 86 |
| `Speak up.pdf` / `Speak up - Workbook.pdf` | Speakout (Pearson / BBC): Student's Book y Workbook | 170 / 96 |

Lo que se verificó (2026-09-28):
- **Son escaneos**: no tienen texto extraíble (`pdftotext` devuelve páginas vacías). Hay que leerlos como imagen, con un modelo de visión (Gemini Flash-Lite acepta imágenes y es gratis) o con OCR.
- **El índice es muy aprovechable**: está en las páginas 2–5 de cada libro y se lee bien renderizado a 70 dpi (`pdftoppm -f 2 -l 5 -r 70`). Cada lección (1A, 1B…) tiene columnas *Grammar/Function*, *Vocabulary* y *Pronunciation* (Roadmap agrega *Speaking goal*; Speakout, *Reading*).
- **La gramática se mapea directo a la taxonomía** de `src/lib/taxonomy.ts`. Ejemplos: present simple/continuous y past simple → `verb_tense`; *used to*, *be going to* → `verb_tense`; articles → `articles`; question forms → `question_formation`; verb patterns → `gerund_infinitive`; comparatives/superlatives → `comparatives`; modals for rules/advice, possibility/deduction → `modals`; zero/first conditional → `conditionals`; quantifiers → `plurals_countability`; phrasal verbs → `phrasal_verbs`; collocations with *get/make* → `collocations`.

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
- Nivel estimado (CEFR) según la evolución de errores y el vocabulario usado.
