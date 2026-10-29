# English Companion

Compañero personal para practicar inglés escribiendo, con IA. Escribís en inglés y te devuelve el mensaje corregido, con cada error marcado, clasificado por tema y gravedad, y explicado. Los errores se guardan para que el dashboard te muestre dónde estás fuerte, dónde flojo y cómo evolucionás.

Corre en tu máquina (la base de datos es un SQLite local) y está pensado para ser gratis: corrige con los free tiers de Gemini y Groq. Los modelos locales con Ollama se quitaron en octubre de 2026 ([docs/ai/LOCAL_MODELS.md](docs/ai/LOCAL_MODELS.md)).

## Features

- **Chat por sesiones** con historial guardado, en dos modos:
  - **Corrección**: solo corrige. Ideal para escribir prompts o mensajes y después usarlos en otro lado.
  - **Conversación**: corrige y además te responde para seguir la charla.
- **Correcciones detalladas**: diff del texto, lista de errores con categoría (taxonomía fija: tiempos verbales, preposiciones, falsos amigos…), gravedad (`typo`, leve, moderado, grave) y explicación.
- **Tipos de error detallados**: además de la categoría, cada error recibe un tipo fijo (p. ej. _Preposiciones › Verbo + preposición_) y, en los errores verbales, qué tiempo correspondía y cuál usaste. Se clasifica después, en lotes, al abrir el dashboard o cuando la app está inactiva, así el chat no se hace más lento. Si un tipo está mal, "Wrong type?" lo corrige a mano.
- **Tiempos verbales**: el dashboard muestra, para cada tiempo, cuántas veces lo necesitaste y con qué precisión lo usaste, si fallás al elegirlo o al formarlo, qué tiempo usás en su lugar y cuáles casi no usás. Los usos se cuentan en el texto corregido sin IA (con [compromise](https://github.com/spencermountain/compromise)).
- **Práctica de tiempos verbales** (página **Practice**): elige los tiempos flojos o poco usados a partir de ese diagnóstico y propone ejercicios de contraste (p. ej. past simple vs present perfect con _yesterday / since / ever_), drills de forma o tareas para usar un tiempo que evitás, y conversaciones cuyas preguntas obligan a usarlo. Los ejercicios se muestran completos y se responden en un solo mensaje (una línea por ítem): se corrige una vez, suma a las estadísticas como cualquier mensaje y la respuesta es un resumen con ✓/✗ por ítem y el puntaje.
- **Ejercicios dirigidos** (también en **Practice**): para las 3 categorías con más errores cada 100 palabras (y su tipo más frecuente), ejercicios cortos de completar el hueco, elegir la opción correcta y corregir el error, armados con tus propios errores de esa categoría como material. Cada respuesta se corrige, suma a las estadísticas y recibe ✓/✗ con la respuesta y la regla.
- **Dictado**: con el botón de micrófono hablás en inglés y Whisper (Groq, gratis) lo transcribe tal cual, con tus errores. El mensaje se corrige como cualquier otro, pero no se marcan la ortografía ni la puntuación (las decide el transcriptor) y en el dashboard podés ver tus errores escritos y hablados por separado. Requiere una API key de Groq.
- **Tolerante a typos**: los errores de tipeo se marcan, pero no cuentan en las estadísticas (se puede cambiar en Configuración).
- **Sugerencias, no errores**: contracciones ("is not" / "isn't"), puntuación opcional o comma splices en texto informal se muestran aparte como sugerencias y nunca cuentan en las estadísticas.
- **"Cómo lo diría un nativo"**: una versión más natural cuando la corrección es correcta pero suena traducida.
- **Escape al español**: si no sabés cómo decir algo, escribilo entre corchetes (`I want to [aprovechar] this`) y te da opciones en inglés. Queda guardado en la página **Vocabulary** (agrupado por palabra, con las veces que la buscaste y las oraciones donde la usaste) y en un panel del dashboard.
- **Flashcards con repaso espaciado** (página **Flashcards**): tres mazos, las palabras que buscaste entre corchetes (español → inglés, con la oración donde la usaste como pista), tus errores reales (el original como pregunta, la corrección como respuesta) y los ítems de ejercicios que fallaste en Practice (el ejercicio como pregunta, la respuesta y el porqué al darla vuelta). Escribís la respuesta (opcional), la ves y la calificás con Again / Hard / Good / Easy; un algoritmo tipo SM-2 decide cuándo vuelve cada tarjeta. Los errores se pueden repasar por tiempo verbal o por tipo (el tipo de error es una pista opcional, para no regalar la respuesta). Cada tarjeta se puede suspender (se recupera desde la página Flashcards) o borrar; la cantidad de tarjetas nuevas por sesión se elige en Settings. El dashboard muestra tarjetas pendientes, retención, repasos por día y racha (con historial desde que existe la tabla `review_log`).
- **Convertir en prompt**: sobre un mensaje corregido, lo reestructura como un prompt claro para una IA, listo para copiar.
- **Selector de modelo** en el chat y nota en cada respuesta con el modelo que la generó y cuánto tardó.
- **Fallback automático**: si el modelo elegido falla (offline, cuota, sobrecarga), prueba con los otros modelos configurados, en orden, y deja registrado cuál falló.
- **Dashboard**: errores cada 100 palabras, evolución en el tiempo, áreas a trabajar por categoría y gravedad, tendencia contra el período anterior, errores más frecuentes y vocabulario buscado.

## Requisitos

- Node.js 22+ y pnpm
- Una API key gratis de [Gemini](https://aistudio.google.com/apikey) o [Groq](https://console.groq.com/keys) (mejor las dos, así una cubre a la otra). Sin ninguna, la app abre pero no puede corregir.

## Setup

```bash
pnpm install
pnpm dev
```

Abrí https://localhost:3737: la app **pide login siempre**, también en local. La primera vez, entrá a `/signup` y creá tu cuenta (email y contraseña de al menos 10 caracteres): la primera cuenta se crea sin más y después el registro se cierra. Otras cuentas solo se pueden crear con `SIGNUP_ALLOWED_EMAILS`; cada cuenta tiene sus propios datos y sus propias API keys. Sin email de verificación, quien se registre primero con un email permitido se queda con él. Después armá la **cadena de modelos** en **Configuración**: el primero corrige cada mensaje y, si falla, prueba el siguiente. Cada proveedor tiene su tarjeta con la API key, el modelo y un botón "Test", y se puede configurar sin cambiar el orden. Las keys son **por cuenta**, se guardan **cifradas** en tu base local (AES-256-GCM; la clave de cifrado se genera sola en `data/encryption.key`, junto a la base, con permisos `600`: respaldala aparte, y si copiás la base a otra carpeta o PC copiá también ese archivo, o las keys no descifran y hay que pegarlas de nuevo) y nunca se muestran completas. Sin una key propia, una cuenta usa la del `.env.local` (`SHARED_KEYS=true`, el valor por defecto); con `SHARED_KEYS=false` cada cuenta trae las suyas. Si rotás la clave: `pnpm keys:reencrypt` (ver [docs/platform/AUTH_MULTIUSER.md](docs/platform/AUTH_MULTIUSER.md)). **Configuración > Your data** exporta tus datos a un archivo JSON (sin keys ni datos de login) o importa uno en tu cuenta, para mover el historial entre PCs; el resto de los cambios se guarda solo.

Si preferís configurarlo por entorno, copiá `.env.example` a `.env.local`: esas variables se usan cuando no hay nada guardado en la app.

La app usa el puerto **3737** para no chocar con el 3000 de otros proyectos. Para cambiarlo, editá los scripts `dev` y `start` en `package.json`.

`pnpm dev` sirve la app por **HTTPS** (`next dev --experimental-https`, certificado local de [mkcert](https://github.com/FiloSottile/mkcert) en `certificates/`): Chrome solo abre la ventana flotante sola al cambiar de pestaña mientras dictás si la página es `https://`, y `localhost` no es excepción. Como el navegador corre en Windows y el certificado se genera en WSL, hay que confiar una vez en la CA de mkcert desde Windows:

```powershell
# en WSL: cp ~/.local/share/mkcert/rootCA.pem /mnt/c/Users/<usuario>/Downloads/mkcert-rootCA.pem
certutil -user -addstore Root $env:USERPROFILE\Downloads\mkcert-rootCA.pem
```

Después reiniciá Chrome. Solo se importa el certificado público; la clave queda en WSL.

La base de datos es un archivo SQLite en `data/companion.db`, que se crea y migra solo al arrancar. La clave que firma las cookies de sesión se genera sola la primera vez en `data/auth.secret` (permisos `600`, junto a la base); en un deploy hay que definir `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` (ver [docs/platform/AUTH_MULTIUSER.md](docs/platform/AUTH_MULTIUSER.md)).

**Olvidé la contraseña**: no hay email para recuperarla. En la carpeta de la app corré `pnpm auth:reset-password <email>`: pide la nueva contraseña, la cambia y borra las sesiones de esa cuenta (una copia de la cookie puede seguir valiendo hasta 5 minutos).

**Mis datos de antes no aparecen (primera vez con cuentas)**: lo que guardaste antes de que existieran las cuentas (chats, errores, tarjetas, ajustes) no tiene dueño todavía y la app no se lo muestra a nadie. Creá tu cuenta en `/signup` y, en la carpeta de la app, corré `pnpm auth:claim-data <tu email>`: hace un respaldo en `data/backups/pre-claim-<fecha>.db`, le asigna todo a esa cuenta en una sola transacción e imprime cuántas filas movió. Se corre una vez (volver a correrlo no hace nada) y funciona sobre una copia con `DATABASE_PATH=data/dev.db`. Mientras tanto, la primera cuenta ve un aviso arriba. Las cuentas siguientes empiezan vacías: cada una ve solo lo suyo.

**Varias copias de la app en la misma máquina**: las cookies se comparten entre puertos de un mismo host, así que el nombre de la cookie de sesión lleva un prefijo que sale de la ruta de la base (`ec-<hash>.session_token`). Cada carpeta (la app en uso y los worktrees) tiene su propia base, su propio `data/auth.secret` y su propia sesión: iniciar sesión en un worktree no cierra la de la app en el puerto 3737. Si `data/auth.secret` queda vacío o corto, la app no arranca y avisa; borrá el archivo para generar uno nuevo.

### Modelos recomendados

Configuración recomendada: **Gemini Flash-Lite como principal y `qwen/qwen3.8-27b` en Groq como fallback**. Estos datos (puntaje, velocidad y límite gratis) se muestran en Configuración desde `MODEL_INFO` en `src/lib/ai/provider-info.ts`; actualizalos juntos. Resultados de `pnpm eval:models` (septiembre 2026, 16 oraciones con errores típicos de hispanohablantes; los modelos locales de esa corrida están en [LOCAL_MODELS.md](docs/ai/LOCAL_MODELS.md)):

| Modelo                           | Puntaje | Tiempo promedio | Notas                                                                                          |
| -------------------------------- | ------- | --------------- | ---------------------------------------------------------------------------------------------- |
| `gemini-flash-lite-latest` (API) | 96 %    | 2 s             | ~500 requests/día gratis. El más preciso.                                                      |
| `qwen/qwen3.8-27b` (Groq)        | 93 %    | ~2 s            | ~110 correcciones/día gratis (200K tokens/día, 8K tokens/minuto). Sin tokens de razonamiento.  |
| `openai/gpt-oss-120b` (Groq)     | 81 %    | ~13 s           | Gasta ~1.100 tokens de razonamiento por corrección (~60/día) y a veces devuelve JSON inválido. |
| Gemma 4 26B / 31B (API)          | 44–63 % | 7–44 s          | Lentos y con timeouts en el free tier.                                                         |

`gemini-flash-latest` es más capaz, pero en el free tier tiene solo ~20 requests/día.

> En el plan gratis de Gemini, Google puede usar los datos para mejorar sus productos. Groq no entrena con tus datos, pero tiene límites diarios.

## Scripts

| Comando                                   | Qué hace                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                | Levanta la app en modo desarrollo                                                                                                                                                                                                                                                 |
| `pnpm test`                               | Tests unitarios (vitest)                                                                                                                                                                                                                                                          |
| `pnpm typecheck`                          | Genera tipos de rutas y corre `tsc`                                                                                                                                                                                                                                               |
| `pnpm lint`                               | ESLint                                                                                                                                                                                                                                                                            |
| `pnpm eval:models <provider>:<model> …`   | Compara modelos sobre un set de oraciones con errores conocidos (ej. `gemini:gemini-flash-lite-latest groq:qwen/qwen3.8-27b`). Con `--check` (también en `eval:classify` y `eval:asr`) marca PASS/FAIL contra `scripts/eval/thresholds.json`                                      |
| `pnpm keys:reencrypt`                     | Vuelve a cifrar las API keys guardadas con la `APP_ENCRYPTION_KEY` actual (después de rotarla; hace backup antes)                                                                                                                                                                 |
| `pnpm eval:export-discards`               | Exporta tus correcciones descartadas a `.eval-results/discards.json` (local, no va a git). `eval:models … --with-discards` mide si el modelo las repite; `--topics` / `--topics-only` / `--topics-plain` miden chats de tema (ver [docs/ai/TOPIC_EVAL.md](docs/ai/TOPIC_EVAL.md)) |
| `pnpm eval:classify <provider>:<model> …` | Compara modelos clasificando errores ya detectados (tipo fino y tiempos verbales). `--with-user-labels` suma los tipos corregidos a mano en la app                                                                                                                                |
| `pnpm eval:asr [engine:model …]`          | Transcribe las grabaciones de `/eval/asr` con cada motor de speech-to-text y mide si conservan tus errores o los "corrigen" (ver [docs/voice/VOICE.md](docs/voice/VOICE.md))                                                                                                      |
| `pnpm eval:level`                         | Compara el nivel CEFR estimado con textos de alumnos calificados por Cambridge (Write & Improve, se descarga aparte; ver [docs/progress/LEVEL_CALIBRATION.md](docs/progress/LEVEL_CALIBRATION.md))                                                                                |
| `pnpm auth:claim-data <email>`            | Le asigna a una cuenta los datos de antes de las cuentas (con respaldo, una transacción, idempotente)                                                                                                                                                                             |
| `pnpm auth:reset-password <email>`        | Cambia la contraseña de una cuenta (sin email de recuperación) y cierra sus sesiones                                                                                                                                                                                              |
| `pnpm db:generate`                        | Genera una migración después de cambiar `src/db/schema.ts`                                                                                                                                                                                                                        |
| `pnpm db:migrate`                         | Aplica las migraciones pendientes haciendo antes un backup (`data/backups/`); es el paso de migración del deploy ([docs/platform/DEPLOY.md](docs/platform/DEPLOY.md)). Con `pnpm dev` no hace falta: migra al arrancar                                                            |
| `pnpm db:backup`                          | Copia consistente de la base en `data/backups/` (`--prefix`, `--keep`)                                                                                                                                                                                                            |

## Stack

Next.js (App Router) · TypeScript · Tailwind + shadcn/ui · SQLite + Drizzle ORM · Vercel AI SDK (Gemini, Groq) · Recharts

## Estructura

```
src/
  app/                 páginas (chat, dashboard, settings) y API routes
  components/          UI: chat, dashboard, sidebar, settings
  db/                  schema de Drizzle y conexión (migra al arrancar)
  lib/
    ai/                providers, prompt de análisis, "convertir en prompt"
    taxonomy.ts        categorías, tiempos verbales y gravedades (fijos)
    subtypes.ts        tipos finos de error por categoría (fijos)
    classification.ts  clasificación diferida de errores (lotes, prioridad del chat)
    chat.ts            sesiones, mensajes y persistencia del análisis
    stats-core.ts      cálculo de estadísticas (puro, testeado)
    tenses-core.ts     conteo de tiempos verbales en un texto (puro, testeado)
    tense-stats.ts     precisión por tiempo verbal (puro, testeado)
    srs.ts             repaso espaciado tipo SM-2 (puro, testeado)
    flashcards-core.ts tarjetas de vocabulario y de errores, cola de repaso (puro, testeado)
    flashcards-upkeep*.ts suspender / borrar tarjetas y limpiar reviews huérfanas
    review-stats*.ts   retención, repasos por día, racha y pendientes de las flashcards (core puro, testeado)
    tense-practice.ts  qué tiempos practicar, preguntas y feedback de ejercicios (puro, testeado)
    category-practice.ts qué categorías practicar, chequeo y feedback de sus ejercicios (puro, testeado)
    exercise-set.ts    sets respondidos en un mensaje: parseo de respuestas, nota por ítem y resumen (puro, testeado)
    missed-exercises.ts ítems fallados en los ejercicios, para el mazo "Missed exercises"
    practice*.ts       chats de práctica: estado, ejercicios generados y conversación dirigida
drizzle/               migraciones SQL
docs/                  una carpeta por área (ver docs/README.md) y ROADMAP.md
```

Los libros del curso (PDFs) van en `books/`, que está ignorado en git. Ver [docs/ROADMAP.md](docs/ROADMAP.md) para lo que viene, incluida la integración con las clases.
