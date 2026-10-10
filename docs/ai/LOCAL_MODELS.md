# Modelos locales (Ollama): archivado

> Area: AI pipeline · Kind: Chore · Status: Done · Board: #72

Hasta octubre de 2026 la app podía corregir con un modelo local servido por [Ollama](https://ollama.com), y era el proveedor por defecto. Se quitó en #72: los free tiers de Gemini y Groq alcanzan para el uso diario, sus modelos corrigen mejor y más rápido, y sin modelos locales la app se puede desplegar y compartir. Kokoro (la voz local) se queda: corre en el navegador.

Este doc guarda lo que se aprendió, para no perderlo si algún día vuelve.

## Cómo recuperarlo

El último commit con Ollama está en el tag **`archive/local-models-ollama`** (`f9586f3`, en `develop`):

```bash
git show archive/local-models-ollama:src/lib/ai/providers.ts   # leer un archivo
git worktree add ../ec-ollama archive/local-models-ollama         # o levantar esa versión aparte
```

Para revivirlo sobre el código actual, mirá el commit que lo quitó (`git log --grep "Remove Ollama"`) y revertí lo que haga falta. Lo que tocaba:

- `src/lib/ai/provider-info.ts`: el proveedor `ollama` (con un flag `local`) y los modelos locales en `MODEL_INFO`.
- `src/lib/ai/providers.ts`: `createOllama` de `ollama-ai-provider-v2`, `ollamaBaseUrl`, el caso `ollama` en `resolveModel`, `listModels` (`GET /api/tags`) y `providerStatus`.
- `src/lib/settings.ts`: `models.ollama` y `ollamaBaseUrl` (settings v2; la v3 los descarta).
- Configuración: el campo "Ollama URL", el badge "Local" y "no limit" en los datos del modelo.

## Qué hacía falta para que anduviera

- **Contexto**: el contexto por defecto de Ollama es chico y las instrucciones + historial + JSON de salida no entraban. Se pedía `num_ctx: 8192` en `providerOptions.ollama.options`.
- **Temperatura**: la API nativa de Ollama ignora la `temperature` de primer nivel; va dentro de `options`.
- **Sin razonamiento**: `think: false`. Pensar era mucho más lento y no mejoraba las correcciones.
- **Timeouts**: 180 s para locales (el primer request carga el modelo en la GPU) contra 60 s para APIs, y `maxRetries: 0` (un servidor local está o no está: reintentar solo demora el error).
- **Orden en la cadena**: el local iba al final porque es más lento y ocupa la GPU. Las settings v1 ordenaban los fallbacks poniendo los locales últimos.
- **Una llamada a la vez**: `withChatPriority` nació para que la clasificación diferida no compitiera por la GPU con el chat. Se quedó, ahora para no gastar el límite por minuto de los free tiers.
- **Schemas planos y un reintento** ante JSON inválido: los modelos chicos fallaban más con schemas anidados. También se quedaron (los remotos también fallan a veces).

### Ollama en Windows + app en WSL

Ollama corría en Windows (donde está la GPU, una RX 9070 XT de 16 GB, con Vulkan) y la app en WSL. Con `networkingMode=mirrored` en `%UserProfile%\.wslconfig`, `localhost:11434` funcionaba desde WSL. Sin mirrored: la IP del host en `OLLAMA_BASE_URL` y Ollama con `OLLAMA_HOST=0.0.0.0`.

## Resultados

`pnpm eval:models`, septiembre 2026, 16 oraciones con errores típicos de hispanohablantes, GPU de 16 GB:

| Modelo | Puntaje | Tiempo promedio | Notas |
|---|---|---|---|
| `gemma4:12b` (7,6 GB) | 93 % | 9 s | El mejor local; detecta falsos amigos ("actually") y errores de significado. |
| `qwen3:14b` | 91 % | 7 s | Bueno, pero se le escapan errores de significado. |
| `qwen2.5:14b-instruct` | 89 % | 8 s | |
| `gpt-oss:20b` | 84 % | 34 s | Razona siempre: demasiado lento para chatear. |

Como referencia, en la misma corrida `gemini-flash-lite-latest` sacó 96 % en 2 s y `qwen/qwen3.8-27b` en Groq 93 % en ~2 s. Los resultados completos siguen en `.eval-results/`.

## Descartado junto con esto

- Probar streaming, insights y práctica de tiempos con Ollama.
- whisper.cpp local como fallback del dictado.
- Kev como backend del clasificador (#11, ver [ERROR_CLASSIFICATION.md](ERROR_CLASSIFICATION.md)).
