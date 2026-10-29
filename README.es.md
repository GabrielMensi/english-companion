# English Companion

[English](README.md)

Un tutor de inglés con IA que corre en tu máquina. Escribís (o hablás) en inglés y te devuelve el mensaje corregido: cada error marcado, explicado y clasificado. La app guarda tus errores para mostrarte dónde estás fuerte, dónde flojo, y convertirlos en práctica y flashcards.

Está pensado para hispanohablantes (explicaciones en español o en inglés) y es gratis de usar: corrige con los free tiers de [Gemini](https://aistudio.google.com/apikey) y [Groq](https://console.groq.com/keys), y tus datos quedan en un archivo SQLite local.

![Un mensaje corregido: el diff, una versión más natural y cada error con su tipo y explicación](docs/screenshots/chat-correction.png)

> **Estado:** beta (`v0.2.0-beta.1`), la usa a diario su autor. Todavía no está desplegada: se corre en local. Las capturas usan datos de demo inventados.

## Features

**Escribir y recibir correcciones**

- Los **chats de corrección** corrigen tu texto; los **de conversación** además responden para seguir la charla (con modo voz opcional). **Talk about…** arranca un role-play sobre un tema, opcionalmente empujando un tiempo verbal, con feedback al final.
- Cada error tiene una categoría de una lista fija (tiempos verbales, preposiciones, falsos amigos…), una gravedad y una explicación. Un clasificador en segundo plano agrega el tipo fino (_Preposiciones › Verbo + preposición_) y, en los verbos, qué tiempo correspondía y cuál usaste. Si el tipo está mal, se corrige a mano.
- Los **typos** y las **sugerencias** (contracciones, comas opcionales) se muestran aparte y no cuentan como errores. La **versión nativa** muestra cómo sonaría más natural.
- **Escape al español:** escribí entre corchetes lo que no sabés decir (`I want to [aprovechar] this`) y te da opciones en inglés, que quedan en tu **Vocabulary**.
- **Dictado** con Whisper (Groq): transcribe lo que dijiste tal cual, con tus errores. Los mensajes hablados se miden aparte y no cuentan lo que decide el transcriptor (ortografía, puntuación).
- Descartar una corrección equivocada, reintentar un mensaje, convertirlo en un prompt claro para una IA, escucharlo con una voz que corre en el navegador ([Kokoro](https://github.com/hexgrad/kokoro)).

| Conversación                                                       | Modo oscuro                                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| ![Un chat de conversación](docs/screenshots/chat-conversation.png) | ![El chat en modo oscuro](docs/screenshots/chat-correction-dark.png) |

**Ver tu progreso**

- **Today:** qué hacer ahora (tarjetas pendientes, el tiempo verbal que hay que trabajar, tu sonido más flojo).
- **Dashboard:** errores cada 100 palabras en el tiempo, áreas a trabajar, precisión y confusiones por tiempo verbal, errores más frecuentes, escrito vs hablado, pronunciación y estadísticas de las flashcards.
- **Insights:** un reporte semanal, un plan de estudio y una estimación de tu nivel CEFR.

| Today                                       | Dashboard                                    |
| ------------------------------------------- | -------------------------------------------- |
| ![Página Today](docs/screenshots/today.png) | ![Dashboard](docs/screenshots/dashboard.png) |

**Practicar**

- **Practice** elige tus tiempos verbales y tipos de error flojos y arma ejercicios con tus propios errores (completar, elegir, corregir), más conversaciones que obligan a usar un tiempo.
- **Flashcards** con repaso espaciado: las palabras que buscaste, tus errores reales, los ejercicios que fallaste y las oraciones que te costó decir.
- **Read aloud:** leés una oración y ves qué palabras el transcriptor escuchó distinto, agrupadas por el sonido que cambió (th, b/v, vocales largas y cortas…). Un chequeo de sonidos beta corre un modelo de fonemas en el servidor.

| Practice                                   | Flashcards                                     | Read aloud                                     |
| ------------------------------------------ | ---------------------------------------------- | ---------------------------------------------- |
| ![Practice](docs/screenshots/practice.png) | ![Flashcards](docs/screenshots/flashcards.png) | ![Read aloud](docs/screenshots/read-aloud.png) |

**Clases con un profesor**

- Registrá tus clases, llevá un reporte de tus errores desde la última, pedí preguntas para hacerle y cargá las correcciones del profesor (estructuradas con IA) para que cuenten en tus estadísticas y flashcards.

| Class                                       | Vocabulary                                     |
| ------------------------------------------- | ---------------------------------------------- |
| ![Página Class](docs/screenshots/class.png) | ![Vocabulary](docs/screenshots/vocabulary.png) |

**Cuentas y datos**

- El login está siempre activo, también en local (email y contraseña). Cada cuenta tiene sus datos y sus propias API keys, guardadas cifradas.
- Exportá tus datos a un JSON e importalos en otra máquina (el archivo no lleva keys ni datos de login).

## Inicio rápido

Necesitás **Node.js 22+**, **pnpm** y al menos una API key gratis ([Gemini](https://aistudio.google.com/apikey) o [Groq](https://console.groq.com/keys); mejor las dos, así una cubre a la otra cuando se acaba una cuota).

```bash
git clone https://github.com/GabrielMensi/english-companion.git
cd english-companion
pnpm install
pnpm dev
```

1. Abrí **https://localhost:3737**. El servidor de desarrollo usa HTTPS con un certificado local (la primera vez puede pedir instalar la CA de [mkcert](https://github.com/FiloSottile/mkcert); ver [Problemas comunes](#problemas-comunes)).
2. Entrá a `/signup` y creá tu cuenta (contraseña de 10+ caracteres). La primera cuenta no necesita nada más; después el registro se cierra.
3. En **Settings**, pegá tus API keys y apretá **Test**. Ordená la **cadena de modelos**: el primero corrige cada mensaje y los siguientes toman el relevo si falla.
4. Abrí un chat y escribí algo en inglés.

La base (`data/companion.db`) se crea y migra al arrancar. La primera vez se generan dos secretos al lado: `data/encryption.key` (cifra tus API keys guardadas) y `data/auth.secret` (firma las cookies de sesión). Respaldá `data/encryption.key` junto con la base: sin ese archivo las keys guardadas no se descifran y hay que pegarlas de nuevo.

En local no hace falta ninguna variable de entorno. Opcional: copiá `.env.example` a `.env.local` para poner las keys ahí (se usan cuando no hay nada guardado en la app) o cambiar otras opciones; cada una está explicada en el archivo.

### Modelos recomendados

**Gemini Flash-Lite como principal y `qwen/qwen3.8-27b` en Groq como fallback.** Resultados de `pnpm eval:models` (septiembre 2026, 16 oraciones con errores típicos de hispanohablantes):

| Modelo                       | Puntaje | Tiempo promedio | Notas                                                                               |
| ---------------------------- | ------- | --------------- | ----------------------------------------------------------------------------------- |
| `gemini-flash-lite-latest`   | 96 %    | 2 s             | ~500 requests/día gratis. El más preciso.                                           |
| `qwen/qwen3.8-27b` (Groq)    | 93 %    | ~2 s            | ~110 correcciones/día gratis (200K tokens/día, 8K tokens/minuto).                   |
| `openai/gpt-oss-120b` (Groq) | 81 %    | ~13 s           | ~1.100 tokens de razonamiento por corrección (~60/día); a veces devuelve JSON roto. |
| Gemma 4 26B / 31B (Gemini)   | 44–63 % | 7–44 s          | Lentos y con timeouts en el free tier.                                              |

Los mismos datos se ven en Settings (`MODEL_INFO` en `src/lib/ai/provider-info.ts`). `gemini-flash-latest` es más capaz, pero gratis da solo ~20 requests/día.

> En el plan gratis de Gemini, Google puede usar los datos para mejorar sus productos. Groq no entrena con tus datos, pero tiene límites diarios.

## Más cuentas

Después de la primera cuenta el registro se cierra. Para sumar gente, listá sus emails en `.env.local` y reiniciá:

```bash
SIGNUP_ALLOWED_EMAILS=ana@example.com,bruno@example.com
```

Las cuentas nuevas empiezan vacías y ven solo lo suyo. Por defecto, una cuenta sin key propia usa las de `.env.local` (`SHARED_KEYS=true`); con `SHARED_KEYS=false` cada uno trae las suyas. Detalle en [docs/platform/AUTH_MULTIUSER.md](docs/platform/AUTH_MULTIUSER.md).

## Scripts

| Comando                                      | Qué hace                                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                   | Servidor de desarrollo en https://localhost:3737                                                          |
| `pnpm build` / `pnpm start`                  | Build y servidor de producción (http://127.0.0.1:3737)                                                    |
| `pnpm test`                                  | Tests unitarios (Vitest)                                                                                  |
| `pnpm test:e2e`                              | Tests end-to-end (Playwright) con una base descartable y una IA falsa                                     |
| `pnpm typecheck` · `pnpm lint` · `pnpm knip` | Tipos, lint y código sin usar. `pnpm format` formatea con Prettier                                        |
| `pnpm screenshots`                           | Regenera las capturas del README con datos de demo (`scripts/screenshots/`)                               |
| `pnpm db:generate`                           | Genera una migración después de cambiar `src/db/schema.ts`                                                |
| `pnpm db:migrate` · `pnpm db:backup`         | Migra haciendo antes un backup · copia consistente de la base en `data/backups/`                          |
| `pnpm auth:reset-password <email>`           | Pone una contraseña nueva (no hay recuperación por email) y cierra las sesiones de esa cuenta             |
| `pnpm auth:claim-data <email>`               | Le asigna a una cuenta los datos de antes de que existieran las cuentas (con backup, idempotente)         |
| `pnpm keys:reencrypt`                        | Vuelve a cifrar las API keys guardadas después de rotar `APP_ENCRYPTION_KEY`                              |
| `pnpm eval:models <provider>:<model> …`      | Compara modelos sobre oraciones con errores conocidos (también `eval:classify`, `eval:asr`, `eval:level`) |

## Problemas comunes

- **El navegador dice que el certificado no es de confianza.** `pnpm dev` sirve HTTPS con un certificado de mkcert (en `certificates/`); hace falta HTTPS para el micrófono y la ventana flotante. Si el navegador corre en otro sistema que el servidor (Chrome en Windows, servidor en WSL), hay que confiar una vez en la CA de mkcert ahí. En Windows: copiá `~/.local/share/mkcert/rootCA.pem` de WSL a Windows, corré `certutil -user -addstore Root <ruta>\rootCA.pem` y reiniciá Chrome. Solo se importa el certificado público.
- **Olvidé la contraseña:** `pnpm auth:reset-password <email>`.
- **Las API keys guardadas aparecen como faltantes** después de copiar la base a otra carpeta o PC: copiá también `data/encryption.key`, o pegá las keys de nuevo.
- **La app no arranca y nombra una variable:** hay un valor inválido en `.env.local`; el mensaje dice cuál. No pongas `ALLOWED_HOSTS` en local: activa el modo deploy, que exige más variables.
- **El puerto 3737 está ocupado:** cambialo en los scripts `dev` y `start` de `package.json`.
- **Varias copias en la misma máquina** (por ejemplo worktrees en otros puertos): cada una tiene su base y su propia cookie de sesión, así que entrar en una no te saca de la otra.

## Cómo funciona

Next.js (App Router) · TypeScript · Tailwind y shadcn/ui · SQLite con Drizzle ORM · Vercel AI SDK (Gemini, Groq) · Better Auth · Recharts · Kokoro y transformers.js para la voz.

- Las llamadas a la IA pasan por `src/lib/ai/providers.ts`, con fallback automático por tu cadena de modelos. La corrección llega en streaming al chat y se guarda solo cuando está completa y validada.
- La taxonomía de errores (`src/lib/taxonomy.ts`, `src/lib/subtypes.ts`) es fija para que las estadísticas agrupen igual siempre: el modelo no puede inventar categorías.
- Los tiempos verbales de tu texto se cuentan sin IA ([compromise](https://github.com/spencermountain/compromise)), y la pronunciación se mide comparando lo que leíste con lo que escuchó el transcriptor.
- La lógica pura (estadísticas, repaso espaciado, normalización) vive en archivos sin código de servidor y tiene tests unitarios.

```
src/app/         páginas y API routes
src/components/  UI (chat, dashboard, práctica, flashcards, settings…)
src/db/          schema de Drizzle, migraciones al arrancar, helpers de consultas por usuario
src/lib/         pipeline de IA, estadísticas, práctica, flashcards, voz, auth
drizzle/         migraciones SQL
e2e/             tests de Playwright
docs/            docs de diseño por área, roadmap
```

Los docs de diseño, investigaciones y decisiones están en [docs/](docs/README.md); lo hecho y lo próximo, en [docs/ROADMAP.md](docs/ROADMAP.md). El trabajo se sigue en el [tablero del proyecto](https://github.com/users/GabrielMensi/projects/1).

## Deploy

La app está lista para un VPS chico con Docker Compose y Caddy (Dockerfile, migraciones con backup, script de deploy), pero todavía no está publicada. Ver [docs/platform/DEPLOY.md](docs/platform/DEPLOY.md) y [docs/platform/RELEASES.md](docs/platform/RELEASES.md).
