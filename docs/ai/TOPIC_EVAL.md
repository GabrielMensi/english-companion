# Eval: correcciones en chats de tema y role-play

> Area: AI pipeline · Kind: Eval · Status: Done · Board: [#146](https://github.com/GabrielMensi/english-companion/issues/146), [#147](https://github.com/GabrielMensi/english-companion/issues/147)

Dos preguntas sobre la calidad de las correcciones. Las dos se miden con `pnpm eval:models` (ver [README](../../README.md#modelos-recomendados)).

## 1. ¿Corrige igual de bien en un chat de tema que en una conversación normal? (#146)

En los chats "Talk about…" ([#71](../ROADMAP.md)) el prompt de análisis lleva una regla extra (`TopicPreset.rule`: "eres el entrevistador…") y el mensaje va después de una pregunta de apertura. Puede que la regla de role-play distraiga al modelo de las correcciones.

**Set**: `TOPIC_SAMPLES` en `scripts/eval/samples.ts`: 8 mensajes sintéticos (entrevista, entrevista técnica, stand-up, small talk, noticias de tech) con errores claros típicos de hispanohablantes (30 puntos posibles) y 2 oraciones correctas (para ver falsos positivos).

**Cómo correrlo** (una vez, con el set más chico que responde la pregunta: 8 mensajes x 2 condiciones x 2 modelos = 32 llamadas):

```bash
pnpm eval:models gemini:gemini-flash-lite-latest groq:qwen/qwen3.8-27b --topics-only        # con la regla del tema
pnpm eval:models gemini:gemini-flash-lite-latest groq:qwen/qwen3.8-27b --topics-only --topics-plain  # control: mismos mensajes, conversación normal
```

`--topics` suma el set de temas al set normal; `--topics-only` corre solo los temas. Los dos usan modo conversación con la pregunta de apertura como historia.

### Resultados

Corrida del 29/10/2026 (segunda versión del set: la primera tenía 3 expectativas que eran elecciones de estilo, no errores, y se reemplazaron), una vez, 8 mensajes por condición, con las keys y la configuración de la base del usuario:

| Modelo                     | Con regla de tema | Conversación normal | Falsos positivos (tema / normal) | Segundos promedio (tema / normal) |
| -------------------------- | ----------------- | ------------------- | -------------------------------- | --------------------------------- |
| `gemini-flash-lite-latest` | 100 % (30/30)     | 90 % (27/30)        | 0 / 0                            | 1,9 / 2,0                         |
| `qwen/qwen3.8-27b` (Groq)  | 90 % (27/30)      | 90 % (27/30)        | 0 / 0                            | 3,3 / 3,8                         |

### Conclusión (direccional, n = 8)

En esta corrida chica no se ve que la regla de tema empeore las correcciones: Gemini 100 % con la regla contra 90 % sin ella, Groq 90 % en las dos, 0 falsos positivos y 0 fallas. Con 8 mensajes y 30 puntos, 3 puntos de diferencia son 1 o 2 errores sueltos y están dentro del ruido: no muestra que el tema mejore nada, solo que no hay una pérdida visible. Los errores que quedan sin marcar son los mismos con y sin regla (`am here since`, `make a question`), o sea que dependen del modelo y no del tema.

No es una conclusión definitiva. Antes de cambiar el prompt o confiar en esto como medida habría que repetir con más mensajes y más corridas (los modelos no son deterministas, `temperature: 0.2`). Hasta entonces: no hay motivo para tocar la regla de los temas.

## 2. Correcciones descartadas como ejemplos (#147)

Cada corrección que descartás en el chat (#95/#96) es un caso real donde el modelo se equivocó: tiene que **no** volver a reportar ese fragmento.

```bash
pnpm eval:export-discards                       # lee DATABASE_PATH, escribe .eval-results/discards.json
pnpm eval:models <provider>:<model> --with-discards
```

- La exportación agrupa por mensaje (`discardsToSamples` en `src/lib/eval/discards.ts`, con tests): `expect: []` y `forbidden` con los fragmentos descartados. Los motivos de descarte quedan en el archivo para leerlos, no se puntúan.
- `scoreSample` da un punto por cada fragmento descartado que el modelo deja en paz (cualquier error que lo solape, incluso una sugerencia, cuenta como repetido). La tabla agrega la columna `repeatedDiscards`.
- Con la base `data/dev.db` (copia de la real, 29/10/2026) la exportación encontró 9 correcciones descartadas: 9 entran en 6 mensajes y 0 quedan afuera (se descartan las que ya no aparecen en el texto del mensaje). No se corrió `--with-discards`: queda para cuando se cambie de modelo o de prompt.
- Cada muestra lleva el contexto del chat de origen (modo, regla de respuesta del tema o la práctica, y los turnos anteriores), así que el eval arma el mismo prompt que la app.
- Un fragmento cuenta como repetido si el error que reporta el modelo comparte una palabra (que no sea una palabra funcional) con el descartado: `we go` repite `go there`, pero `going` no repite `go` (`repeatsDiscard`, con tests). Si el fragmento descartado son solo palabras funcionales, se comparan como frase.
- Tu texto no se imprime en la terminal: los mensajes descartados aparecen como `discard #n`. El texto completo queda en `.eval-results/` (local).
- `--check` no se puede combinar con `--topics*`, `--with-discards` ni `--limit`: los umbrales se fijaron sobre el set común.
- Los scripts de eval cargan `DATABASE_PATH` de `.env.local` (`scripts/eval/load-env.ts`, sin pisar variables que ya están en el entorno) y se niegan a crear una base que no existe; antes usaban `data/companion.db` por defecto y dejaban una vacía, sin keys ni chats.
- `.eval-results/` está en `.gitignore`: tu texto es privado y no va a git. Si se quieren ejemplos en el repo, tienen que ser sintéticos.
- No hay umbral en `thresholds.json`: el set depende de cada base y cambia con el tiempo. Se mira a mano, antes de cambiar de modelo o de prompt.
- `eval:classify` no lo usa: las descartadas son errores de detección, no de tipo fino.
