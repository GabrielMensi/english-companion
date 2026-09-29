# Voz: investigación y plan de implementación

Estado (2026-09-29): **no está implementado ni diseñado**. Hasta ahora la voz solo aparecía como una línea en [ROADMAP.md](ROADMAP.md) ("dictado con Whisper local") y en la idea de transcribir las clases de Meet. Este documento es la investigación y el plan.

## Qué queremos lograr

La app ve cómo **escribís**; el profesor ve cómo **hablás**. Escribiendo tenés tiempo para pensar y corregirte, así que los errores escritos subestiman los que cometés en tiempo real. La voz sirve para cuatro cosas, en orden de valor:

1. **Errores hablados**: dictar en vez de escribir y analizar esa transcripción con el mismo pipeline, con estadísticas separadas de las escritas. Es la mejor medida de qué gramática está *automatizada* (ver [VERB_TENSES.md](VERB_TENSES.md): los tiempos verbales son justo lo que más se cae al hablar).
2. **Conversación por voz**: el modo conversación con push-to-talk y la respuesta leída en voz alta (listening + speaking).
3. **Pronunciación**: detectar palabras mal pronunciadas y llevar estadísticas con una taxonomía fija, igual que con los errores.
4. **Fluidez**: palabras por minuto, pausas y muletillas, que salen gratis de los timestamps de la transcripción.

## El problema central: el reconocimiento de voz te corrige la gramática

Los modelos de speech-to-text (STT) están entrenados para producir texto prolijo. Si decís *"Yesterday I have went to the store"*, es muy posible que transcriban *"Yesterday I went to the store"*, y entonces el tutor no ve el error. Lo mismo con muletillas, repeticiones y autocorrecciones ("I go— I went").

- **Whisper** tiende a normalizar, sobre todo con acento y en frases ambiguas (*"he go"* / *"he goes"* suenan casi igual). Se mitiga con `temperature: 0`, `language: "en"` y un `prompt` de estilo verbatim (un ejemplo de texto con errores y muletillas, p. ej. *"Umm, I goed to the... the store, eh, yesterday."*), porque Whisper imita el estilo del prompt.
- **Gemini Transcribe** (`gemini-3.5-transcribe`) tiene `mode: "VERBATIM"` (vs `SMART`), pensado exactamente para esto. Está soportado en `@ai-sdk/google` que ya tenemos.
- **Web Speech API** del navegador es la peor opción: manda el audio a Google, aplica un modelo de lenguaje agresivo y no se puede configurar.

Consecuencias de diseño:
- **Hay que medirlo antes de construir** (Fase 0): cuántos de los errores reales sobreviven a la transcripción, por proveedor.
- La transcripción se muestra **editable antes de analizar**, pero solo para arreglar palabras mal reconocidas. Se guarda la transcripción cruda y un flag `edited`, para que las estadísticas "habladas" no se contaminen con correcciones propias.
- Los errores que dependen solo del sonido (*-s* de tercera persona, *-ed*, *a/the*) se van a subcontar al hablar. El dashboard lo tiene que decir, no esconder.

## Speech-to-text: opciones

| Opción | Dónde corre | Costo | Calidad / fidelidad | Integración |
|---|---|---|---|---|
| **whisper.cpp** (`whisper-server`) con `large-v3-turbo` | Windows, GPU con **Vulkan** (igual que Ollama) | Gratis, privado | Muy buena; ~1–2 s por frase en GPU | HTTP local. Con `--inference-path /v1/audio/transcriptions` expone un endpoint compatible con OpenAI |
| **Groq** `whisper-large-v3-turbo` | API | Free tier con límites diarios | Muy buena, rapidísima | `groq.transcription(...)` de `@ai-sdk/groq` (ya instalado, key ya configurada). Soporta `prompt`, `language`, `temperature`, `timestampGranularities: ["word"]` |
| **Gemini Transcribe** `gemini-3.5-transcribe` | API | Free tier | Tiene modo `VERBATIM` y timestamps por palabra | `google.transcription(...)` de `@ai-sdk/google` (ya instalado). Opciones: `mode`, `wordTimestamp`, `languageCodes`, `customVocabulary` |
| **Gemini multimodal** (audio como input del análisis) | API | Free tier | Transcribe + corrige + comenta pronunciación en una llamada | `generateText` con un `file` de audio. No encaja con `resolveModel` (Ollama/Groq no lo soportan): solo para la feature de pronunciación |
| **faster-whisper / Speaches** | WSL, CPU (CTranslate2 no usa GPUs AMD) | Gratis | Buena pero lenta en CPU con modelos grandes | Endpoint compatible con OpenAI |
| **transformers.js** (Whisper en el navegador con WebGPU) | Navegador | Gratis | Solo modelos chicos (`base`/`small`) con fluidez razonable; peor con acento | Sin servidor, pero pesa la descarga del modelo |
| **Web Speech API** | Navegador → Google | Gratis | Normaliza mucho, no configurable | Trivial. **Descartada** para análisis; sirve como mucho para comandos |

**Recomendación**: mismo patrón que los modelos de texto, *local primero y fallback remoto*.
- Principal: **whisper.cpp en Windows con Vulkan** (la RX 9070 XT no tiene ROCm cómodo en WSL, pero Vulkan anda en Windows nativo). Se instala una vez, corre al lado de Ollama y se accede por `localhost` gracias a `networkingMode=mirrored`.
- Fallback: **Groq Whisper** (ya hay key) y, si la Fase 0 muestra que el modo `VERBATIM` preserva más errores, **Gemini Transcribe** como principal remoto.
- A verificar: si Ollama ya acepta audio con los Gemma 4 chicos (E2B/E4B tienen entrada de audio en otros runtimes). Si es así, sería STT local sin instalar nada más, pero hay que medir la fidelidad igual.

## Text-to-speech (para escuchar)

| Opción | Dónde | Notas |
|---|---|---|
| `speechSynthesis` del navegador | Navegador | Cero setup. En Edge/Windows las voces "Natural" son buenas. **Default.** |
| **Kokoro-82M** | Navegador (`kokoro-js`) o servidor local | Calidad casi humana, liviano, gratis. Mejor opción local |
| Gemini TTS (`gemini-3.8-flash-lite-tts`) | API | Muy natural, con límites del free tier. Ya soportado por `generateSpeech` + `@ai-sdk/google` |

Usos: leer las respuestas del modo conversación, escuchar el `correctedText` / `naturalText` de cada mensaje, y la pronunciación de cada palabra del Vocabulary.

## Pronunciación

De menor a mayor esfuerzo:

1. **Lectura en voz alta con texto conocido (shadowing)**: la app te da una oración (de tus propias correcciones, del vocabulario o del libro), la leés, y se compara la transcripción con el texto esperado con el mismo diff de `diff-text.tsx`. Las palabras que el STT no reconoció son candidatas a mal pronunciadas. Es la señal **más confiable y barata**, porque se sabe qué quisiste decir. *Recomendada como primera feature de pronunciación.*
2. **Confianza por palabra**: whisper.cpp da probabilidades por token y Groq/Gemini dan timestamps por palabra. Palabras con baja confianza en habla libre son una pista débil; sirve para marcar "revisá esta palabra", no para estadísticas.
3. **Feedback cualitativo con Gemini multimodal**: se manda el audio y se pide un JSON con problemas de pronunciación clasificados con una taxonomía fija. Útil para lectura en voz alta; en habla libre es menos preciso.
4. **Fonemas** (más adelante): un modelo wav2vec2 de fonemas (p. ej. `facebook/wav2vec2-lv-60-espeak-cv-ft`) permite calcular *goodness of pronunciation* por fonema. Requiere un servicio Python local; solo si lo anterior queda corto.

Taxonomía fija de pronunciación (nueva, en `src/lib/taxonomy.ts`, pensada para hispanohablantes):

| Categoría | Ejemplo |
|---|---|
| `vowel_length` | *ship* / *sheep*, *full* / *fool* |
| `schwa_reduction` | vocales plenas en sílabas átonas (*to-MA-to* con todas las vocales claras) |
| `initial_s_cluster` | *"estudent"*, *"espeak"* |
| `b_v` | *very* como *"bery"* |
| `th_sounds` | *think* → *"tink"*, *this* → *"dis"* |
| `final_consonants` | *-ed* (*worked* /t/, *wanted* /ɪd/), *-s*, consonantes finales perdidas |
| `h_j_sounds` | *hello* con jota española, *yes* / *jess* |
| `word_stress` | *deVELop*, *PHOtograph* / *phoTOgrapher* |
| `other` | |

## Features propuestas

1. **Botón de micrófono en el composer** (push-to-talk o toggle). El audio se transcribe, la transcripción aparece en el textarea para revisar y se manda como siempre. El mensaje queda marcado como `spoken`.
2. **Estadísticas escritas vs habladas**: filtro en el dashboard (`Todo / Escrito / Hablado`). La comparación por categoría es la parte interesante: "present perfect: 90 % escribiendo, 55 % hablando".
3. **Conversación por voz**: modo conversación en el que la respuesta se lee en voz alta y se puede contestar hablando, sin mirar la pantalla. Las correcciones aparecen igual, pero no interrumpen.
4. **Práctica de lectura / shadowing**: una página "Read aloud" con oraciones de tus correcciones, tu vocabulario o la unidad actual del libro, y el resultado por palabra.
5. **Métricas de fluidez** por mensaje hablado: palabras por minuto, pausas largas, muletillas (incluidas las españolas: *"eh"*, *"este"*, *"o sea"*). Se calculan en código a partir de los timestamps, sin IA.
6. **Escuchar**: botón ▶ en el texto corregido, en la versión nativa y en cada palabra del Vocabulary.
7. **Clases** (relacionado con la sección 5 de "Integración con las clases" del roadmap): importar una grabación o una transcripción de la clase, separar tus intervenciones (diarización: Gemini Transcribe tiene `diarization: true`) y analizarlas como mensajes hablados. Requiere el consentimiento del profesor.

## Arquitectura

```
Navegador (Windows)                  Next.js (WSL)                         Motores
MediaRecorder (webm/opus) ──POST──▶ /api/transcribe ──▶ src/lib/ai/speech.ts ──▶ whisper.cpp (Windows, Vulkan)
                                     (multipart/form-data)   resolveTranscriptionModel    └▶ fallback: Groq / Gemini
textarea ◀── { text, words[], durationMs, provider, model }
   │
   └──▶ flujo actual: POST /api/sessions/[id]/messages (inputMode: "spoken")
```

- **Captura**: `MediaRecorder` en el navegador. `localhost` es contexto seguro, así que el permiso de micrófono funciona sin HTTPS. El navegador corre en Windows, así que WSL no toca el audio.
- **`src/lib/ai/speech.ts`** (server-only): `resolveTranscriptionModel(settings, provider)` y `withTranscriptionFallback`, con la misma forma que `providers.ts` (timeouts, fallback, registro del modelo usado). Usa `transcribe()` del AI SDK (estable en `ai` v7). Para whisper.cpp: `@ai-sdk/openai` con `baseURL` al servidor local, o un `fetch` directo si la compatibilidad falla.
- **Partes puras con tests** (sin `server-only`): el prompt verbatim, las métricas de fluidez a partir de palabras con timestamps, el diff de lectura en voz alta y la normalización de la respuesta de cada proveedor a `{ text, words: { word, start, end, confidence? }[] }`.
- **Audio en disco**: opcional (`data/audio/<messageId>.webm`, `data/` ya está ignorado en git). Setting "Keep recordings" apagado por defecto; sirve para volver a escuchar y para re-transcribir con otro modelo.
- **Configuración**: proveedor y modelo de STT, URL de whisper.cpp, fallback de STT, voz de TTS, y "enviar sin revisar" (off por defecto).

Cambios de schema (`src/db/schema.ts` + `pnpm db:generate`):

```ts
// messages
inputMode: text("input_mode").$type<"typed" | "spoken">().notNull().default("typed"),
transcriptRaw: text("transcript_raw"),            // lo que devolvió el STT, antes de editar
transcriptEdited: integer("transcript_edited", { mode: "boolean" }),
transcriptionProvider: text("transcription_provider"),
transcriptionModel: text("transcription_model"),
audioDurationMs: integer("audio_duration_ms"),
fluency: text("fluency", { mode: "json" }).$type<FluencyMetrics>(),
audioPath: text("audio_path"),

// nueva tabla (Fase 3)
pronunciation_issues: id, messageId, word, expected, heard, category, explanation, createdAt
```

`StatMessage` / `StatCorrection` suman `inputMode`, y `getDashboardData` recibe el filtro.

## Plan por fases

### Fase 0 — Medir la fidelidad del STT (go / no-go)
- Grabar ~20 oraciones de `scripts/eval/samples.ts` leídas en voz alta **con los errores**, más algunas en habla libre.
- Nuevo script `pnpm eval:asr <provider>:<model> …` (junto a `eval:models`): transcribe cada audio y mide qué porcentaje de los fragmentos con error sobreviven literalmente, además del WER contra el texto leído.
- Comparar whisper.cpp `large-v3-turbo` (con y sin prompt verbatim), Groq Whisper y Gemini Transcribe `VERBATIM`.
- **Criterio**: si un proveedor preserva ≥ 80 % de los errores gramaticales, seguimos con errores hablados. Si ninguno llega, el foco pasa a lectura en voz alta y fluidez, donde la normalización molesta menos.

### Fase 1 — Dictado (MVP)
- `speech.ts`, `/api/transcribe`, botón de micrófono en `composer.tsx` con estados (grabando / transcribiendo / error), columnas `inputMode` y `transcript*`, configuración de STT.
- Nota de modelo y tiempo en el mensaje (como `model-note.tsx`) también para la transcripción.
- Filtro Escrito / Hablado en el dashboard.
- Docs: README (setup de whisper.cpp en Windows) y ROADMAP.

### Fase 2 — Escuchar y conversar
- TTS con `speechSynthesis` (botones ▶), después Kokoro opcional.
- Modo conversación por voz: auto-leer respuestas y push-to-talk con una tecla.
- Métricas de fluidez (puras, con tests) y su panel en el dashboard.

### Fase 3 — Pronunciación
- Página "Read aloud" con diff por palabra; fuentes: correcciones, vocabulario, unidad del libro.
- Taxonomía de pronunciación y tabla `pronunciation_issues`; clasificación con Gemini multimodal (o reglas simples a partir del diff).
- Panel de pronunciación en el dashboard y oraciones problemáticas dentro del repaso espaciado.

### Fase 4 — Clases
- Importar audio o transcripción de la clase, diarización, análisis solo de tus turnos como mensajes `spoken` con fuente "From class".

## Riesgos y preguntas abiertas

- **Fidelidad del STT**: el riesgo principal; lo resuelve la Fase 0.
- **Latencia**: whisper.cpp en GPU + análisis con `gemma4:12b` suma ~10 s por mensaje. Con Groq/Gemini baja a ~3 s. Para conversación por voz conviene el camino remoto o un modelo de análisis más chico.
- **VRAM**: `large-v3-turbo` (~1,6 GB) + `gemma4:12b` (~7,6 GB) entran juntos en 16 GB.
- **Privacidad**: el audio es más sensible que el texto. Por defecto no se guarda, y los proveedores remotos quedan como fallback explícito. En el free tier de Gemini, Google puede usar los datos.
- **Grabar a otros** (clases): solo con consentimiento.
