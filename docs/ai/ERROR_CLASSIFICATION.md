# Clasificación de errores en dos etapas (Jev / Kev / Jeeves)

> Area: AI pipeline · Kind: Research · Status: Done (LLM backend; Kev discarded with the local models in #72) · Board: #11

> Los modelos locales (Ollama) se quitaron en #72 ([LOCAL_MODELS.md](LOCAL_MODELS.md)): lo que sigue sobre GPU, Ollama y Kev es historia. El backend LLM clasifica con la misma cadena Gemini/Groq del chat.

Estado (2026-09-29): **pasos 1–3 del plan implementados** con el backend LLM, y el 4 en parte (56 errores etiquetados de los ~150 previstos) (ver "Implementado"). Kev / Jev / Jeeves siguen como investigación. Relacionado con [VERB_TENSES.md](../practice/VERB_TENSES.md) y [VOICE.md](../voice/VOICE.md).

## La idea

Hoy un solo llamado al LLM hace todo: corrige, detecta cada error, elige categoría entre 23, inventa una subcategoría, decide la gravedad, explica, traduce los `[corchetes]` y (en modo conversación) responde. Si queremos una taxonomía más fina (tiempos verbales, tipos de preposición, etc.), el prompt crece y los modelos locales empeoran.

Propuesta: separar en dos etapas.

1. **Detectar** (el LLM actual, el que habla): corrige y marca cada error con `original`, `correction`, categoría gruesa y explicación. Su prompt queda igual o más corto.
2. **Clasificar** (un modelo de decisión aparte): para cada error, elige el tipo fino de una lista fija, con probabilidades calibradas.

## Qué son Jev y Kev

**Jev** ([TypeSafe AI](https://docs.typesafe.ai/introduction)) es un modelo "System One": no genera texto. Recibe un texto (`state`) y preguntas tipadas, y devuelve respuestas con probabilidades, todas en paralelo:

- `choice`: elegir una opción de una lista (hasta 255 opciones, cada una con descripción).
- `score`: puntuar en una escala ordenada (2–10 niveles).
- `noul`: probabilidad de que una afirmación sea verdadera (0–1).

TypeSafe dice que responde en 70–500 ms y que es 40–200× más rápido y 40–400× más barato que un LLM de frontera, pero los benchmarks son propios y no tienen validación independiente. Salió en **early access limitado el 15/09/2026**, sin precios publicados, y los pesos son cerrados ([Wikipedia](<https://en.wikipedia.org/wiki/Jev_(AI_model)>), [API](https://docs.typesafe.ai/api.md)).

**Kev** ([jaredpalmer/kev](https://github.com/jaredpalmer/kev)) es la alternativa open source (Apache-2.0): la misma API (`POST /v1/systemone`, compatible con el SDK de TypeSafe), implementada como un adapter LoRA sobre Qwen3.5/3.8 más una "pointer head" que lee las opciones en vez de generarlas.

| Modelo           | VRAM   | Backends        | Precisión en fuentes nuevas (dev / test) |
| ---------------- | ------ | --------------- | ---------------------------------------- |
| Kev-0.8B         | ~4 GB  | CUDA, ROCm, MLX | no publicada en la tabla principal       |
| Kev-4B           | ~17 GB | CUDA, ROCm, MLX | 0.817 / 0.838                            |
| Kev-9B           | ~17 GB | CUDA, ROCm, MLX | 0.822 / 0.852                            |
| Kev-27B          | ~66 GB | solo CUDA       | 0.848 / 0.896                            |
| Jev (referencia) | API    | —               | 0.857                                    |

Otros datos del README que importan para nosotros:

- Servidor Python (`uv run --extra serve python -m kev.serve --run jaredpalmer/kev-4b`). **No hay GGUF ni soporte en Ollama**, y tampoco Vulkan.
- Cachea el texto: hacer más preguntas sobre el mismo mensaje solo paga por las preguntas.
- Fine-tuning con JSONL (`state` + `questions` con `label`). Recomiendan **≥ 1000 ejemplos**; con 400 la mejora "quedó dentro del ruido". Una corrida de Kev-4B cuesta ~1 USD en una H100 (se puede usar Modal).
- Limitaciones declaradas: la respuesta puede cambiar si cambia el orden de las opciones; las preguntas que dependen de conocimiento tienen el techo del modelo base (MMLU 0.74 en Kev-9B vs 0.90 de Jev); el entrenamiento se hizo con textos de hasta 384 tokens; solo está documentado en inglés; y los benchmarks son de tareas tipo "ruteo de tickets", no de lingüística.

**Jeeves** ([PostHog/jeeves](https://github.com/PostHog/jeeves), MIT) es otra implementación compatible con la misma API. La diferencia es que **razona antes de decidir**. Sobre Qwen3.5-9B con LoRA y pointer head, entrenado con SFT y después con RL (CISPO):

- Supera a Kev-9B y a Jev en datos que no vio durante el entrenamiento (0.889 vs 0.822 y 0.857). Es justo el caso de un dominio nuevo como la gramática.
- Es lento: ~0,3 s sin razonamiento, 3,3 s de mediana con razonamiento y 17 s en el p90, en una H100.
- **Solo corre con CUDA en GPUs Hopper** (kernels FP8). En la RX 9070 XT no corre; solo sería viable en la nube (Modal) y con costo.
- Para nosotros confirma algo: si la clasificación no tiene que ser instantánea, un clasificador más lento y que razone da mejores resultados. Ver "Cuándo clasificar".

## ¿Es buena idea?

**La arquitectura de dos etapas, sí. Kev como pieza hoy, todavía no: hay que evaluarlo.**

Por qué la separación es buena:

- **Taxonomía fija por construcción**: un `choice` no puede inventar categorías, que es exactamente la regla del proyecto (`taxonomy.ts`). Se terminan los `subcategory` libres que hoy no se pueden agrupar.
- **Probabilidades calibradas**: si la confianza es baja, el error queda "sin clasificar" en vez de ensuciar las estadísticas. Hoy no hay forma de saber cuándo el modelo dudó.
- **El prompt del LLM no crece**: agregar 60 subtipos o 15 tiempos no le cuesta nada al modelo que conversa y corrige. Eso ayuda a los modelos locales y, con la voz, a la latencia: la respuesta hablada sale primero y la clasificación se completa después.
- **Encaja con las preguntas que queremos hacer**: `choice` para el tipo fino y para `tense` / `tenseUsed`, `score` para la gravedad (con su distribución, no solo una etiqueta) y `noul` para "¿es interferencia del español?".
- **Se puede reclasificar el historial** cuando cambie la taxonomía, sin volver a detectar los errores.

Por qué Kev no está listo para depender de él:

- **Hardware**: Kev-4B y Kev-9B necesitan ~17 GB y la RX 9070 XT tiene 16 GB: no entran ni solos. Kev-0.8B (~4 GB) sí entra, incluso al lado de `gemma4:12b` (~7,6 GB), aunque conviene no tener los dos cargados a la vez (ver "Cuándo clasificar"). Y corre con ROCm (no Vulkan), así que habría que confirmar que ROCm en WSL soporta RDNA4 (gfx1201); si no, queda CPU o Windows nativo, que no están documentados.
- **Dominio**: está entrenado para decisiones tipo soporte o moderación. Distinguir _present perfect_ de _past simple_ o una preposición dependiente de una de lugar es conocimiento lingüístico, y en eso el techo es el modelo base; con 0.8B probablemente es bajo. Sin fine-tuning no hay garantía de que le gane al LLM que ya tenemos.
- **Fine-tuning**: necesita ≥ 1000 ejemplos etiquetados. Hoy la base tiene 7 mensajes y 36 errores. Se puede generar un dataset sintético con Gemini (errores típicos de hispanohablantes con su etiqueta), pero es un proyecto en sí mismo.
- **Jev**: cerrado, en early access y sin precios, choca con "local y gratis". Como Kev tiene la misma API, un solo cliente sirve para los dos; Jev puede quedar como proveedor opcional si algún día tiene free tier.

## Cuándo clasificar: diferido, fuera del chat

Hoy todo pasa en **un solo prompt**: el mismo llamado corrige, detecta, categoriza, explica y responde. En la propuesta de dos etapas, la clasificación fina es **otro llamado, separado**. Queda decidir _cuándo_ corre. Propuesta: **diferida**, nunca en el camino del chat.

**El chat queda igual que hoy.** El LLM devuelve la corrección, los errores con categoría gruesa, gravedad y explicación, la versión nativa y la respuesta. Lo único que cambia es que se le piden menos cosas (la `subcategory` libre desaparece o queda solo como pista), así que puede ser igual de rápido o más. Cada error se guarda con `classification: "pending"`.

**La clasificación fina corre después, en lotes:**

- **Al abrir el dashboard**: si hay errores pendientes, se muestra "Classifying 12 new mistakes…" con los datos gruesos, y los paneles finos (tiempos verbales, subtipos) se completan cuando termina. No bloquea la página.
- **Cuando la app está inactiva**: si no hubo mensajes en N minutos (p. ej. 5), un job clasifica lo pendiente. Así, en general, el dashboard ya está al día cuando lo abrís.
- **Manual**: botón "Classify now" y un script para reclasificar el historial cuando cambie la taxonomía.

**Un solo modelo local a la vez**: un lock de GPU en el servidor.

- El chat tiene prioridad. Si llega un mensaje mientras corre un lote, el lote se pausa entre errores y se retoma después.
- Si el clasificador es Kev (un servidor Python aparte, fuera de Ollama), antes del lote se descarga el modelo de Ollama (`keep_alive: 0`) y al terminar se libera Kev. Con el backend LLM ni siquiera hace falta: clasifica el mismo `gemma4:12b` que ya está cargado.

**Ventajas de diferir:**

- El chat no suma latencia ni VRAM.
- **Lotes**: con el backend LLM se pueden clasificar 10–20 errores en un solo llamado (con la oración de cada uno), que es mucho más barato que uno por error. Con Kev, el cache de texto hace lo mismo.
- **La velocidad deja de importar**, así que se puede usar el mejor clasificador disponible aunque sea lento: un LLM con razonamiento, Gemini Flash (el completo, que tiene pocos requests diarios gratis y alcanza para lotes), o algo tipo Jeeves.
- Reclasificar todo el historial es la misma operación que clasificar lo nuevo.

**Costos:**

- Las estadísticas finas pueden estar atrasadas unos minutos. El dashboard tiene que mostrar cuántos errores están pendientes y no contarlos como "sin errores".
- En el chat, cada error muestra la categoría gruesa. El subtipo fino aparece al volver a abrir el mensaje, o se omite en el chat.
- Hace falta estado persistente (`pending / done / failed`, intentos) para que un lote cortado se retome.

**Cuando el chat usa un modelo remoto** (Gemini), no hay conflicto de GPU y el lote podría correr enseguida. Por simplicidad, mejor usar siempre el mismo mecanismo diferido.

## Recomendación

Construir la etapa de clasificación detrás de una interfaz propia (igual que `resolveModel`), con dos backends posibles, y decidir con datos:

```ts
// src/lib/ai/classify.ts
interface ErrorClassifier {
  classify(input: { text: string; errors: DetectedError[] }): Promise<ClassifiedError[]>;
}
// Backends: "llm" (el LLM actual, llamado aparte, con enums chicos por categoría)
//           "systemone" (Kev local o Jev, mismo endpoint /v1/systemone)
```

- El backend **LLM** funciona ya con Ollama, Gemini y Groq. Clasifica con una pregunta por error y solo con los subtipos de _esa_ categoría (un enum de 3 a 8 valores, que los modelos locales manejan bien). Cuesta un llamado extra y no da probabilidades, pero es la base y además sirve para generar datos de entrenamiento.
- El backend **systemone** se activa si la evaluación muestra que Kev iguala o supera al LLM. Aporta confianza calibrada y velocidad.
- Los tiempos se pueden contar sin ningún modelo (compromise, ver [VERB_TENSES.md](../practice/VERB_TENSES.md)); el clasificador solo resuelve `tense` / `tenseUsed` de cada error.

### Preguntas por error (formato systemone)

`state` = la oración original + el fragmento + la corrección. Preguntas jerárquicas, para que ninguna tenga opciones que no correspondan:

```json
{
  "state": { "sentence": "I live here since 2020", "original": "I live", "correction": "I have lived" },
  "questions": {
    "subtype": {
      "type": "choice",
      "instructions": "Which rule was broken?",
      "criteria": {
        "tense_choice": "Wrong tense for the meaning",
        "tense_form": "Right tense, wrong conjugation",
        "time_clause": "Future after when/if/as soon as"
      }
    },
    "tense": {
      "type": "choice",
      "instructions": "Which tense did the sentence need?",
      "criteria": { "present_perfect": "...", "past_simple": "...", "...": "..." }
    },
    "tenseUsed": { "type": "choice", "instructions": "Which tense did the learner use?", "criteria": { "...": "..." } },
    "severity": {
      "type": "score",
      "instructions": "How much does it affect understanding?",
      "criteria": ["Minor", "Moderate", "Major"]
    },
    "l1Transfer": { "type": "noul", "instructions": "The mistake comes from translating Spanish literally." }
  }
}
```

La categoría gruesa la sigue eligiendo el LLM (ya lo hace bien, 93–96 % en `eval:models`). Si en la evaluación resulta que Kev la elige mejor, se le pasa también.

### Taxonomía fina

Se agrega a `taxonomy.ts` un segundo nivel fijo, `SUBTYPES: Record<ErrorCategory, Record<string, string>>` (nombre → descripción, que sirve igual como `criteria` para systemone y como hint para el LLM). Reemplaza al `subcategory` libre; el campo viejo queda para mostrar y para las filas históricas. Ejemplos:

- `verb_tense`: `tense_choice`, `time_clause`, `sequence_of_tenses`, `stative_in_continuous` (+ `tense` / `tenseUsed`).
- `prepositions`: `dependent_preposition` (_depend on_), `time` (_in/on/at_), `place`, `movement`, `extra`, `missing`.
- `articles`: `missing_a_an`, `generic_the` (_The life is…_), `missing_the_specific`, `extra_with_proper_noun`.
- `spelling`: `keyboard_typo`, `spanish_influenced`, `double_consonant`, `homophone`.

## Plan

1. **Taxonomía fina** en `taxonomy.ts` (`SUBTYPES`, `TENSES`) y migración (`subtype`, `tense`, `tenseUsed`, `classifierConfidence`, `classifier` en `corrections`).
2. **Clasificador LLM diferido** (`classify.ts` + partes puras con tests): columna `classification` (`pending / done / failed`) en `corrections`, job por lotes con lock de GPU, disparado al abrir el dashboard, por inactividad y a mano. El prompt del chat se simplifica (sin `subcategory` libre). Script para reclasificar el historial.
3. **Botón "wrong type"** en cada error: la corrección manual queda guardada como etiqueta. Son datos de evaluación reales y, con el tiempo, de entrenamiento.
4. **Set de evaluación de clasificación**: ~150 errores etiquetados a mano (de `scripts/eval/samples.ts`, de la base y sintéticos), y `pnpm eval:classify <backend>` con precisión por categoría y calibración.
5. **Spike de Kev**: Kev-0.8B en WSL con ROCm (o en Modal para descartar el problema de hardware), cliente `/v1/systemone` y comparación contra el backend LLM en ese set.
6. **Solo si el spike promete**: dataset sintético de ≥ 1000 ejemplos generado con Gemini y validado con el set de evaluación, fine-tuning de Kev-0.8B o Kev-4B en Modal (~1 USD), y nueva evaluación.
7. **Jev / Jeeves**: probar con el mismo cliente si se consigue acceso a Jev, o Jeeves en Modal, como clasificador remoto opcional para lotes.

Criterio de decisión en el paso 5: Kev se queda si, sin fine-tuning, está a menos de 5 puntos del LLM y su confianza sirve para separar aciertos de errores (p. ej. con confianza > 0,8 acierta ≥ 95 %). Si no, se sigue con el backend LLM y Kev se vuelve a evaluar cuando haya datos para fine-tuning.

## Implementado

- `SUBTYPES`, `TENSES` y `TENSE_CATEGORIES` en `src/lib/taxonomy.ts`. El prompt del chat no cambió: sigue devolviendo su `subcategory` libre, que queda como detalle.
- Columnas nuevas en `corrections`: `subtype`, `tense`, `tense_used`, `classification` (`pending / done / failed / skipped`), `classified_by` (`rule`, `user` o `<provider>:<model>`) y `classification_attempts`.
- `src/lib/ai/classify-core.ts` (puro, con tests): reglas sin modelo (sugerencias → `skipped`, typos → `keyboard_typo`, categorías de un solo tipo), prompt por lotes con solo las opciones de la categoría de cada error y normalización contra las listas fijas.
- `src/lib/classification.ts`: job por lotes de 8, que se dispara al abrir el dashboard, tras 5 minutos sin mensajes o a mano (reintentar). El chat tiene prioridad (`withChatPriority`): el lote espera mientras hay un pedido del chat en curso. Usa el mismo modelo y los mismos fallbacks que el chat, así que no carga otro modelo local. Un proveedor caído o sin cuota no cuenta como intento fallido; una respuesta inválida sí (3 intentos → `failed`).
- UI: tipo y tiempo en cada error del chat, botón "Wrong type?" (queda con `classified_by = "user"`), banner de progreso en el dashboard, columna "Main types" y errores frecuentes agrupados por tipo.
- `pnpm eval:classify`: 56 errores etiquetados (18 difíciles, que no aparecen en las descripciones de los tipos), más las etiquetas corregidas en la app con `--with-user-labels`.

Resultados (2026-09-29, lotes de 8):

| Modelo                     | Tipo  | Tiempo | Tiempo usado | s / lote |
| -------------------------- | ----- | ------ | ------------ | -------- |
| `gemini-flash-lite-latest` | 100 % | 96 %   | 100 %        | 3,2      |
| `gemma4:12b` (local)       | 100 % | 89 %   | 96 %         | 5,3      |

El set todavía es chico y lo armé yo: las etiquetas de "Wrong type?" son la medida real. Sobre el historial real (62 errores), los casos que caían en `other` mostraron dos tipos faltantes, que se agregaron: `word_order/noun_modifiers` y `spelling/word_split`.

## Fuentes

- [jaredpalmer/kev](https://github.com/jaredpalmer/kev) (README: API, VRAM, benchmarks, fine-tuning, limitaciones)
- [PostHog/jeeves](https://github.com/PostHog/jeeves) (clasificador con razonamiento, compatible con la API de Jev)
- [TypeSafe docs: Introduction](https://docs.typesafe.ai/introduction) y [API reference](https://docs.typesafe.ai/api.md)
- [Jev (AI model) — Wikipedia](<https://en.wikipedia.org/wiki/Jev_(AI_model)>)
- [Tom's Hardware sobre Jev](https://www.tomshardware.com/tech-industry/artificial-intelligence/typesafe-ais-jev-offers-an-alternative-to-llms-that-claims-to-be-193x-faster-and-445x-cheaper-system-one-type-model-is-bespoke-for-probabilistic-decision-making)
