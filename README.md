# English Companion

Compañero personal para practicar inglés escribiendo, con IA. Escribís en inglés y te devuelve el mensaje corregido, con cada error marcado, clasificado por tema y gravedad, y explicado. Los errores se guardan para que el dashboard te muestre dónde estás fuerte, dónde flojo y cómo evolucionás.

Corre 100% local y está pensado para ser gratis: por defecto usa un modelo local con [Ollama](https://ollama.com), y opcionalmente APIs con free tier (Gemini, Groq).

## Features

- **Chat por sesiones** con historial guardado, en dos modos:
  - **Corrección**: solo corrige. Ideal para escribir prompts o mensajes y después usarlos en otro lado.
  - **Conversación**: corrige y además te responde para seguir la charla.
- **Correcciones detalladas**: diff del texto, lista de errores con categoría (taxonomía fija: tiempos verbales, preposiciones, falsos amigos…), gravedad (`typo`, leve, moderado, grave) y explicación.
- **Tolerante a typos**: los errores de tipeo se marcan, pero no cuentan en las estadísticas (se puede cambiar en Configuración).
- **"Cómo lo diría un nativo"**: una versión más natural cuando la corrección es correcta pero suena traducida.
- **Escape al español**: si no sabés cómo decir algo, escribilo entre corchetes (`I want to [aprovechar] this`) y te da opciones en inglés. Queda guardado como vocabulario.
- **Convertir en prompt**: sobre un mensaje corregido, lo reestructura como un prompt claro para una IA, listo para copiar.
- **Dashboard**: errores cada 100 palabras, evolución en el tiempo, áreas a trabajar por categoría y gravedad, tendencia contra el período anterior, errores más frecuentes y vocabulario buscado.

## Requisitos

- Node.js 22+ y pnpm
- [Ollama](https://ollama.com) con un modelo descargado, o una API key de Gemini o Groq

## Setup

```bash
pnpm install
cp .env.example .env.local   # opcional: API keys, URL de Ollama
ollama pull qwen3:14b        # o el modelo que elijas
pnpm dev
```

Abrí http://localhost:3737 y elegí proveedor y modelo en **Configuración** (el botón "Probar conexión" verifica que todo ande).

La app usa el puerto **3737** para no chocar con el 3000 de otros proyectos. Para cambiarlo, editá los scripts `dev` y `start` en `package.json`.

La base de datos es un archivo SQLite en `data/companion.db`, que se crea y migra solo al arrancar.

### Modelos recomendados

| Hardware | Modelo | Notas |
|---|---|---|
| GPU 16 GB | `qwen3:14b` | Default. Muy bueno siguiendo instrucciones y devolviendo JSON. |
| GPU 16 GB | `gpt-oss:20b` | Alternativa rápida (MoE); más justa de VRAM. |
| GPU 8–12 GB | `qwen3:8b`, `gemma3:12b` | Más livianos; pueden equivocarse más con el formato. |
| Sin GPU | Gemini / Groq | Free tier por API. |

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
    taxonomy.ts        categorías y gravedades de error (fijas)
    chat.ts            sesiones, mensajes y persistencia del análisis
    stats-core.ts      cálculo de estadísticas (puro, testeado)
drizzle/               migraciones SQL
docs/ROADMAP.md        próximas features e ideas
```

Ver [docs/ROADMAP.md](docs/ROADMAP.md) para lo que viene.
