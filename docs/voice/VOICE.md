# Voz: investigación y plan de implementación

> Area: Voice · Kind: Research · Status: In progress (phases 1–3 done, phase 4 pending) · Board: #53, #45

Al empezar (2026-09-29) no estaba implementado ni diseñado. Hasta ahora la voz solo aparecía como una línea en [ROADMAP.md](../ROADMAP.md) ("dictado con Whisper local") y en la idea de transcribir las clases de Meet. Este documento es la investigación y el plan.

## Qué queremos lograr

La app ve cómo **escribís**; el profesor ve cómo **hablás**. Escribiendo tenés tiempo para pensar y corregirte, así que los errores escritos subestiman los que cometés en tiempo real. La voz sirve para cuatro cosas, en orden de valor:

1. **Errores hablados**: dictar en vez de escribir y analizar esa transcripción con el mismo pipeline, con estadísticas separadas de las escritas. Es la mejor medida de qué gramática está *automatizada* (ver [VERB_TENSES.md](../practice/VERB_TENSES.md): los tiempos verbales son justo lo que más se cae al hablar).
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
| **Gemini multimodal** (audio como input del análisis) | API | Free tier | Transcribe + corrige + comenta pronunciación en una llamada | `generateText` con un `file` de audio. No encaja con `resolveModel` (Groq no lo soporta): solo para la feature de pronunciación |
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
| **Kokoro-82M** | Navegador (`kokoro-js`) o servidor local | Calidad casi humana, liviano, gratis. Mejor opción local. **Implementado como opcional** (ver "Kokoro" más abajo) |
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
- **Configuración**: proveedor y modelo de STT, URL de whisper.cpp, fallback de STT, voz de TTS (motor navegador o Kokoro), y "enviar sin revisar" (off por defecto).

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

// nuevas tablas (Fase 3, implementadas)
read_aloud_attempts: id, source, sourceId, focus, text, transcript, correctWords, totalWords, …
pronunciation_issues: id, attemptId, expected, heard, category, detail, createdAt
```

`StatMessage` / `StatCorrection` suman `inputMode`, y `getDashboardData` recibe el filtro.

## Plan por fases

### Fase 0 — Medir la fidelidad del STT (go / no-go)

**Herramientas listas (2026-09-29)**:
- Página `/eval/asr`: se leen en voz alta 22 oraciones con un error audible cada una (`src/lib/eval/asr-samples.ts`). El audio se graba en el navegador, se convierte a WAV mono de 16 kHz (`src/lib/audio/wav.ts`) y se guarda en `data/asr-samples/`.
- `pnpm eval:asr [engine:model …]`: transcribe cada grabación e indica si el error quedó (`kept`), si el motor lo corrigió (`fixed`) o si no aparece ninguna de las dos formas (`lost`), más el WER contra lo leído. Motores:
  - `groq` y `groq-verbatim` (Whisper, con y sin prompt verbatim);
  - `gemini` y `gemini-smart` (Gemini Transcribe);
  - `gemini-llm` (un modelo de chat al que se le pide transcribir literal);
  - `whisper-cpp:<url>` (servidor local).
- Cada request tiene un timeout de 60 s, para que un proveedor que no responde no cuelgue la corrida.

**Resultados con voz real (2026-09-30, 22 oraciones leídas, un solo hablante)**:

| Motor | Conserva | "Corrige" | Pierde | WER | s / frase |
|---|---|---|---|---|---|
| Groq `whisper-large-v3-turbo` | 59 % | 32 % | 9 % | 0,08 | 0,8 |
| Groq turbo + prompt verbatim | 59 % | 27 % | 14 % | 0,10 | 3,5 |
| Groq `whisper-large-v3` | 64 % | 23 % | 14 % | 0,08 | 0,6 |
| Gemini Flash-Lite como transcriptor | 68 % | 9 % | 23 % | 0,14 | 2,3 |
| Gemini Transcribe (VERBATIM / SMART) | — | — | — | — | — |

- **Gemini Transcribe queda descartado**: el free tier permite 25 requests por día. Con la primera oración, SMART ya "corrigió" *I have went* → *I went*.
- **Ninguno llega al 80 %**, pero el resultado depende mucho del tipo de error:
  - **Errores verbales** (tiempos, formas, concordancia, condicionales, modales; 10 oraciones): Whisper turbo conserva **8 de 10**. Solo "corrige" *she don't* → doesn't y confunde *can to* con "come to".
  - **Palabras cortas sin acento** (artículos, preposiciones, *it*, el *do* de las preguntas, la *-s* de *informations*; 8 oraciones): Whisper turbo conserva **1 de 8**. Las completa desde el contexto: *for buy* → to buy, *depends of* → on, *the life* → life, *Where you live* → Where do you live, *Is very important* → It's.
  - **Flash-Lite** "corrige" menos, pero inventa: una transcripción vacía, *30 years* → "60 years", *can to help you* → "can't you help you" (un error que no se dijo). Un error inventado ensucia más las estadísticas que uno escondido.
- **Pronunciación**: Whisper escuchó *bug* → "book" y *call* → "kill" en todas las corridas, además de *engineer* → "ingénieur" y *can* → "come". Son pares de vocales típicos de hispanohablantes, así que la transcripción ya sirve como señal de pronunciación.

**Decisión propuesta**: seguir con la Fase 1 usando **Whisper `large-v3-turbo`** (Groq ahora, whisper.cpp local con el mismo modelo después), con dos reglas:
1. Las estadísticas habladas solo cuentan las categorías que sobreviven a la transcripción: verbales, patrones verbales, orden de palabras, vocabulario, falsos amigos, comparativos y estructura. Artículos, preposiciones, pronombres, plurales y preguntas se muestran en el chat, pero en el dashboard figuran como "no medible al hablar".
2. Las palabras que Whisper escucha distinto en la lectura en voz alta alimentan la parte de pronunciación (Fase 3), que resulta más prometedora de lo esperado.

Limitaciones: 22 oraciones, una sola voz, y lectura (no habla espontánea). Conviene repetir la medición con más oraciones antes de sacar conclusiones por categoría.

Plan original:
- Grabar ~20 oraciones de `scripts/eval/samples.ts` leídas en voz alta **con los errores**, más algunas en habla libre.
- Nuevo script `pnpm eval:asr <provider>:<model> …` (junto a `eval:models`): transcribe cada audio y mide qué porcentaje de los fragmentos con error sobreviven literalmente, además del WER contra el texto leído.
- Comparar whisper.cpp `large-v3-turbo` (con y sin prompt verbatim), Groq Whisper y Gemini Transcribe `VERBATIM`.
- **Criterio**: si un proveedor preserva ≥ 80 % de los errores gramaticales, seguimos con errores hablados. Si ninguno llega, el foco pasa a lectura en voz alta y fluidez, donde la normalización molesta menos.

### Fase 1 — Dictado (MVP) ✅ implementada (2026-09-30)
- **Motor**: Whisper `large-v3-turbo` en Groq (`resolveTranscriptionModel` en `providers.ts`, `transcribeSpeech` en `src/lib/ai/transcribe.ts`), con `language: "en"` y `temperature: 0`. Sin key de Groq, el micrófono queda deshabilitado con una explicación.
- **Grabación**: el hook `useRecorder` (`src/components/audio/use-recorder.ts`) graba en el navegador y convierte a WAV mono de 16 kHz. Lo comparten el composer y `/eval/asr`. El audio nunca se guarda.
- **Composer**: botón de micrófono (clic para empezar y para terminar, Esc cancela). La transcripción se agrega al borrador, así se puede dictar en varias tomas, y se puede editar antes de enviar.
- **Guardado**: en `messages` se guardan `input_mode`, `transcript_raw` (lo que devolvió Whisper), `transcript_edited`, el proveedor y modelo de transcripción, y la duración del audio.
- **Análisis**: el prompt sabe que el mensaje fue dictado. En los mensajes hablados nunca se reportan errores de ortografía, puntuación, mayúsculas ni typos; `normalizeAnalysis` los descarta si el modelo igual los devuelve.
- **Estadísticas**: los errores hablados de artículos, preposiciones, pronombres, plurales y preguntas se muestran en el chat pero no cuentan (`NOT_MEASURABLE_WHEN_SPOKEN` / `countsInStats` en `taxonomy.ts`). El dashboard tiene un filtro Todo / Escrito / Hablado, que aparece cuando hay mensajes dictados.
- **Chat**: los mensajes dictados muestran "Spoken · 0:07" y, si se editó la transcripción, "transcript edited".
- **Pendiente**:
  - elegir el motor de STT en Configuración (se suma al rediseño de esa página);
  - whisper.cpp local como fallback;
  - ~~un atajo de teclado para dictar~~ (hecho en la Fase 2: Ctrl+Space).

### Fase 2 — Escuchar y conversar ✅ implementada (2026-09-30)
- **Escuchar**: `speechSynthesis` del navegador (`src/components/audio/speech.ts`), leído oración por oración porque algunas voces se cortan a los ~15 s. Botón ▶ (`SpeakButton`) en el texto corregido ("Listen"), la versión nativa, cada palabra del Vocabulary (en el chat y en `/vocabulary`) y cada respuesta del tutor. Por defecto elige la mejor voz en inglés (primero las "Natural" de Edge, después en-US).
- **Configuración**: sección "Listening" en Settings con la voz y la velocidad. Se guardan en `localStorage` y no en la base, porque cada navegador tiene sus propias voces.
- **Push-to-talk**: mantener **Ctrl+Space** en cualquier parte de la página graba y al soltar transcribe; un toque corto empieza a grabar y el siguiente para (`use-push-to-talk.ts`). Funciona también fuera del modo voz: ahí la transcripción va al borrador, como con el botón del micrófono. Empezar a hablar corta la voz del tutor, para no grabarla.
- **Modo voz** (botón "Voice" en el header, solo en modo conversación y con key de Groq): la transcripción se manda sola al soltar la tecla, sin revisarla, y la respuesta se lee en voz alta. Las correcciones aparecen en el chat igual que siempre, pero no se leen. Se recuerda por navegador.
- **Fluidez** (`src/lib/fluency.ts`, puro y con tests): Whisper se pide con `verbose_json` y timestamps por palabra (se llama a `doGenerate` del modelo, porque `transcribe()` descarta la respuesta cruda). Por cada toma se calcula: palabras (sin muletillas), tiempo de habla (de la primera a la última palabra), pausas de 1 s o más y muletillas (*um/uh/eh*, y las españolas *este*, *o sea*, *bueno*, *pues*; no se cuentan palabras con significado como *like* o *well*). Las tomas se suman y se guardan en `messages.fluency` como sumas crudas; las tasas (palabras por minuto, pausas por minuto, muletillas cada 100 palabras) se derivan al mostrarlas.
- **Dónde se ve**: en el mensaje ("Spoken · 0:09 · 99 wpm · 1 long pause · 2 fillers") y en el panel "Fluency" del dashboard (filtros Todo / Hablado), con la comparación contra el período anterior y las muletillas más usadas.
- **Limitaciones**:
  - Whisper omite parte de las vacilaciones, así que las muletillas son una cota mínima. Con la prueba de TTS de Windows sí transcribió *um* y *eh*.
  - Los mensajes dictados antes de la Fase 2 no tienen métricas de fluidez.
  - Grabaciones de menos de 2 s no dan ritmo (el número diría más del redondeo que de la fluidez).
- ~~Pendiente: Kokoro como voz local opcional~~ (hecho, ver abajo).

### Kokoro como voz local ✅ implementada (2026-10-02, issue #33)

Settings → Listening tiene un **Engine**: *Browser voice* (default, `speechSynthesis`) o *Kokoro (local model)*, con su propia lista de voces y la misma velocidad. Todo pasa por `speak()` / `stopSpeaking()` de `src/components/audio/speech.ts`, así que los ▶, el modo voz y la ventana flotante usan el motor elegido sin cambios.

**Qué se eligió y por qué**: [`kokoro-js`](https://www.npmjs.com/package/kokoro-js) 1.2.1 (Apache-2.0) corriendo **en el navegador**, en un Web Worker, sobre transformers.js 3.8 / ONNX Runtime Web. Alternativas descartadas:
- *Servidor local* (Kokoro-FastAPI en Docker, o Python con `kokoro`): mejor rendimiento en CPU, pero es otro proceso que instalar y mantener vivo en Windows (la GPU AMD no tiene ROCm cómodo en WSL), y otro endpoint del que depender. En el navegador no hay nada que instalar: se elige en Settings y anda.
- *Kokoro en Node dentro de Next* (`onnxruntime-node`): bloquea el servidor de la app mientras sintetiza y usa solo CPU.
- *transformers.js 4 sin `kokoro-js`*: no trae el fonemizador ni las voces; habría que reimplementar lo que `kokoro-js` ya hace.

**Cómo funciona** (`src/components/audio/kokoro.ts` + `kokoro.worker.ts`):
- **Precarga**: si Kokoro es el motor elegido, `SpeechPreloader` (en el layout) carga el modelo en segundo plano cuando la app abre, con `requestIdleCallback` para no competir con la carga de la página; también al elegirlo en Settings o prender el modo voz. Con Browser voice no se carga nada. El worker vive a nivel de módulo, así que navegar entre páginas (Settings → chat) no lo recarga; solo cambiar el *Device* lo reinicia (voz y velocidad son parámetros de cada síntesis; la voz nueva baja su archivo de ~0,5 MB la primera vez). El ▶ muestra un spinner hasta que suena el primer audio; un click lo cancela.
- **Dispositivo** (Settings → Listening → *Device*, campo `kokoroDevice` de `speech-prefs`, default `auto`):
  - *Auto*: WebGPU con `fp32` si hay GPU; si no, o si falla, WASM con el modelo `q8`. Al cargar se sintetiza una frase de prueba y **se valida el audio**, no solo que corra (ver "Kokoro suena a ruido" abajo). Si el audio de la GPU no pasa, se descarta la GPU, se pasa a WASM y queda recordado en este navegador (`localStorage["kokoro-gpu-rejected"]`, con el motivo y la fecha), así la próxima vez *Auto* va directo a la CPU. Settings lo muestra con un botón *Try the GPU again*.
  - *GPU (WebGPU)*: fuerza la GPU aunque su audio no pase el chequeo (Settings muestra la advertencia); sirve para probarla a mano. Solo si no carga cae a la CPU.
  - *CPU (WebAssembly)*: fuerza WASM (`fp32` multihilo, o `q8` si la página no está aislada; ver "Rendimiento").
  - Settings muestra el dispositivo y el dtype en uso ("Ready, running on the GPU (WebGPU), fp32 · <fabricante y arquitectura de la GPU>", o "CPU (WebAssembly), fp32, 8 threads"), y mientras carga, en cuál lo está intentando.
- **Streaming**: se sintetiza por fragmentos y cada uno se encola en un `AudioContext` apenas está; el worker sigue sintetizando los siguientes mientras suena el actual. Los fragmentos salen de `speech-chunks.ts` (puro, con tests): el primero es corto (la primera oración se corta en una coma, punto y coma, guion o antes de una conjunción, ≤ 8 palabras) y cada uno puede tener el doble de palabras que el anterior (8, 16, 32…), cortando en cláusulas mientras haga falta. Como en la CPU sintetizar lleva ~la mitad de lo que dura el audio, el siguiente fragmento está listo antes de que termine el actual y no quedan silencios.
- **Caché de audio** (`audio-cache.ts` + `audio-cache-core.ts`): lo sintetizado se guarda por (texto, voz, velocidad) con el dispositivo que lo hizo: en memoria (LRU, 40 MB ≈ 7 min de audio) y en IndexedDB (`kokoro-audio`, 60 MB, se borra lo menos usado). Un ▶ repetido suena al instante, incluso después de recargar y sin esperar al modelo. Solo se guardan síntesis completas (no las canceladas); con el modelo cargado solo se usa audio del dispositivo en uso.
- **Ventana flotante**: comparte el realm de JS de la página, así que usa el mismo worker y el mismo `AudioContext`; el sonido sale de la pestaña.
- **Fallback**: si el modelo no carga (sin red la primera vez, el worker falla, ni la CPU da un audio que pase el chequeo, etc.), lee la voz del navegador, avisa con un toast y sigue con la del navegador el resto de la sesión. "Retry" en Settings (o volver a elegir Kokoro) lo reintenta.

**Descarga y caché**: los pesos se bajan una sola vez de Hugging Face (`onnx-community/Kokoro-82M-v1.0-ONNX`) y quedan en la **Cache Storage del navegador** (caché `transformers-cache` para el modelo y `kokoro-voices` para las voces, por origen: `https://localhost:3737`). Tamaños: `model.onnx` (fp32, WebGPU y WASM multihilo) **326 MB**; `model_quantized.onnx` (q8, WASM de un hilo) **92 MB**; cada voz ~0,5 MB. Se borran desde DevTools → Application → Cache storage. El runtime de ONNX (`ort-wasm-simd-threaded.jsep.wasm`, 28 MB en 1.30) lo sirve la propia app desde `node_modules/onnxruntime-web` (`/api/tts/runtime/[file]`) en vez del CDN de jsDelivr que usa transformers.js por defecto.

**Dependencia**: `kokoro-js` (trae `@huggingface/transformers`, `onnxruntime-web` y `phonemizer`; también `onnxruntime-node` y `sharp` para Node, que no se usan: sus scripts de build quedan ignorados en `pnpm-workspace.yaml`).

**Rendimiento en la CPU** (2026-10-02, tras la primera prueba real: tardaba mucho en empezar, con pausas largas en medio y cada ▶ repetido volvía a esperar):
- **Cross-origin isolation**: `next.config.ts` manda `Cross-Origin-Opener-Policy: same-origin` y `Cross-Origin-Embedder-Policy: credentialless` en todas las rutas, así `crossOriginIsolated` es `true` y ONNX Runtime puede usar WASM multihilo (`SharedArrayBuffer`). `credentialless` en vez de `require-corp`: los recursos de otros orígenes cargan igual (sin cookies), así que las descargas de Hugging Face siguen andando sin headers CORP. Verificado en Chromium headless con un perfil nuevo: descargas de modelo y voces desde Hugging Face, todas las páginas, fuentes, la ventana flotante (Document PiP, que también queda aislada) y el runtime de `/api/tts/runtime` (los hilos de ONNX Runtime cargan el mismo `ort-wasm-simd-threaded.jsep.mjs`, que ya es la build multihilo), sin errores. Safari no soporta `credentialless`: ahí sigue en un hilo.
- **Hilos**: `numThreads` = la mitad de `navigator.hardwareConcurrency`, máximo 8 (ONNX Runtime usa 4 por defecto). Más de 8 casi no mejora y la máquina necesita núcleos para el navegador. Se fija con `env.backends.onnx.wasm.numThreads` de `@huggingface/transformers`, que es dependencia directa en la misma versión que usa `kokoro-js` (3.8.1) para compartir la instancia.
- **dtype en WASM**: con hilos, `fp32`; sin hilos, `q8`. Las ops cuantizadas de `q8` casi no ganan con hilos. Mediciones (respuesta de 20,6 s de audio, WSL headless, 16 hilos lógicos), como factor de tiempo real (síntesis / duración):

| dtype WASM | 1 hilo | 4 hilos | 8 hilos | 16 hilos |
|---|---|---|---|---|
| `q8` (92 MB) | 1,56 | 0,98 | 0,98 | 1,08 |
| `fp32` (326 MB) | 1,65 | 0,56 | 0,49 | 0,45 |
| `fp16` (163 MB) | | | 0,50 | |
| `q4` (305 MB) | | | 0,48 | |

  `fp32` es la referencia de calidad y es el mismo archivo que usa WebGPU (si la GPU se probó antes, ya está en caché). `fp16` da NaN en algunos textos (kokoro#74), así que no se usa.
- **Antes / después** (Chromium headless en WSL, CPU, modelo ya en Cache Storage):

| | Antes (1 hilo, q8) | Después (8 hilos, fp32) |
|---|---|---|
| Primer audio de "Try it" con la página recién abierta | 11,5 s (carga + síntesis al hacer click) | 1,9 s (modelo precargado en idle) |
| Carga del modelo + frase de prueba (worker nuevo) | 4,6 s | 3,0 s |
| Primer audio de una respuesta de 4 oraciones, con el modelo listo | 2,3 s | 0,8 s |
| Factor de tiempo real | 1,56 | 0,49 |
| Silencios entre fragmentos en esa respuesta (20,6 s de audio) | 13,7 s | 0,1 s |
| ▶ repetido, misma página | 6,2 s (sintetiza de nuevo) | 0,02 s (memoria) |
| ▶ repetido tras recargar la página | igual que el primero | 0,07 s (IndexedDB) |

- **Logs**: el worker escribe en la consola (nivel *Verbose*/debug) cuánto tardan la carga, la frase de prueba y cada fragmento, con su factor de tiempo real: `[kokoro] chunk 2/5 on wasm: 1.40 s for 2.80 s of audio (real-time factor 0.50)`.

**Kokoro suena a ruido (WebGPU)** — bug encontrado en la primera prueba real (2026-10-02): las voces del navegador andaban bien y Kokoro solo daba ruido.
- **Causa (la más probable)**: la salida de ONNX Runtime Web (1.22-dev, la que trae transformers.js 3.8.1) en **WebGPU** es basura en algunas GPUs/drivers. Está reportado justo para **AMD**: [hexgrad/kokoro#98](https://github.com/hexgrad/kokoro/issues/98) ("audio distorsionado e inusable en WebGPU; WASM q8 anda bien"; Radeon 880M y 840M RDNA 3.5 en Windows rotas, NVIDIA y Apple bien), y también en Intel Iris Xe ([microsoft/onnxruntime#29807](https://github.com/microsoft/onnxruntime/issues/29807): fp32 corrompe algunas oraciones, fp16 todas, q8/q4f16 dan ruido) y Android ([hexgrad/kokoro#193](https://github.com/hexgrad/kokoro/issues/193), [transformers.js#1320](https://github.com/huggingface/transformers.js/issues/1320): en WebGPU ningún dtype anda). En la RX 9070 XT (RDNA 4) el camino de WebGPU es el que se activa por default.
- **Lo que se descartó en el código de la app**: el audio sale de `generate()` como `Float32Array` a 24 kHz y se copia (`slice()`) antes de transferirlo, así que no hay vistas con offset ni buffers compartidos; la página lo mete en un `AudioBuffer` creado con `sampleRate` 24000 (no la del contexto, que es 44,1/48 kHz) y lo encola sin concatenar. En Chromium headless el mismo código **con WebGPU por software (SwiftShader, `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`) da voz correcta** a fp32, igual que WASM: el problema no está en la app sino en los kernels de WebGPU sobre el hardware real.
- **Otros dtypes en WebGPU**: no sirven de salida. `fp16` da NaN/ruido (kokoro#74, onnxruntime#29807) y `q8`/`q4`/`q4f16` dan ruido en WebGPU (los mismos reportes); en el Android de kokoro#193 no anduvo ninguno. Por eso WebGPU se usa solo con `fp32` y la salida de emergencia es WASM `q8`, no otro dtype en la GPU. Si una versión futura de ONNX Runtime lo arregla (transformers.js 4 trae una más nueva), *Try the GPU again* lo vuelve a probar.
- **Cómo se protege ahora**: `src/components/audio/audio-check.ts` (puro, con tests) mide el audio y rechaza NaN/Infinity, más de 1 % de muestras saturadas, silencio y señal que no parece voz: planitud espectral mediana de los frames fuertes > 0,2, tasa de cruces por cero > 0,25, o rango dinámico < 20 dB (la voz tiene pausas y sílabas; el ruido es parejo). Calibrado con la salida real de Kokoro (3 voces, de "Yes." a 20 palabras): planitud ≤ 0,01, cruces ≤ 0,11, rango ≥ 60 dB; el ruido blanco da ~0,56 / ~0,5 / ~0 dB. Se valida la frase de prueba al cargar **y cada oración** mientras se usa la GPU (los bugs de onnxruntime#29807 dependen del texto): si una falla en *Auto*, esa oración se rehace en la CPU, no se reproduce el ruido, y queda recordado. Avisa con un toast.
- **onnxruntime-web 1.30** (override en `pnpm-workspace.yaml`; transformers.js 3.8.1 trae 1.22-dev): misma API, sigue trayendo `ort-wasm-simd-threaded.jsep.*`, y `/api/tts/runtime` ahora sirve esos archivos desde el `onnxruntime-web` que importa transformers.js, así JS y WASM siempre coinciden. Verificado en Chromium headless: WASM igual que antes (factor 0,49 con 8 hilos) y WebGPU con SwiftShader da voz que pasa el chequeo. **Falta confirmar en la RX 9070 XT** si arregla el ruido: con *Auto*, "Try the GPU again" en Settings lo vuelve a probar; si sigue fallando, el chequeo lo descarta igual. Si trae problemas, se quita el override y se vuelve a 1.22.
- **Límite**: el chequeo atrapa ruido, NaN y saturación, no una voz "congestionada" pero inteligible (la variante sutil de onnxruntime#29807). Si la GPU suena rara sin que salte el chequeo, elegir *CPU (WebAssembly)* en Settings.
- **Para probar el fallback sin la GPU rota** (solo en desarrollo): `localStorage["kokoro-simulate-noise"]` = `"webgpu"` (la GPU falla la frase de prueba), `"webgpu-speech"` (pasa la prueba y falla en las oraciones reales), `"wasm"` o `"all"`; borrar la clave para volver a la normalidad.

**Limitaciones**:
- Sin aislamiento (Safari, o si se quitan los headers) WASM corre en un solo hilo con `q8` y va más lento que tiempo real (factor ~1,6), con pausas entre fragmentos. Con WebGPU debería ir muy por delante del audio, pero en la RX 9070 XT Kokoro dio ruido, muy probablemente por WebGPU (ver arriba). Con SwiftShader (WebGPU por software, sin GPU) la primera carga con el modelo en caché tardó ~110 s.
- Una oración de más de ~510 tokens fonéticos se corta (límite del modelo); en la práctica las respuestas del tutor son oraciones cortas.
- `kokoro-js` no se actualiza desde 2025-05 (sigue en transformers.js 3.x). Si hace falta, se puede pasar a transformers.js 4 copiando su lógica (fonemizar + voces).
- `stream()` de `kokoro-js` con un string nunca entrega la última oración: el worker arma y cierra el `TextSplitterStream` a mano.

### Fase 3 — Pronunciación (lectura en voz alta ✅ implementada, 2026-10-05, issue #53)

**Página "Read aloud"** (`/read-aloud`, en Train): se lee una oración, Whisper la transcribe (`/api/transcribe`, igual que el dictado) y se compara con lo que se quería decir. Como se sabe el texto esperado, una palabra escuchada como otra apunta al sonido que cambió. Fuentes:
- **Sounds**: oraciones propias por categoría (`src/lib/read-aloud-sentences.ts`), armadas para que las dos palabras del par mínimo tengan sentido (*I saw a big ship / sheep in the picture*): así Whisper no puede adivinar la palabra por el contexto. Aparecen primero los sonidos con más problemas.
- **Your corrections**: oraciones de la versión natural (o corregida) de tus mensajes, de 4 a 18 palabras, sin números ni código. Las leídas en las últimas dos semanas no se repiten.
- **Your vocabulary**: la oración de tu mensaje corregido que usa la palabra que buscaste.
- La unidad del libro queda para cuando el libro esté integrado.

**Puntaje sin IA** (`src/lib/pronunciation-core.ts`, puro y con tests):
1. Se alinean las palabras (Levenshtein) después de normalizar: minúsculas, números chicos en letras, contracciones expandidas (*it's* = *it is*).
2. Dos palabras distintas que suenan igual según el **CMU Pronouncing Dictionary** (`cmu-pronouncing-dictionary`, ~4,5 MB, solo en el servidor) no son error: *two / too*, *colour / color*.
3. Para cada palabra escuchada distinto, se alinean los fonemas (ARPAbet) de las dos y el primer cambio que coincide con una regla decide la categoría: *th* → t/d/s; b ↔ v; h que se pierde, y ↔ j; una vocal agregada antes de s + consonante (también si Whisper escribe "is students" o "estudent"); iː ↔ ɪ y uː ↔ ʊ; otras vocales; consonantes finales que se pierden o cambian (*worked → work*, *bed → bet*). Si hay varias pronunciaciones (*live* /lɪv/ o /laɪv/), se usa la más cercana y, si empatan, la regla más específica.
4. Las palabras que no se escucharon se marcan pero no cuentan como error de pronunciación (pueden ser una palabra salteada).

**Taxonomía** (`PRONUNCIATION_CATEGORIES` en `taxonomy.ts`): `vowel_length`, `vowel_quality` (nueva: *bug / book*, *call / kill*, que Whisper escuchó en la Fase 0), `th_sounds`, `b_v`, `h_j_sounds`, `initial_s_cluster`, `final_consonants`, `other`. Cada una tiene un consejo en español e inglés, según el idioma de las explicaciones. `schwa_reduction` y `word_stress` quedaron afuera: no cambian qué palabra escucha Whisper, así que con esta señal nunca se asignarían.

**Guardado**: tablas `read_aloud_attempts` (texto, transcripción, palabras bien / total, fuente, foco) y `pronunciation_issues` (palabra esperada, escuchada, categoría y el sonido que cambió en IPA, p. ej. "/ɪ/ → /iː/"). El audio no se guarda. A Whisper no se le pasa el texto esperado como prompt: lo copiaría y escondería los errores.

**En la página**: la oración marcada (palabras escuchadas distinto con un número, salteadas tachadas), lo que se escuchó, cada problema con su categoría, el sonido y el consejo, y el panel "Sounds to work on" (últimos 30 días: lecturas, % de palabras bien y categorías con los ejemplos más repetidos, con un botón para practicar ese sonido). Ctrl+Space también graba. `/read-aloud?focus=<categoría>` (p. ej. `th_sounds`) abre la página en ese sonido; un valor desconocido u `other` abre todos, y al cambiar el sonido se actualiza la URL (#57).

Limitaciones:
- Whisper completa desde el contexto, así que en oraciones propias (no las de pares mínimos) se le escapan errores: la señal es una cota mínima.
- Palabras que no están en el diccionario (nombres, términos técnicos) caen en `other`.
- Una sola señal (la transcripción): no mide acento, ritmo ni entonación.

**Repaso espaciado: mazo "Hard to say"** (#64): cada oración leída con al menos una palabra escuchada distinto es una tarjeta de Flashcards (`kind = "pronunciation"` en `reviews`, clave = el texto de la oración; armadas con `pronunciationCards` en `read-aloud-core.ts`). La tarjeta muestra la oración con esas palabras subrayadas; se responde leyéndola en voz alta (botón o Ctrl+Space), con el mismo puntaje que la página, y la lectura se guarda como un intento más (`source = "review"`), así que cuenta en el panel de pronunciación. La nota sugerida es Good si se escucharon todas las palabras como están escritas y Again si no, pero decide el usuario (sin key de Groq: se escucha, se lee y se califica a mano). Cuenta en las tarjetas pendientes del sidebar y de Today, se puede suspender, y borrarla elimina todas las lecturas de esa oración (y sale de las estadísticas). Entra en la limpieza de reviews huérfanas.

**Panel en el dashboard** (#73): sección "Pronunciation" con el porcentaje de palabras escuchadas como están escritas y los sonidos con problemas, por cada 100 palabras leídas, con la tendencia contra el período anterior del mismo largo (`pronunciationProgress` en `read-aloud-core.ts`). Sigue el período del dashboard pero no el filtro Escrito / Hablado (las lecturas no son mensajes), y aparece solo si hay alguna lectura.

Pendiente:
- Acento, schwa y word stress desde el audio: investigado en [PRONUNCIATION_AUDIO.md](PRONUNCIATION_AUDIO.md) (#74). Decisión: schwa con un modelo de fonemas wav2vec2 en CPU, acento de palabra pendiente de grabaciones reales, feedback abierto con Gemini descartado.

### Fase 4 — Clases
- Importar audio o transcripción de la clase, diarización, análisis solo de tus turnos como mensajes `spoken` con fuente "From class".

## Riesgos y preguntas abiertas

- **Fidelidad del STT**: el riesgo principal; lo resuelve la Fase 0.
- **Latencia**: whisper.cpp en GPU + análisis con `gemma4:12b` suma ~10 s por mensaje. Con Groq/Gemini baja a ~3 s. Para conversación por voz conviene el camino remoto o un modelo de análisis más chico.
- **VRAM**: `large-v3-turbo` (~1,6 GB) + `gemma4:12b` (~7,6 GB) entran juntos en 16 GB.
- **Privacidad**: el audio es más sensible que el texto. Por defecto no se guarda, y los proveedores remotos quedan como fallback explícito. En el free tier de Gemini, Google puede usar los datos.
- **Grabar a otros** (clases): solo con consentimiento.
