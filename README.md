# English Companion

Compañero personal para practicar inglés escribiendo, con IA. Escribís en inglés y te devuelve el mensaje corregido, con cada error marcado, clasificado por tema y gravedad, y explicado. Los errores se guardan para que el dashboard te muestre dónde estás fuerte, dónde flojo y cómo evolucionás.

Corre 100% local y está pensado para ser gratis: por defecto usa un modelo local con [Ollama](https://ollama.com), y opcionalmente APIs con free tier (Gemini, Groq).

## Features

- **Chat por sesiones** con historial guardado, en dos modos:
  - **Corrección**: solo corrige. Ideal para escribir prompts o mensajes y después usarlos en otro lado.
  - **Conversación**: corrige y además te responde para seguir la charla.
- **Correcciones detalladas**: diff del texto, lista de errores con categoría (taxonomía fija: tiempos verbales, preposiciones, falsos amigos…), gravedad (`typo`, leve, moderado, grave) y explicación.
- **Tipos de error detallados**: además de la categoría, cada error recibe un tipo fijo (p. ej. *Preposiciones › Verbo + preposición*) y, en los errores verbales, qué tiempo correspondía y cuál usaste. Se clasifica después, en lotes, al abrir el dashboard o cuando la app está inactiva, así el chat no se hace más lento. Si un tipo está mal, "Wrong type?" lo corrige a mano.
- **Tiempos verbales**: el dashboard muestra, para cada tiempo, cuántas veces lo necesitaste y con qué precisión lo usaste, si fallás al elegirlo o al formarlo, qué tiempo usás en su lugar y cuáles casi no usás. Los usos se cuentan en el texto corregido sin IA (con [compromise](https://github.com/spencermountain/compromise)).
- **Tolerante a typos**: los errores de tipeo se marcan, pero no cuentan en las estadísticas (se puede cambiar en Configuración).
- **Sugerencias, no errores**: contracciones ("is not" / "isn't"), puntuación opcional o comma splices en texto informal se muestran aparte como sugerencias y nunca cuentan en las estadísticas.
- **"Cómo lo diría un nativo"**: una versión más natural cuando la corrección es correcta pero suena traducida.
- **Escape al español**: si no sabés cómo decir algo, escribilo entre corchetes (`I want to [aprovechar] this`) y te da opciones en inglés. Queda guardado en la página **Vocabulary** (agrupado por palabra, con las veces que la buscaste y las oraciones donde la usaste) y en un panel del dashboard.
- **Convertir en prompt**: sobre un mensaje corregido, lo reestructura como un prompt claro para una IA, listo para copiar.
- **Selector de modelo** en el chat y nota en cada respuesta con el modelo que la generó y cuánto tardó.
- **Fallback automático**: si el modelo elegido falla (offline, cuota, sobrecarga), prueba con los otros modelos configurados, en orden, y deja registrado cuál falló.
- **Dashboard**: errores cada 100 palabras, evolución en el tiempo, áreas a trabajar por categoría y gravedad, tendencia contra el período anterior, errores más frecuentes y vocabulario buscado.

## Requisitos

- Node.js 22+ y pnpm
- [Ollama](https://ollama.com) con un modelo descargado, o una API key de Gemini o Groq

## Setup

```bash
pnpm install
ollama pull gemma4:12b       # modelo local recomendado (requiere Ollama reciente)
pnpm dev
```

Abrí http://localhost:3737 y elegí proveedor y modelo en **Configuración** (el botón "Probar conexión" verifica que todo ande). Ahí mismo se cargan las API keys de Gemini o Groq y la URL de Ollama: las keys se guardan solo en tu base local y nunca se muestran completas.

Si preferís configurarlo por entorno, copiá `.env.example` a `.env.local`: esas variables se usan cuando no hay nada guardado en la app.

La app usa el puerto **3737** para no chocar con el 3000 de otros proyectos. Para cambiarlo, editá los scripts `dev` y `start` en `package.json`.

La base de datos es un archivo SQLite en `data/companion.db`, que se crea y migra solo al arrancar.

### Modelos recomendados

Configuración recomendada: **Gemini Flash-Lite como principal y `gemma4:12b` como fallback local**. Resultados de `pnpm eval:models` (septiembre 2026, 16 oraciones con errores típicos de hispanohablantes, GPU de 16 GB):

| Modelo | Puntaje | Tiempo promedio | Notas |
|---|---|---|---|
| `gemini-flash-lite-latest` (API) | 96 % | 2 s | ~500 requests/día gratis. El más preciso. |
| `gemma4:12b` (local, 7,6 GB) | 93 % | 9 s | El mejor local; detecta falsos amigos ("actually") y errores de significado. |
| `qwen3:14b` (local) | 91 % | 7 s | Bueno, pero se le escapan errores de significado. |
| `qwen2.5:14b-instruct` (local) | 89 % | 8 s | |
| `gpt-oss:20b` (local) | 84 % | 34 s | Razona siempre: demasiado lento para chatear. |
| Gemma 4 26B / 31B (API) | 44–63 % | 7–44 s | Lentos y con timeouts en el free tier. |

`gemini-flash-latest` es más capaz, pero en el free tier tiene solo ~20 requests/día.

> En el plan gratis de Gemini, Google puede usar los datos para mejorar sus productos. Groq no entrena con tus datos, pero tiene límites diarios.

### Ollama en Windows + app en WSL

Ollama corre en Windows (donde está la GPU) y la app en WSL. Con `networkingMode=mirrored` en `%UserProfile%\.wslconfig`, `localhost:11434` funciona desde WSL. Si no usás mirrored, poné la IP del host en `OLLAMA_BASE_URL` y configurá Ollama con `OLLAMA_HOST=0.0.0.0`.

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Levanta la app en modo desarrollo |
| `pnpm test` | Tests unitarios (vitest) |
| `pnpm typecheck` | Genera tipos de rutas y corre `tsc` |
| `pnpm lint` | ESLint |
| `pnpm eval:models <provider>:<model> …` | Compara modelos sobre un set de oraciones con errores conocidos (ej. `ollama:qwen3:14b gemini:gemini-flash-lite-latest`) |
| `pnpm eval:classify <provider>:<model> …` | Compara modelos clasificando errores ya detectados (tipo fino y tiempos verbales). `--with-user-labels` suma los tipos corregidos a mano en la app |
| `pnpm db:generate` | Genera una migración después de cambiar `src/db/schema.ts` |

## Stack

Next.js (App Router) · TypeScript · Tailwind + shadcn/ui · SQLite + Drizzle ORM · Vercel AI SDK (Ollama, Gemini, Groq) · Recharts

## Estructura

```
src/
  app/                 páginas (chat, dashboard, settings) y API routes
  components/          UI: chat, dashboard, sidebar, settings
  db/                  schema de Drizzle y conexión (migra al arrancar)
  lib/
    ai/                providers, prompt de análisis, "convertir en prompt"
    taxonomy.ts        categorías, tipos, tiempos verbales y gravedades (fijos)
    classification.ts  clasificación diferida de errores (lotes, prioridad del chat)
    chat.ts            sesiones, mensajes y persistencia del análisis
    stats-core.ts      cálculo de estadísticas (puro, testeado)
    tenses-core.ts     conteo de tiempos verbales en un texto (puro, testeado)
    tense-stats.ts     precisión por tiempo verbal (puro, testeado)
drizzle/               migraciones SQL
docs/ROADMAP.md        próximas features e ideas
```

Los libros del curso (PDFs) van en `books/`, que está ignorado en git. Ver [docs/ROADMAP.md](docs/ROADMAP.md) para lo que viene, incluida la integración con las clases.
