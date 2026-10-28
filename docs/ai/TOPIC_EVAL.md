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

Corrida del 28/10/2026, una vez, 8 mensajes por condición (24 puntos posibles), con las keys y la configuración de la base del usuario:

| Modelo                     | Con regla de tema | Conversación normal | Falsos positivos (tema / normal) | Segundos promedio (tema / normal) |
| -------------------------- | ----------------- | ------------------- | -------------------------------- | --------------------------------- |
| `gemini-flash-lite-latest` | 79 % (19/24)      | 79 % (19/24)        | 0 / 0                            | 2,1 / 1,8                         |
| `qwen/qwen3.8-27b` (Groq)  | 79 % (19/24)      | 75 % (18/24)        | 0 / 0                            | 2,8 / 4,0                         |

### Conclusión

Las correcciones en chats de tema y role-play son **tan buenas como en una conversación normal**: la diferencia es de 0 puntos en Gemini y de +1 punto (a favor del tema) en Groq, sin falsos positivos en ninguna condición y sin fallas. La regla de role-play no distrae al modelo de las correcciones, así que no hace falta cambiar el prompt.

Lo que se pierde es igual en las dos condiciones y viene del set, no del tema: algunas expectativas de estas muestras son estilísticas, no errores (`much more than` por `far outnumber`; `any good restaurant` por `restaurants`; `for holidays` por `on holiday`, que en inglés americano se dice así). Los dos modelos las pasan por alto con y sin regla, así que ese 79 % no es comparable con el 96 % del set principal (oraciones más claras). Con 8 mensajes y 24 puntos, una diferencia de 1 punto es ruido. Si se quiere un número comparable, hay que reemplazar esas tres expectativas por errores claros.

## 2. Correcciones descartadas como ejemplos (#147)

Cada corrección que descartás en el chat (#95/#96) es un caso real donde el modelo se equivocó: tiene que **no** volver a reportar ese fragmento.

```bash
pnpm eval:export-discards                       # lee DATABASE_PATH, escribe .eval-results/discards.json
pnpm eval:models <provider>:<model> --with-discards
```

- La exportación agrupa por mensaje (`discardsToSamples` en `src/lib/eval/discards.ts`, con tests): `expect: []` y `forbidden` con los fragmentos descartados. Los motivos de descarte quedan en el archivo para leerlos, no se puntúan.
- `scoreSample` da un punto por cada fragmento descartado que el modelo deja en paz (cualquier error que lo solape, incluso una sugerencia, cuenta como repetido). La tabla agrega la columna `repeatedDiscards`.
- Con la base `data/dev.db` (copia de la real, 28/10/2026) la exportación encontró 9 correcciones descartadas en 6 mensajes (las que ya no aparecen en el texto del mensaje se descartan). No se corrió `--with-discards`: queda para cuando se cambie de modelo o de prompt.
- Los scripts de eval cargan `DATABASE_PATH` de `.env.local` (`scripts/eval/load-env.ts`) y se niegan a crear una base que no existe; antes usaban `data/companion.db` por defecto y dejaban una vacía, sin keys ni chats.
- `.eval-results/` está en `.gitignore`: tu texto es privado y no va a git. Si se quieren ejemplos en el repo, tienen que ser sintéticos.
- No hay umbral en `thresholds.json`: el set depende de cada base y cambia con el tiempo. Se mira a mano, antes de cambiar de modelo o de prompt.
- `eval:classify` no lo usa: las descartadas son errores de detección, no de tipo fino.
