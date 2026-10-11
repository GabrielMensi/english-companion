# Revisión de seguridad antes de desplegar

> Area: Platform · Kind: Chore · Status: Done · Board: #76

Revisión de seguridad de toda la app antes de _Deploy the app_, hecha en octubre de 2026 sobre la rama de #77 (que a su vez va sobre #80, sin Ollama): 22 rutas de API, Next.js 16.3, SQLite local. La app se hizo para `localhost` y un solo usuario, así que el punto de partida es que nada está protegido por defecto.

**Resumen**: no hay secretos en el repo ni en su historia, el modelo nunca se renderiza como HTML y las API keys no salen del servidor. Lo grave es que **todas las rutas están abiertas** (no hay login): eso no se arregla sin _Authentication_ y bloquea el deploy. En esta rama se arregló lo que no depende de tener usuarios: límites de tamaño de los bodies, mensajes de error que filtraban el texto crudo del proveedor, pedidos cross-site (CSRF), headers, validación de los nombres de modelo, permisos del archivo de la base y la versión de Next.js.

## Cómo se revisó

- **Dependencias**: `pnpm audit` (15 avisos al empezar, 9 después de subir Next; ver abajo) y revisión de los paquetes nativos/WASM (better-sqlite3, kokoro-js, @huggingface/transformers, onnxruntime-web). No hay Dependabot ni CodeQL configurados (no existe `.github/`).
- **Secretos**: `git log --all -p` buscando claves de Gemini (`AIza…`), Groq (`gsk_…`), OpenAI (`sk-…`) y Hugging Face (`hf_…`): ninguna. Ningún `.env*` (salvo `.env.example`, vacío), `.db`, `.wav` ni `.pem` se commiteó nunca; `.env*`, `/data/`, `/.eval-results/`, `/books/` y `/certificates/` están en `.gitignore`. No se corrió gitleaks ni Semgrep (no están instalados): queda como follow-up junto con CodeQL.
- **Revisión manual** de cada ruta de `src/app/api/` (validación, tamaño del body, path traversal, SSRF, errores), de cómo se renderiza la salida del modelo, de `next.config.ts`, de `src/lib/secrets.ts` y de `src/db/index.ts`.

## Hallazgos

Severidad pensando en la app desplegada en internet; entre paréntesis, cómo afecta hoy en `localhost`.

| #   | Severidad | Hallazgo                                                                                                                                                                                                                                                                                                                                                              | Estado                                                                  |
| --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Crítica   | Ninguna ruta pide login: cualquiera que llegue al servidor lee y borra los chats, cambia la configuración, reemplaza las API keys y gasta las cuotas gratis. (Hoy: solo la máquina del usuario, salvo el punto 2.)                                                                                                                                                    | Follow-up: _Authentication_                                             |
| 2   | Alta      | CSRF: cualquier página que el usuario abra podía hacer `POST` a `https://localhost:3737/api/...` sin preflight (un POST `text/plain`, o con un `Blob` sin tipo; las rutas parsean el body sin mirar el `Content-Type`): crear chats y prácticas, pedir planes, transcribir audio, gastar cuota.                                                                       | **Arreglado** (`src/proxy.ts`)                                          |
| 3   | Alta      | `/api/transcribe` y `PUT /api/eval/asr-samples/[id]` leían el body entero (`arrayBuffer()`) antes de mirar el tamaño: un upload de cientos de MB llenaba la memoria. Las rutas JSON (`request.json()`) tampoco tenían límite.                                                                                                                                         | **Arreglado**                                                           |
| 4   | Alta      | Next.js 16.3.6: SSRF en el optimizador de imágenes y varios avisos de cache (GHSA-f87g-xv8r-7p7x, GHSA-mcj8-r9mp-w47p y otros). La app no usa `next/image`, pero el endpoint `/_next/image` existe igual.                                                                                                                                                             | **Arreglado** (16.3.8)                                                  |
| 5   | Media     | `errorToMessage` devolvía el mensaje crudo del proveedor cuando no lo reconocía (ids de request, proyecto, rutas internas, o el texto de un `TypeError`), y `shortReason` lo guardaba en la nota de fallback.                                                                                                                                                         | **Arreglado**                                                           |
| 6   | Media     | Las API keys se guardan en texto plano en SQLite (`settings`, fila `api-keys`), y el archivo de la base quedaba `644` (legible por cualquier usuario de la máquina).                                                                                                                                                                                                  | Permisos **arreglados** (`600`); cifrado: follow-up _Per-user API keys_ |
| 7   | Media     | Sin headers de seguridad: la app se podía embeber en un iframe (clickjacking), sin `nosniff`, y con `X-Powered-By: Next.js`.                                                                                                                                                                                                                                          | **Arreglado** en parte; CSP completa: follow-up                         |
| 8   | Media     | Sin rate limiting en las rutas que llaman a la IA (send, retry, practice, insights, prompt, transcribe, settings/test, classification): un cliente puede agotar la cuota gratis del día.                                                                                                                                                                              | Follow-up (necesita saber quién llama: _Authentication_)                |
| 9   | Baja      | El nombre del modelo (Settings) era cualquier string y va en el path de la URL del proveedor (`@ai-sdk/google` usa el id tal cual si tiene `/`): con `../` se podía apuntar a otro endpoint del mismo host con la key del usuario.                                                                                                                                    | **Arreglado** (validación del id)                                       |
| 10  | Baja      | `/api/tts/runtime/[file]` buscaba el archivo en un objeto literal: `constructor` o `__proto__` pasaban el chequeo (después daba 404 al leer, sin traversal real porque el nombre no tiene `/`).                                                                                                                                                                       | **Arreglado** (`Object.hasOwn`)                                         |
| 11  | Baja      | DNS rebinding: una página puede hacer que su dominio resuelva a `127.0.0.1` y leer la API como "same-origin" (el chequeo de CSRF no lo frena). Hoy no expone las keys (salen enmascaradas), pero sí los chats.                                                                                                                                                        | Follow-up (lista de hosts permitidos)                                   |
| 12  | Baja      | `next dev` escucha en todas las interfaces (`Network: https://10.255.255.254:…`). En WSL2 con NAT no llega a la red local, pero con networking _mirrored_ sí.                                                                                                                                                                                                         | Follow-up                                                               |
| 13  | Baja      | Dependencias con avisos que no corren en el servidor en producción: `sharp` (de transformers.js y Next; no se compila, está en `ignoredBuiltDependencies`, y no se usa `next/image`), `@modelcontextprotocol/sdk` (del CLI de `shadcn`, que está en `dependencies`), `braces`, `source-map-js`, `esbuild`, `sprintf-js` (tooling de build, lint y drizzle-kit).       | Riesgo aceptado; mover `shadcn` a devDependencies: follow-up            |
| 14  | Info      | Prompt injection: el texto del usuario va a los prompts, pero la salida es un objeto con schema (zod, categorías fijas de `taxonomy.ts`), sin tools, y se renderiza como texto con React (no hay `dangerouslySetInnerHTML`, markdown ni links generados por el modelo). El impacto se limita a los datos del propio usuario (por ejemplo, ensuciar sus estadísticas). | Riesgo aceptado                                                         |
| 15  | Info      | Las migraciones corren solas al arrancar (`src/db/index.ts`). En producción conviene correrlas como paso del deploy, con backup antes.                                                                                                                                                                                                                                | Follow-up (_Deploy the app_)                                            |

Sin hallazgos:

- **XSS**: ningún `dangerouslySetInnerHTML`, `innerHTML` ni `eval` en `src/`; las correcciones y los diffs se arman con elementos de React. El único `href` externo es fijo (`KEY_URLS` en Settings).
- **SSRF**: desde que se fue Ollama (#72) no hay URLs configurables; `listModels` y los SDKs llaman a hosts fijos.
- **API keys hacia el cliente**: `GET /api/settings` y `PUT /api/settings/keys` devuelven solo `maskKey` (los últimos 2–4 caracteres); las keys viven en su propia fila, aparte de la configuración, y no se loguean.
- **Path traversal**: `asr-samples` solo acepta ids de la lista fija `ASR_SAMPLES`; el runtime de TTS, dos nombres fijos.
- **Validación**: todas las rutas con body lo validan con zod, con largos máximos en los strings.
- **Source maps**: `productionBrowserSourceMaps` está apagado (default).

## Qué se arregló

- **Límites de body** (`src/lib/request-body.ts`, con tests): `readBody(request, maxBytes)` rechaza un `Content-Length` declarado mayor al límite sin leer nada y, si el body viene en chunks, corta la lectura apenas lo pasa. `/api/transcribe` (10 MB, ~5 min de WAV) y `PUT /api/eval/asr-samples/[id]` (5 MB) responden **413**. Las rutas JSON usan `readJson(request)` con un tope de 1 MB (el body más grande legítimo, un mensaje de 20.000 caracteres con su transcripción, ronda los 100 KB): pasado el tope se trata como body inválido (400, o los defaults en las rutas donde el body es opcional).
  - Con `proxy.ts`, Next copia el body en memoria para que lo lean el proxy y la ruta, y lo corta en silencio pasado `experimental.proxyClientMaxBodySize` (10 MB por defecto). Con el default, un upload _chunked_ (sin `Content-Length`) de más de 10 MB llegaba a `/api/transcribe` cortado en exactamente 10 MB y pasaba el tope de la ruta. Se subió a 11 MB en `next.config.ts`, por encima de los topes de las rutas, así ese upload da 413. Si alguna ruta sube su tope, este valor tiene que quedar por encima.
- **Errores** (`src/lib/ai/fallback.ts`): solo se muestran tal cual los errores de la app (`new Error("…")` o `UserFacingError`, que ahora extiende `TranscriptionUnavailableError`). Los del proveedor, de librerías o de runtime se reemplazan por "The AI provider returned an error (HTTP 400). Try again or switch providers." y el texto crudo va al log del servidor (`console.warn`). La key rechazada y el modelo inexistente tienen mensajes propios; `shortReason` dice "provider error 400" en vez del texto crudo. Tests en `fallback.test.ts`.
- **CSRF** (`src/proxy.ts` + `src/lib/cross-site.ts`, con tests): en `/api/*`, un `POST`/`PUT`/`PATCH`/`DELETE` con `Sec-Fetch-Site` distinto de `same-origin` (o `none`) da **403**. Sin ese header, el `Origin` tiene que coincidir con el `Host`. Sin ninguno de los dos (curl, scripts) pasa: no es un vector de CSRF. Otro puerto del mismo host (`same-site`) también se rechaza.
- **Headers** (`next.config.ts`): `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy: camera=(), geolocation=(), microphone=(self)` y `poweredByHeader: false`. Conviven con el COOP/COEP que necesita Kokoro. **No** se agregó `script-src`/`connect-src` (ver follow-ups) ni HSTS: HSTS en `localhost` obligaría a HTTPS a todos los proyectos locales del navegador, va en el deploy.
- **Nombres de modelo** (`src/lib/settings.ts`): hasta 120 caracteres de `[A-Za-z0-9_.:/-]`, sin `..`. Un id guardado que ya no valida vuelve al default de ese proveedor (no resetea el resto de la configuración).
- **Archivo de la base** (`src/db/index.ts`): la carpeta se crea `700` y la base y sus archivos WAL quedan `600` al abrir (si el sistema de archivos lo permite).
- **Runtime de TTS**: `Object.hasOwn(FILES, file)`.
- **Next.js 16.3.8** (y `eslint-config-next`): `pnpm audit` pasó de 15 avisos (8 altos) a 9 (7 altos), ninguno en código que corra en el servidor en producción. Al mergear hay que correr `pnpm install` en la carpeta principal.

## Follow-ups

Bajo _Authentication_ (el draft que ya está en el tablero):

- Login y sesiones para todas las rutas y páginas (hallazgo 1), con chequeo en cada route handler además del proxy.
- Datos por usuario: hoy las tablas no tienen dueño; con más de un usuario hace falta una columna de usuario y filtrar cada consulta.
- Rate limiting por usuario en las rutas de IA, y un tope diario de pedidos/minutos de audio (hallazgo 8).
- Re-evaluar el CSRF una vez que haya cookies de sesión: `SameSite=Lax`/`Strict` + el chequeo actual.

Fuera de _Authentication_:

| Título                                                                                                                                                                                                                              | Priority | Size | Area     | Kind    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---- | -------- | ------- |
| Content-Security-Policy completa (script-src, connect-src, worker-src con `wasm-unsafe-eval` y los hosts de Hugging Face), probada con Kokoro en GPU y CPU                                                                          | P1       | S    | Platform | Chore   |
| CodeQL + Dependabot + gitleaks en GitHub Actions (junto con _Release workflow_). Hecho en #88; CodeQL corre solo con la variable del repo `CODEQL_ENABLED=true`, que se define cuando el repo sea público o tenga Advanced Security | P1       | S    | Platform | Chore   |
| Lista de hosts permitidos (`Host` header) contra DNS rebinding, configurable para el deploy                                                                                                                                         | P2       | XS   | Platform | Chore   |
| `pnpm dev` escuchando solo en `127.0.0.1` (verificar que el navegador de Windows siga llegando desde WSL)                                                                                                                           | P2       | XS   | Platform | Chore   |
| Mover `shadcn` (CLI) a devDependencies y revisar los avisos de `sharp` al subir transformers.js                                                                                                                                     | P2       | XS   | Platform | Chore   |
| Migraciones como paso del deploy, con backup y permisos de la base en el servidor (parte de _Deploy the app_)                                                                                                                       | P1       | S    | Platform | Chore   |
| Cifrar las API keys guardadas (parte de _Per-user API keys_)                                                                                                                                                                        | P1       | M    | Platform | Feature |

## Checklist antes de desplegar

- [ ] _Authentication_ hecho: ninguna ruta ni página responde sin sesión.
- [ ] Rate limiting en las rutas de IA y transcripción.
- [ ] CSP completa y HSTS (en el host o el reverse proxy), probadas con Kokoro.
- [ ] Lista de hosts permitidos configurada con el dominio real.
- [ ] `pnpm audit` sin avisos altos en dependencias de runtime; CodeQL y Dependabot andando.
- [ ] API keys cifradas en la base, o variables de entorno del host.
- [ ] Base fuera de la carpeta pública, con backup automático y permisos `600`; migraciones como paso del deploy.
- [ ] `next build` + `next start` (no `next dev`) detrás de HTTPS.
