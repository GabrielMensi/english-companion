# Eval: correcciones en chats de tema y role-play

> AI pipeline · Eval · In progress · [#146](https://github.com/GabrielMensi/english-companion/issues/146), [#147](https://github.com/GabrielMensi/english-companion/issues/147)

Dos preguntas sobre la calidad de las correcciones. Las dos se miden con `pnpm eval:models` (ver [README](../../README.md#modelos-recomendados)).

## 1. ¿Corrige igual de bien en un chat de tema que en una conversación normal? (#146)

En los chats "Talk about…" ([#71](../ROADMAP.md)) el prompt de análisis lleva una regla extra (`TopicPreset.rule`: "eres el entrevistador…") y el mensaje va después de una pregunta de apertura. Puede que la regla de role-play distraiga al modelo de las correcciones.

**Set**: `TOPIC_SAMPLES` en `scripts/eval/samples.ts`: 8 mensajes sintéticos (entrevista, entrevista técnica, stand-up, small talk, noticias de tech) con errores típicos de hispanohablantes y 2 oraciones correctas (para ver falsos positivos).

**Cómo correrlo** (una vez, con el set más chico que responde la pregunta: 8 mensajes x 2 condiciones x 2 modelos = 32 llamadas):

```bash
pnpm eval:models gemini:gemini-flash-lite-latest groq:qwen/qwen3.8-27b --topics-only        # con la regla del tema
pnpm eval:models gemini:gemini-flash-lite-latest groq:qwen/qwen3.8-27b --topics-only --topics-plain  # control: mismos mensajes, conversación normal
```

`--topics` suma el set de temas al set normal; `--topics-only` corre solo los temas. Los dos usan modo conversación con la pregunta de apertura como historia.

### Resultados

| Modelo                     | Con regla de tema | Conversación normal | Falsos positivos (tema / normal) |
| -------------------------- | ----------------- | ------------------- | -------------------------------- |
| `gemini-flash-lite-latest` | pendiente         | pendiente           | pendiente                        |
| `qwen/qwen3.8-27b` (Groq)  | pendiente         | pendiente           | pendiente                        |

**Pendiente**: la corrida no se pudo hacer en la sesión que implementó esto. Los scripts leen las API keys de las variables `GOOGLE_GENERATIVE_AI_API_KEY` y `GROQ_API_KEY` (`src/lib/env.ts`), que no estaban definidas en el worktree, y las keys del usuario no se buscaron en otro lado. Correr los dos comandos de arriba con las keys en el entorno (o en `.env.local`) y completar la tabla. Criterio de conclusión: si la diferencia de puntaje es de 5 puntos o menos y no hay más falsos positivos con la regla, las correcciones en chats de tema son tan buenas como en una conversación normal; si no, mover la regla de tema al final del prompt o a la sección de la respuesta.

## 2. Correcciones descartadas como ejemplos (#147)

Cada corrección que descartás en el chat (#95/#96) es un caso real donde el modelo se equivocó: tiene que **no** volver a reportar ese fragmento.

```bash
pnpm eval:export-discards                       # lee DATABASE_PATH, escribe .eval-results/discards.json
pnpm eval:models <provider>:<model> --with-discards
```

- La exportación agrupa por mensaje (`discardsToSamples` en `src/lib/eval/discards.ts`, con tests): `expect: []` y `forbidden` con los fragmentos descartados. Los motivos de descarte quedan en el archivo para leerlos, no se puntúan.
- `scoreSample` da un punto por cada fragmento descartado que el modelo deja en paz (cualquier error que lo solape, incluso una sugerencia, cuenta como repetido). La tabla agrega la columna `repeatedDiscards`.
- `.eval-results/` está en `.gitignore`: tu texto es privado y no va a git. Si se quieren ejemplos en el repo, tienen que ser sintéticos.
- No hay umbral en `thresholds.json`: el set depende de cada base y cambia con el tiempo. Se mira a mano, antes de cambiar de modelo o de prompt.
- `eval:classify` no lo usa: las descartadas son errores de detección, no de tipo fino.
