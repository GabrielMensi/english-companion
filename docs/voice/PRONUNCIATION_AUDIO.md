# Pronunciación desde el audio: schwa, acento de palabra y acento

> Area: Voice · Kind: Research · Status: Decided · Board: #74

La lectura en voz alta (fase 3 de [VOICE.md](VOICE.md), #53) compara lo que Whisper transcribe con el texto esperado. Eso detecta sonidos que cambian la palabra que se escucha (*ship / sheep*), pero no puede ver lo que no cambia la transcripción: **vocales plenas en lugar de schwa** (*to* como /tuː/, *banana* con tres "a" claras), **acento de palabra** (*DEvelop*, *PHOtographer*) ni el **acento** en general. Este documento compara opciones para medirlo desde el audio, cuenta qué se midió en un spike (2026-10-07) y termina con una decisión.

Contexto: la app va a ser solo APIs (#72: sin Ollama ni LLMs locales; Kokoro se queda) y free-first.

## Opciones

| Opción | Qué mide | Costo / límites | Dónde corre |
|---|---|---|---|
| **Whisper (Groq)**, lo que hay hoy | Palabras; timestamps por palabra | Gratis, ~8 h de audio por día | API |
| **Gemini multimodal, feedback abierto**: audio + texto, "listá los problemas" con categorías fijas | Todo, en teoría | Free tier: **20 pedidos por día por modelo** en los Flash (medido); omni: sin free tier | API |
| **Gemini multimodal, pregunta cerrada**: "¿qué sílaba de *develop* acentuaste? ¿redujiste las vocales?" | Acento y schwa de una palabra conocida | Ídem | API |
| **wav2vec2 de fonemas** (`onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX`) con transformers.js | Los fonemas que se dijeron (IPA, sin marcas de acento) | Gratis; modelo de 318 MB (q8) que se baja una vez | **CPU**, en Node (onnxruntime-node, ya instalado con transformers.js) o en el navegador como Kokoro. No necesita GPU ni Python |
| **Prosodia sobre la alineación de wav2vec2**: volumen, tono y duración de cada vocal | Qué sílaba sobresale (acento de palabra) | Gratis | CPU, sin modelo extra |
| **Azure Pronunciation Assessment** | Precisión por fonema, fluidez, prosodia (incluye acento de palabra) | Requiere cuenta de Azure; la evaluación de pronunciación figura como add-on pago (~USD 1/h según la comunidad; no encontré cupo gratis claro en F0) | API |
| Speechace / SpeechSuper / ELSA API | Lo mismo que Azure, especializados | Pagos | API |

Descartadas sin medir: Azure y las APIs especializadas son las más completas pero no son free-first (quedan como plan B si la calidad lo exige); OpenAI audio es pago; la Web Speech API del navegador no da fonemas ni confianza útil.

## El spike

Código en `scripts/spike/pron-audio/` (experimental, **no está conectado a la app**). No había grabaciones reales de lectura (la tabla `read_aloud_attempts` está vacía y no hay `data/asr-samples/`), así que el set de prueba es **sintético con una verdad conocida**: Kokoro lee IPA escrito a mano, así que cada clip dice exactamente lo que se le pidió.

- `clips.ts`: 10 palabras en una oración (*develop, photographer, comfortable, banana, hotel, record, present, computer, vegetables, to*) en tres versiones: **correcta**, **acento movido** (*DEvelop*, *comforTAble*, *REcord* → *reCORD*) y **vocales plenas** en lugar de schwa (*devel-o-p*, *ba-na-na*, *to* = /tuː/). Más 3 oraciones con **acento hispano** completo (*"tink dis is a beri gud estudent"*) y su versión correcta. 33 clips por voz, con dos voces americanas (`af_heart`, `am_michael`).
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
- **Sanidad del set**: el modelo escucha los cambios en 20 de 31 clips con sonidos cambiados. Kokoro no siempre los realiza: en *present* y *vegetables* con vocales plenas (una voz) volvió a la schwa, y en las oraciones con acento hispano "corrigió" casi todas las consonantes (*th*, *b/v*). Las oraciones de acento quedaron flojas como prueba.
- **Schwa** (vocales reducidas de la pronunciación correcta que se escucharon como vocal plena; la pronunciación correcta saldría del CMU Pronouncing Dictionary, que ya tiene el acento de cada vocal): **16 de 22** clips detectados, **0 falsas alarmas en 24** clips correctos. Las que faltan son, en su mayoría, clips donde Kokoro no realizó el cambio. El detector dice además qué se escuchó (*ə → ɑː* en *computer*, *ɚ → ɔːɹ* en *record*), que sirve como explicación.
- **Acento de palabra** (heurística: la vocal de la palabra con más volumen + tono + duración): con la voz masculina acertó la sílaba acentuada en 8/8 clips con el acento movido, 8/8 correctos y 6/7 con vocales plenas; con la femenina, 4/8, 5/8 y 5/7 (tiende a elegir la primera sílaba). Prometedor pero frágil: depende de la voz, y el habla sintética exagera el acento. Elegir siempre la primera sílaba acierta 22/46.

### Gemini

- **Feedback abierto, `gemini-flash-lite-latest`** (el modelo que usa la app): no sirve. De las 16 palabras cambiadas marcó con certeza solo *hotel* (acento) y, con otra categoría, *computer* con vocales plenas; como mucho otras 3 (sus respuestas quedaron truncadas en el log de esa primera corrida). La oración de *develop* con acento hispano sacó 5/5, "suena nativo". En cambio **inventó errores en audio correcto** (5 de 13 clips correctos: *th* en *"This"*, *"think"*, acento en *photographer*), porque el prompt dice que el que habla es hispanohablante.
- **Feedback abierto, `gemini-flash-latest`** (hoy = `gemini-3.8-flash`): marcó `word_stress` en **todas** las palabras, también en las versiones correctas (*develop*, *photographer*, *comfortable*), con puntajes de acento de 3,5 sobre 5 para audio sin errores. Se cortó a los 7 clips: **cupo del free tier de 20 pedidos por día por modelo** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`). Con eso no alcanza ni para una sesión de práctica.
- **Pregunta cerrada, `gemini-3.5-flash`** (18 clips): encontró el acento movido en 5 de 6 palabras (*DEvelop*, *PHOtographer*, *comforTAble*, *BAnana*, *COMputer*), pero también lo "movió" en 2 de 6 palabras correctas (*comFORtable*, *preSENT*) y en 4 de 6 con vocales plenas. Sobre las vocales reducidas respondió siempre "no reducidas": **ninguna señal de schwa**. 4,5 s por pedido.
- `gemini-omni-1.1-flash`: sin cupo en el free tier.

El problema de fondo con un LLM de audio es el mismo que con Whisper pero al revés: sabe qué *debería* decirse y de quién se trata, y responde con eso más que con lo que escuchó.

## Decisión

1. **Schwa y formas débiles: wav2vec2 de fonemas en CPU**, sobre los intentos de lectura en voz alta (donde se conoce el texto). Es gratis, rápido, no depende de cupos, no necesita GPU ni Python, y no inventó errores en audio correcto. Usa el mismo stack que Kokoro (transformers.js / ONNX), así que no contradice el "solo APIs" de #72, que es sobre LLMs. Antes de que cuente en las estadísticas hay que validarlo con grabaciones reales (la voz sintética es más limpia que la de un alumno).
2. **Acento de palabra: todavía no.** La heurística de prosodia sobre la alineación de wav2vec2 es la candidata (gratis, sin cupo), pero hay que medirla con grabaciones reales. Gemini con pregunta cerrada queda a lo sumo como "segunda opinión" a pedido, nunca para estadísticas: 20 pedidos por día y falsas alarmas en palabras correctas.
3. **Feedback abierto de acento con Gemini: descartado.** Inventa errores, se pierde los reales y el free tier no lo sostiene.
4. **De paso**: los fonemas son una segunda señal para las categorías que ya existen (*th*, *b/v*, vocales), que no depende de que Whisper complete por contexto. Puede levantar la "cota mínima" de la lectura en voz alta.
5. Si algún día la calidad pesa más que free-first, el plan B es Azure Pronunciation Assessment.

`schwa_reduction` y `word_stress` siguen fuera de `PRONUNCIATION_CATEGORIES` hasta que haya un detector validado; el spike los usa solo localmente.

## Pendiente (en el tablero como Backlog)

- **Eval con grabaciones reales**: página de grabación (como `/eval/asr`) para el set del spike y oraciones propias, con la versión correcta y otra con el error hecho a propósito; correr `phonemes.mts` sobre esas grabaciones.
- **Feature: schwa y formas débiles en Read aloud** con wav2vec2: fonemas esperados desde CMU (ARPAbet con acento → IPA), alineación, categoría `schwa_reduction` con consejo en español e inglés, oraciones de práctica con formas débiles.
- **Acento de palabra por prosodia** (research): medir la heurística con grabaciones reales; si sirve, categoría `word_stress`.
- **Fonemas para las categorías existentes**: usar wav2vec2 junto a Whisper en Read aloud.
- **wav2vec2 en el navegador** (WASM / WebGPU, como Kokoro): medir descarga y velocidad, por si la app se despliega.

## Limitaciones del spike

- Audio sintético: ninguna medida acá vale como precisión con alumnos reales; sirve para descartar (Gemini abierto) y para elegir qué validar (wav2vec2).
- Pocos clips (33 por voz, 18 en la pregunta cerrada a Gemini) y una sola corrida por modelo.
- Los cupos de Gemini son por proyecto y por modelo y cambian; los del proyecto se ven en AI Studio. La corrida gastó ~34 pedidos de `gemini-flash-lite-latest` (el modelo de la app) y el cupo diario de `gemini-3.8-flash` y `gemini-3.5-flash`.
