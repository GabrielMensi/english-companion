# Pronunciación desde el audio: schwa, acento de palabra y acento

> Area: Voice · Kind: Research · Status: In progress (beta en la app; falta el eval con grabaciones reales) · Board: #74, #132, #133, #134, #135, #136

La lectura en voz alta (fase 3 de [VOICE.md](VOICE.md), #53) compara lo que Whisper transcribe con el texto esperado. Eso detecta sonidos que cambian la palabra que se escucha (_ship / sheep_), pero no puede ver lo que no cambia la transcripción: **vocales plenas en lugar de schwa** (_to_ como /tuː/, _banana_ con tres "a" claras), **acento de palabra** (_DEvelop_, _PHOtographer_) ni el **acento** en general. Este documento compara opciones para medirlo desde el audio, cuenta qué se midió en un spike (2026-10-07) y termina con una decisión.

Contexto: la app es solo APIs (#72, hecho en #80: sin Ollama ni LLMs locales; Kokoro se queda) y free-first.

## Opciones

| Opción                                                                                                  | Qué mide                                                            | Costo / límites                                                                                                                                     | Dónde corre                                                                                                                    |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Whisper (Groq)**, lo que hay hoy                                                                      | Palabras; timestamps por palabra                                    | Gratis, ~8 h de audio por día                                                                                                                       | API                                                                                                                            |
| **Gemini multimodal, feedback abierto**: audio + texto, "listá los problemas" con categorías fijas      | Todo, en teoría                                                     | Free tier: **20 pedidos por día por modelo** en los Flash (medido); omni: sin free tier                                                             | API                                                                                                                            |
| **Gemini multimodal, pregunta cerrada**: "¿qué sílaba de _develop_ acentuaste? ¿redujiste las vocales?" | Acento y schwa de una palabra conocida                              | Ídem                                                                                                                                                | API                                                                                                                            |
| **wav2vec2 de fonemas** (`onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX`) con transformers.js         | Los fonemas que se dijeron (IPA, sin marcas de acento)              | Gratis; modelo de 318 MB (q8) que se baja una vez                                                                                                   | **CPU**, en Node (onnxruntime-node, ya instalado con transformers.js) o en el navegador como Kokoro. No necesita GPU ni Python |
| **Prosodia sobre la alineación de wav2vec2**: volumen, tono y duración de cada vocal                    | Qué sílaba sobresale (acento de palabra)                            | Gratis                                                                                                                                              | CPU, sin modelo extra                                                                                                          |
| **Azure Pronunciation Assessment**                                                                      | Precisión por fonema, fluidez, prosodia (incluye acento de palabra) | Requiere cuenta de Azure; la evaluación de pronunciación figura como add-on pago (~USD 1/h según la comunidad; no encontré cupo gratis claro en F0) | API                                                                                                                            |
| Speechace / SpeechSuper / ELSA API                                                                      | Lo mismo que Azure, especializados                                  | Pagos                                                                                                                                               | API                                                                                                                            |

Descartadas sin medir: Azure y las APIs especializadas son las más completas pero no son free-first (quedan como plan B si la calidad lo exige); OpenAI audio es pago; la Web Speech API del navegador no da fonemas ni confianza útil.

## El spike

Código en `scripts/spike/pron-audio/` (experimental, **no está conectado a la app**). No había grabaciones reales de lectura (la tabla `read_aloud_attempts` está vacía y no hay `data/asr-samples/`), así que el set de prueba es **sintético con una verdad conocida**: Kokoro lee IPA escrito a mano, así que cada clip dice exactamente lo que se le pidió.

- `clips.ts`: 10 palabras en una oración (_develop, photographer, comfortable, banana, hotel, record, present, computer, vegetables, to_) en tres versiones: **correcta**, **acento movido** (_DEvelop_, _comforTAble_, _REcord_ → _reCORD_) y **vocales plenas** en lugar de schwa (_devel-o-p_, _ba-na-na_, _to_ = /tuː/). Más 3 oraciones con **acento hispano** completo (_"tink dis is a beri gud estudent"_) y su versión correcta. 33 clips por voz, con dos voces americanas (`af_heart`, `am_michael`).
- `synth.mts`: genera los WAV a 16 kHz mono (el formato que graba la app) en `data/pron-audio-spike/`. ~1 min en CPU.
- `phonemes.mts`: wav2vec2 de fonemas + detector de schwa + heurística de acento.
- `gemini.mts`: Gemini en modo `feedback` (pregunta abierta) o `probe` (pregunta cerrada).

```sh
pnpm tsx scripts/spike/pron-audio/synth.mts
pnpm tsx scripts/spike/pron-audio/phonemes.mts
DATABASE_PATH=data/dev.db pnpm tsx --conditions=react-server --tsconfig tsconfig.json \
  scripts/spike/pron-audio/gemini.mts gemini-3.5-flash --mode=probe --only=develop,banana
```

Los resultados quedan en `.eval-results/pron-*.json`.

### wav2vec2 de fonemas (CPU)

- **Velocidad**: 0,19 s por clip de ~3 s en CPU (q8), 29 s la primera carga (descarga incluida).
- **Sanidad del set**: el modelo escucha los cambios en 20 de 31 clips con sonidos cambiados. Kokoro no siempre los realiza: en _present_ y _vegetables_ con vocales plenas (una voz) volvió a la schwa, y en las oraciones con acento hispano "corrigió" casi todas las consonantes (_th_, _b/v_). Las oraciones de acento quedaron flojas como prueba.
- **Schwa** (vocales reducidas de la pronunciación correcta que se escucharon como vocal plena; la pronunciación correcta saldría del CMU Pronouncing Dictionary, que ya tiene el acento de cada vocal): **16 de 22** clips detectados, **0 falsas alarmas en 24** clips correctos. Las que faltan son, en su mayoría, clips donde Kokoro no realizó el cambio. El detector dice además qué se escuchó (_ə → ɑː_ en _computer_, _ɚ → ɔːɹ_ en _record_), que sirve como explicación.
- **Acento de palabra** (heurística: la vocal de la palabra con más volumen + tono + duración): con la voz masculina acertó la sílaba acentuada en 8/8 clips con el acento movido, 8/8 correctos y 6/7 con vocales plenas; con la femenina, 4/8, 5/8 y 5/7 (tiende a elegir la primera sílaba). Prometedor pero frágil: depende de la voz, y el habla sintética exagera el acento. Elegir siempre la primera sílaba acierta 22/46.

### Gemini

- **Feedback abierto, `gemini-flash-lite-latest`** (el modelo que usa la app): no sirve. De las 16 palabras cambiadas marcó con certeza solo _hotel_ (acento) y, con otra categoría, _computer_ con vocales plenas; como mucho otras 3 (sus respuestas quedaron truncadas en el log de esa primera corrida). La oración de _develop_ con acento hispano sacó 5/5, "suena nativo". En cambio **inventó errores en audio correcto** (5 de 13 clips correctos: _th_ en _"This"_, _"think"_, acento en _photographer_), porque el prompt dice que el que habla es hispanohablante.
- **Feedback abierto, `gemini-flash-latest`** (hoy = `gemini-3.8-flash`): marcó `word_stress` en **todas** las palabras, también en las versiones correctas (_develop_, _photographer_, _comfortable_), con puntajes de acento de 3,5 sobre 5 para audio sin errores. Se cortó a los 7 clips: **cupo del free tier de 20 pedidos por día por modelo** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`). Con eso no alcanza ni para una sesión de práctica.
- **Pregunta cerrada, `gemini-3.5-flash`** (18 clips): encontró el acento movido en 5 de 6 palabras (_DEvelop_, _PHOtographer_, _comforTAble_, _BAnana_, _COMputer_), pero también lo "movió" en 2 de 6 palabras correctas (_comFORtable_, _preSENT_) y en 4 de 6 con vocales plenas. Sobre las vocales reducidas respondió siempre "no reducidas": **ninguna señal de schwa**. 4,5 s por pedido.
- `gemini-omni-1.1-flash`: sin cupo en el free tier.

El problema de fondo con un LLM de audio es el mismo que con Whisper pero al revés: sabe qué _debería_ decirse y de quién se trata, y responde con eso más que con lo que escuchó.

## Decisión

1. **Schwa y formas débiles: wav2vec2 de fonemas en CPU**, sobre los intentos de lectura en voz alta (donde se conoce el texto). Es gratis, rápido, no depende de cupos, no necesita GPU ni Python, y no inventó errores en audio correcto. Usa el mismo stack que Kokoro (transformers.js / ONNX), así que no contradice el "solo APIs" de #72, que es sobre LLMs. Antes de que cuente en las estadísticas hay que validarlo con grabaciones reales (la voz sintética es más limpia que la de un alumno).
2. **Acento de palabra: todavía no.** La heurística de prosodia sobre la alineación de wav2vec2 es la candidata (gratis, sin cupo), pero hay que medirla con grabaciones reales. Gemini con pregunta cerrada queda a lo sumo como "segunda opinión" a pedido, nunca para estadísticas: 20 pedidos por día y falsas alarmas en palabras correctas.
3. **Feedback abierto de acento con Gemini: descartado.** Inventa errores, se pierde los reales y el free tier no lo sostiene.
4. **De paso**: los fonemas son una segunda señal para las categorías que ya existen (_th_, _b/v_, vocales), que no depende de que Whisper complete por contexto. Puede levantar la "cota mínima" de la lectura en voz alta.
5. Si algún día la calidad pesa más que free-first, el plan B es Azure Pronunciation Assessment.

`schwa_reduction` y `word_stress` siguen fuera de `PRONUNCIATION_CATEGORIES` hasta que haya un detector validado; el spike los usa solo localmente.

## En la app: chequeo de sonidos (beta, #132 y #133)

Implementado en `src/lib/phonemes-core.ts` (puro, con tests), `src/lib/phonemes.ts` (modelo, solo servidor) y `POST /api/read-aloud/phonemes`. Se ve en **Read aloud** (no en las tarjetas de Flashcards).

- **Flujo**: la grabación se transcribe y se puntúa como siempre (`/api/transcribe` + `/api/read-aloud`, sin cambios). Después el navegador manda el mismo WAV, la oración y la transcripción a `/api/read-aloud/phonemes`; el resultado no espera a esa llamada, y la sección **Sound check · Beta** aparece debajo cuando llega. La ruta recalcula el puntaje con `scoreReading` (determinista) para que los chequeos coincidan con los problemas guardados.
- **Modelo**: `onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX` (q8, 318 MB) con transformers.js en CPU. Se carga **perezosamente** en la primera lectura, en segundo plano, y queda en `PHONEME_MODEL_DIR` (por defecto `data/models/`, ignorado por git). Mientras se baja, la respuesta es `preparing` con el progreso y la UI dice "Getting the sound model ready (N%): a one-time download of about 320 MB. It starts working on your next reading". Si la carga falla, la respuesta es `unavailable` y no se vuelve a intentar por 5 minutos (para no bajar 318 MB en cada lectura). `PHONEME_CHECK=false` lo apaga del todo. En cualquier caso la lectura y su puntaje funcionan igual: el chequeo es solo un extra.
- **Tiempos** (esta máquina: 16 hilos, WSL2): la inferencia de un clip de 2,5–3 s tarda **0,2–0,35 s** en el proceso de Next (incluye decodificar y comparar); cargar el modelo ya bajado tarda ~1 s; la primera vez (descarga + carga, en esta conexión) quedó lista en menos de 45 s. Las inferencias se encolan de a una. Como la llamada es aparte y la hace el navegador después del resultado, no está en el camino crítico; no hizo falta moverla a un worker. Grabaciones de más de 60 s o que no sean WAV 16 kHz mono se rechazan.
- **Esperado → IPA**: CMU (ARPAbet con acento) → los símbolos del vocabulario del modelo: AH0 = /ə/, ER0 = /ɚ/, el resto por tabla. Si una palabra tiene varias pronunciaciones se elige la que mejor encaja con lo escuchado. Los fonemas "pegados" del modelo (_ɔːɹ_, _əl_) se separan antes de alinear.
- **Formas débiles**: el diccionario trae la forma plena (_to_ = /tuː/), así que hay una lista corta de palabras que en el habla suenan débiles: _a, an, and, can, for, from, of, than, the, to, was_. No se chequean al final de la oración ni (para _to, the, a, an_) antes de una vocal (_to eat_, _the apple_), donde la forma plena es normal. Quedaron afuera _at, are, have, had_… a propósito: la versión con esas palabras daba falsas alarmas en clips correctos del set sintético.
- **Schwa** (`schwa_reduction`): una vocal que debía reducirse (AH0/ER0 o la vocal de una forma débil) y se escuchó como vocal plena. La ɪ y la ɚ escrita como ɜː no cuentan. El detalle dice qué se escuchó: "/ə/ → /uː/".
- **Segunda señal para lo que ya existe (#133)**: (1) para cada problema que encontró la transcripción en `th_sounds`, `b_v`, `vowel_length` o `vowel_quality`, el chequeo mira los sonidos de esa palabra y anota **"the sounds say the same, /θ/ → /t/"** (confirmado) o **"the sounds came out right, so the transcript may have misheard this word"** (el modelo escuchó bien el sonido); si el sonido no se escuchó, no anota nada. Para las vocales agrupa variantes de escritura del modelo (ɑ/ɑː, oʊ/o, eɪ/e). (2) En palabras que la transcripción escuchó bien, avisa de _th_ dicho como t/d/s/z/f y de _v_ dicho como b/β/p (los dos sonidos más claros). No cambia las estadísticas: nada de esto se guarda ni cuenta, y las reglas de `pronunciation-core.ts` quedan igual. Cambiarlas (por ejemplo, descartar un problema que los sonidos desmienten) es decisión para después del eval con grabaciones reales.
- **Taxonomía**: `schwa_reduction` está en `PRONUNCIATION_CATEGORIES` con etiqueta y consejo en español e inglés, pero figura en `BETA_PRONUNCIATION_CATEGORIES`: `summarizePronunciation` la ignora, no tiene oraciones de práctica, `parseFocus` y `/api/read-aloud` no la aceptan y no se guarda en `pronunciation_issues`. Quitarla de esa lista es el paso final cuando el eval la valide. `word_stress` sigue afuera.
- **Sin cambios de esquema**: no se guarda nada nuevo.

Sobre el set sintético (`real.mts --synthetic`, el mismo código que usa la app): schwa **16/22**, th 3/4, b/v 1/2 y **0 falsas alarmas en 26 clips correctos**, 0,26 s por clip.

## Acento de palabra por prosodia (#134)

Se midió cada rasgo por separado (volumen = pico en dB, tono = F0 mediana, duración = frames de la vocal) sobre la alineación de wav2vec2, en el set sintético de Kokoro (dos voces). El mejor voto es la vocal que más sobresale. `phonemes.mts` imprime `stressByFeature`; aciertos de la sílaba acentuada, por voz (af = femenina, am = masculina) y clase de clip (acento movido / correcto / vocales plenas):

| Rasgos             | af: movido / correcto / plenas | am: movido / correcto / plenas |
| ------------------ | ------------------------------ | ------------------------------ |
| los tres           | 4/8 · 5/8 · 5/7                | 8/8 · 8/8 · 6/7                |
| solo volumen       | 5/8 · 4/8 · 5/7                | 6/8 · 8/8 · 5/7                |
| solo tono          | 5/8 · 6/8 · 5/7                | 7/8 · 6/8 · 7/7                |
| solo duración      | 4/8 · 4/8 · 3/7                | 4/8 · 5/8 · 3/7                |
| volumen + tono     | 5/8 · 5/8 · 5/7                | 8/8 · 8/8 · 6/7                |
| tono + duración    | 5/8 · 6/8 · 5/7                | 6/8 · 8/8 · 7/7                |
| volumen + duración | 4/8 · 5/8 · 5/7                | 4/8 · 8/8 · 5/7                |

Referencia: elegir siempre la primera sílaba acierta 22/46 (48 %).

- **La duración sola no sirve** (4/8–5/8, como el azar): el habla sintética casi no alarga la vocal acentuada y las vocales de sílabas átonas con vocal plena se alargan también. Ayuda poco o nada sumada.
- **Volumen y tono llevan la señal**, y su suma es lo mejor (am 22/23, af 14/23, igual que el spike). Con la voz femenina ningún rasgo pasa de ~65 %.
- La variación entre voces (am ≈ 95 %, af ≈ 60 %) es el problema: no hay un umbral que sirva para las dos, y el habla sintética exagera el acento más que una persona. Con grabaciones reales y un acento hispano, donde el acento de palabra se aplana, hay que esperar peor, no mejor.
- **Decisión: no hay función en la app** y `word_stress` no entra a la taxonomía. Se vuelve a medir con grabaciones reales (`real.mts` imprime `stressAccuracy` por rasgo para las lecturas correctas y las de acento movido; el set de grabación incluye 9 palabras con su sílaba acentuada). Umbral para reconsiderar: ≥ 85 % en lecturas correctas **y** ≥ 80 % en acento movido, con la voz del alumno, y solo como pista (beta), nunca en estadísticas.

## wav2vec2 en el navegador (#135)

Medido con `scripts/spike/pron-audio/browser.mts`: Chrome 126 headless (`--disable-gpu`, sin WebGPU) en esta máquina (16 hilos, WSL2), con transformers.js 3.8.1 y ONNX Runtime Web en **WASM**, modelo q8, un clip de 2,5 s. Los archivos se sirven desde localhost, así que **los tiempos de descarga no se midieron**: lo medido son los tamaños y la ejecución.

| Qué                                                    | Valor                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Descarga (medida: tamaños)                             | modelo **318 MB** + runtime WASM **21,6 MB** + transformers.js 0,9 MB; Kokoro pesa 326 MB en fp32 y 92 MB en q8 (ver [VOICE.md](VOICE.md)) |
| Descarga (estimada, tamaño / ancho de banda)           | ~51 s a 50 Mbps, ~4 min a 10 Mbps (una vez; queda en la caché del navegador)                                                               |
| Carga del modelo desde la caché (medida)               | 0,8 s (4 hilos), 5,4 s (1 hilo, primera carga de la página)                                                                                |
| Inferencia de 2,5 s de audio, 4 hilos (medida)         | **1,5–1,65 s** (factor de tiempo real ~0,65)                                                                                               |
| Inferencia, 1 hilo (medida)                            | 1,8–6,5 s (varió mucho entre corridas)                                                                                                     |
| Memoria JS (medida)                                    | ~330 MB de heap, más la memoria de WASM del modelo (no medida)                                                                             |
| Servidor, mismo clip (medida, Node + onnxruntime-node) | 0,2–0,35 s                                                                                                                                 |

- **Hilos**: necesita aislamiento entre orígenes (`crossOriginIsolated`), que la app ya activa para Kokoro (COOP/COEP en `next.config.ts`). Sin eso quedaría 1 hilo (medido: 1,8–6,5 s por clip, y muy variable).
- **WebGPU**: no se midió (el Chrome headless de esta máquina no tiene GPU). Hay motivos para no apostar a eso: en la RX 9070 XT, Kokoro daba ruido con WebGPU (ver "Kokoro suena a ruido" en [VOICE.md](VOICE.md)), el mismo ONNX Runtime Web; y los reportes de q8 en WebGPU también son de ruido. Si se usa el navegador, sería WASM.
- **Decisión**: en esta fase **se queda en el servidor** (más rápido: ~5×, cero descarga para el navegador, ya funciona y se apaga con `PHONEME_CHECK=false`). Pasar al navegador solo tiene sentido si la app se despliega en un servidor sin CPU para esto (o para no subir el audio); costaría 340 MB de descarga más una inferencia de ~1,6 s por oración, aceptable para una pista en segundo plano. Para eso habría que mover `analyzePhonemes` a un worker del navegador (es puro, ya sirve) y reutilizar el patrón de `kokoro.worker.ts`. Queda como Backlog para cuando haya un deploy.

## Eval con grabaciones reales (#136)

Todo listo para correr cuando haya grabaciones; falta que el usuario las grabe. `scripts/spike/pron-audio/real.mts` (con `recording-set.ts` y `model.ts`):

```sh
pnpm tsx scripts/spike/pron-audio/real.mts --list        # qué grabar, con la instrucción de cada clip
pnpm tsx scripts/spike/pron-audio/real.mts --init        # escribe data/pron-real/manifest.json
# grabar los WAV en data/pron-real/ con los nombres del manifiesto
pnpm tsx scripts/spike/pron-audio/real.mts               # evalúa la carpeta
pnpm tsx scripts/spike/pron-audio/real.mts --synthetic   # el set de Kokoro, para probar el script
```

- **Manifiesto** (`data/pron-real/manifest.json`, ignorado por git): `{ "clips": [{ file, text, kind: ok|schwa|stress|accent, errors: [categorías], words?, stress?: {word, syllable}, transcript? }] }`. Se pueden agregar oraciones propias a mano; `transcript` (lo que oyó Whisper) es opcional y, si está, también evalúa los chequeos sobre los problemas de la transcripción.
- **Salida**: una fila por clip (qué se escuchó en IPA, hints, categorías encontradas / no encontradas / inesperadas, ms) y un resumen: **recall por categoría** (`schwa_reduction`, `th_sounds`, `b_v`) en los clips con error hecho a propósito, **falsas alarmas en lecturas normales** (el número que decide si la schwa puede contar en las estadísticas) y la **precisión del acento de palabra por rasgo**. El detalle queda en `.eval-results/pron-real-*.json`.
- **Criterio sugerido para pasar `schwa_reduction` a estadísticas**: falsas alarmas ≤ 10 % de las lecturas normales del propio alumno (con su acento) y recall ≥ 60 % en schwa deliberada. Los números del set sintético (0 % y 73 %) son el techo, no la meta.

### Guía de grabación

- **Set completo**: 33 clips (~15 min): 10 oraciones × (normal, con vocales plenas, con el acento movido; _hotel_ y _record_ sin vocales plenas, _to_ sin acento movido) + 3 oraciones con acento hispano marcado (normal y exagerado). **Mínimo** (si falta tiempo, `--list` los marca con `*`): _develop_, _photographer_, _banana_, _to_ y _student-accent_, normal y con error (13 clips).
- **Cómo**: en un lugar silencioso, a distancia normal del micrófono, una toma por clip (si te equivocás, repetí). Las lecturas **normales** son con **tu acento y tu ritmo de siempre**, sin intentar hablar perfecto: justo eso mide las falsas alarmas. Las del error se hacen a propósito, como dice `--list` (por ejemplo "decí todas las vocales de _banana_ plenas, letra por letra").
- **Formato**: WAV de 16 bits (cualquier frecuencia de muestreo y mono o estéreo; el script lo pasa a 16 kHz mono). Si grabás con el celular (m4a/mp3), convertí: `ffmpeg -i in.m4a -ar 16000 -ac 1 out.wav`. Audacity: Exportar → WAV 16-bit PCM.
- **Nombres y lugar**: `data/pron-real/<id>.wav`, con el id del manifiesto: `develop-ok.wav`, `develop-schwa.wav`, `develop-stress.wav`, `student-accent.wav`, `student-accent-ok.wav`… (la carpeta está bajo `data/`, ignorada por git; no se sube nada). Los clips que falten se avisan y se saltean.

## Pendiente (en el tablero como Backlog)

- **Correr el eval con las grabaciones del usuario** y decidir si `schwa_reduction` (y los extras de th y b/v) pasan a estadísticas, con oraciones de práctica con formas débiles.
- **Acento de palabra por prosodia**: repetir la medición con grabaciones reales (arriba); solo si pasa el umbral, categoría `word_stress`.
- **wav2vec2 en el navegador** si la app se despliega (arriba).
- Ver el sonido del chequeo también en las tarjetas "Hard to say" de Flashcards (hoy solo en Read aloud).

## Limitaciones del spike

- Audio sintético: ninguna medida acá vale como precisión con alumnos reales; sirve para descartar (Gemini abierto) y para elegir qué validar (wav2vec2).
- Pocos clips (33 por voz, 18 en la pregunta cerrada a Gemini) y una sola corrida por modelo.
- Los cupos de Gemini son por proyecto y por modelo y cambian; los del proyecto se ven en AI Studio. La corrida gastó ~34 pedidos de `gemini-flash-lite-latest` (el modelo de la app) y el cupo diario de `gemini-3.8-flash` y `gemini-3.5-flash`.
