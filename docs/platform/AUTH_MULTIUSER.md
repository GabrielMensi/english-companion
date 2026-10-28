# Login, multiusuario y API keys por usuario

> Area: Platform · Kind: Research · Status: Decided · Board: #124, #125, #126

Diseño para implementar sin volver a investigar. Cubre _Authentication_ (#124), _Multi-user support_ (#125) y _Per-user API keys_ (#126), más el cifrado de las keys guardadas. Parte de [SECURITY_REVIEW.md](SECURITY_REVIEW.md) (hallazgos 1, 6 y 8) y de [TESTING.md](TESTING.md) (capa de integración). El deploy está en [DEPLOY.md](DEPLOY.md).

## Decisiones (ya tomadas por el usuario)

- **Multiusuario completo**, con email + contraseña (Better Auth), guardado en el mismo SQLite (adaptador de Drizzle).
- **El login es siempre obligatorio**, también en local.
- Los datos del único usuario actual pasan a la **primera cuenta**.
- **Keys por usuario**, cifradas en reposo con una clave del servidor que viene del entorno.

Decisiones de este doc (a confirmar en la PR si algo cambia): registro **cerrado con allowlist** (ver Política de registro), migración de datos con **un comando explícito** (ver Migración de los datos actuales), AES-256-GCM para las keys, sin verificación de email ni reseteo por email.

## 1. Autenticación (PR a)

### Librería y versiones

- **Better Auth 1.7.x** (última estable al escribir: `1.7.14`). Su `peerDependencies` acepta `next ^14 || ^15 || ^16`, `react ^18 || ^19` y `drizzle-orm ^0.45.2` (el repo usa `next 16.4.0`, `react 19.3.0`, `drizzle-orm ^0.45.4`). Sin dependencias nuevas aparte de `better-auth`. Fijar la versión exacta (como `@huggingface/transformers`) y dejar que Dependabot la suba.
- Hash de contraseñas: el de Better Auth (scrypt, en Node). No hace falta argon2.
- Auth.js se descartó: Better Auth trae email+password, rate limit y sesiones en base sin armar el esquema a mano, y el adaptador de Drizzle es oficial.

### Piezas

| Archivo (nuevo)                                     | Qué hace                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/auth/auth.ts` (`server-only`)              | `betterAuth({...})` con `drizzleAdapter(db, { provider: "sqlite", schema })`, `emailAndPassword`, el plugin `nextCookies()` (último de la lista) y el hook de registro.                                                                                                                                                                    |
| `src/lib/auth/auth-core.ts` (sin `server-only`)     | Lógica pura con tests: `canSignUp(email, { allowlist, userCount })`, normalización del email, política de contraseña.                                                                                                                                                                                                                      |
| `src/lib/auth/session.ts` (`server-only`)           | `getUser()` (lee la sesión de verdad: `auth.api.getSession({ headers: await headers() })`) y `requireUser()` (lanza `UnauthorizedError` si no hay sesión).                                                                                                                                                                                 |
| `src/app/api/auth/[...all]/route.ts`                | `export const { GET, POST } = toNextJsHandler(auth)`.                                                                                                                                                                                                                                                                                      |
| `src/app/login/page.tsx`, `src/app/signup/page.tsx` | Formularios (client components) con `authClient.signIn.email` / `signUp.email`. Texto de UI en inglés.                                                                                                                                                                                                                                     |
| `src/lib/auth/client.ts`                            | `createAuthClient()` (solo `signIn`, `signUp`, `signOut`).                                                                                                                                                                                                                                                                                 |
| `src/db/schema.ts`                                  | Tablas de Better Auth: `user`, `session`, `account`, `verification` y `rateLimit` (`key`, `count`, `lastRequest`; la pide `rateLimit.storage: "database"`, sin ella el rate limit falla en runtime) (se generan con `npx @better-auth/cli generate`, se pegan a mano en `schema.ts` con el estilo del repo y se corre `pnpm db:generate`). |

Las tablas de Better Auth usan ids `text`, fechas `integer timestamp` y nombres en singular (`user`, `session`): no chocan con las del repo (`sessions` es el de los **chats**, plural). Para no confundir, en el código importar las de auth como `authUser`, `authSession`.

### Variables de entorno nuevas (agregar a `src/lib/env.ts`, con tests, y a la tabla de SECURITY_REVIEW)

| Variable                | Obligatoria          | Qué es                                                                                                                                                                   |
| ----------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BETTER_AUTH_SECRET`    | sí (≥ 32 caracteres) | Firma de cookies/tokens. Local: se genera una vez en `data/auth.secret` (permisos `600`) si falta; con `ALLOWED_HOSTS` definido (deploy) falta = el servidor no arranca. |
| `BETTER_AUTH_URL`       | solo en deploy       | URL pública (`https://companion.example.com`). Solo en deploy; local se infiere de la request (ver abajo).                                                               |
| `SIGNUP_ALLOWED_EMAILS` | no                   | Emails que pueden registrarse, separados por coma. Ver Política de registro.                                                                                             |

**Orígenes (verificado contra los tipos de `better-auth@1.7.14`: `trustedOrigins` acepta `string[]` o `(request?) => Awaitable<(string | null | undefined)[]>`, y `baseURL` acepta un string o `{ allowedHosts, fallback }`)**. `pnpm dev` escucha en `127.0.0.1`, y los worktrees usan otros puertos (3738, 3741–3745...), así que una URL fija local no sirve:

- **Deploy** (`ALLOWED_HOSTS` definido): `baseURL = BETTER_AUTH_URL` (fija) y `trustedOrigins = ["https://<cada host de ALLOWED_HOSTS>"]`. Con `TRUST_PROXY=true`, además `advanced.trustedProxyHeaders: true` para que respete `X-Forwarded-Host/Proto` (el mismo criterio que `requestHost`).
- **Local** (sin `ALLOWED_HOSTS`): `trustedOrigins` como **función de la request** que devuelve el `Origin` de la request solo si su hostname es loopback (`localhost`, `127.0.0.1`, `[::1]`, cualquier puerto, http o https), la misma regla que `allowed-hosts.ts`; la lógica vive en `auth-core.ts` (`isLoopbackOrigin`, con tests). `baseURL` se deja sin fijar (se infiere de la request) o se usa `{ allowedHosts: [...loopback], fallback }`; el comodín de puerto en `allowedHosts` no está documentado en los tipos: probarlo, y si no anda, inferir.
- La cookie lleva prefijo `__Secure-` solo con `https`; en `http://127.0.0.1` (`pnpm start`) va sin prefijo. Los tests de login se hacen en `http` y en `https` y en un puerto distinto de 3737.

### Sesiones y cookies

- Sesión en base (tabla `session`), cookie `httpOnly`, `SameSite=Lax`, `Secure` automático cuando `BETTER_AUTH_URL` es `https` (prefijo `__Secure-`). Duración 30 días, se renueva cada día (`session.expiresIn` / `updateAge`). `cookieCache` activado 5 minutos para no ir a SQLite en cada request (revocar una sesión tarda hasta 5 min en notarse; aceptable).
- Cerrar sesión borra la fila. Cambiar la contraseña revoca las demás sesiones (`revokeOtherSessions: true`).
- Sin verificación de email (no hay proveedor de correo) y sin "olvidé mi contraseña" por email: el reseteo es un comando de administrador, `pnpm auth:reset-password <email>` (script en `scripts/`, pide la nueva contraseña por stdin, hace el cambio por el camino del core, **no** con `auth.api.setUserPassword` (eso es del plugin `admin` y pide una sesión de admin): hash con `(await auth.$context).password.hash(nueva)`, `UPDATE account SET password = <hash> WHERE user_id = ? AND provider_id = 'credential'` y `DELETE FROM session WHERE user_id = ?`; verificado en los tipos, `ctx.password.hash` existe). Se documenta en el README.
- Contraseña: mínimo 10 caracteres, máximo 128 (`emailAndPassword.minPasswordLength/maxPasswordLength`). Sin reglas de composición.
- **Rate limit de Better Auth** (`rateLimit: { enabled: true, storage: "database" }`; por defecto solo se activa en producción): 3 intentos por 10 s en `/sign-in/email` y `/sign-up/email` como mínimo (regla `customRules`). El de las rutas de IA es aparte (sección 4).

### CSRF

Se mantienen las dos capas y se suma una:

1. `src/proxy.ts` + `src/lib/cross-site.ts` (ya existen): `POST/PUT/PATCH/DELETE` a `/api/*` con `Sec-Fetch-Site` distinto de `same-origin`, o sin él y con `Origin` distinto del host, dan 403. Aplica también a `/api/auth/*`; los formularios de login son same-origin, no se rompen. Con las cookies `SameSite=Lax` el riesgo restante es mínimo.
2. Better Auth verifica `Origin` contra `trustedOrigins` en cada request con cookie (activo por defecto; **no** poner `advanced.disableCSRFCheck`).
3. Las páginas no usan Server Actions para mutar (todo pasa por rutas `/api`), así que no hay que sumar nada de ese lado. Si un día se agregan, Next ya compara `Origin` con `Host` y hay que alinearlo con `serverActions.allowedOrigins`.

Re-chequear con tests: un `POST` con cookie válida pero `Origin: https://evil.test` da 403 (lo cubre `cross-site.test.ts` y un test nuevo de integración).

### Qué se protege

**Todo, salvo** (lista cerrada, en `src/lib/auth/public-routes.ts`, con test):

- Páginas: `/login`, `/signup`.
- API: `/api/auth/*`, `/api/health` (nuevo, para el healthcheck del deploy: devuelve `{ ok: true }` tras un `select 1`, sin datos).
- Estáticos, sin datos: todo `/_next/*` (`static`, `image`, y `webpack-hmr` en dev, o el HMR se rompe en `/login`), los archivos de `public/` (`*.svg`) y los íconos de metadata (`/favicon.ico`). El matcher de `proxy.ts` hoy solo excluye `/_next/static/`, así que la regla de "público" del proxy es: `/_next/*` + archivos con extensión de `public/` + la lista explícita de arriba. Todo lo demás, con sesión.

Dos niveles, como recomienda `node_modules/next/dist/docs/01-app/02-guides/authentication.md`:

1. **`src/proxy.ts` (chequeo optimista)**: después de los chequeos actuales de host y CSRF, si la ruta no es pública y no hay cookie de sesión (`getSessionCookie(request)` de `better-auth/cookies`, solo mira que exista, no toca la base): páginas → redirect a `/login?next=<ruta>`; `/api/*` → `401 { error: "Sign in to continue" }`. El proxy de Next 16 corre en Node, pero se queda optimista: la cookie falsa pasa este nivel y cae en el segundo.
2. **Cada route handler y cada página (chequeo real)**: `const { userId } = await requireUser()` como **primera línea**. El proxy no alcanza (Next lo desaconseja como única barrera). Se envuelve en un helper para que no se pueda olvidar: `withUser(handler)` en `src/lib/auth/with-user.ts` que traduce `UnauthorizedError` a 401 y le pasa `userId`. Las páginas llaman `getUser()` y hacen `redirect("/login")`. El layout muestra el email y "Sign out" en la barra lateral.

Rutas especiales:

- `/api/tts/runtime/[file]` (WASM de ONNX Runtime para Kokoro): no tiene datos, pero también pide sesión (la página que lo usa ya la pide). Cuidado con los headers COOP/COEP: no cambian.
- `/api/eval/*` y `/eval/asr`: herramienta de desarrollo (graba audio en disco). En producción devuelven 404 salvo `ENABLE_EVAL=true` (variable nueva, default `false`); con login, además solo para el primer usuario (admin). Evita que cualquier usuario escriba en `data/asr-samples`.
- `/api/classification`, `/api/settings/test`, `/api/transcribe`: gastan cuota; van por el rate limit de la sección 4.

### Test de regresión (parte del PR a, depende de test-infra)

Un test de integración que **recorre los `route.ts` de `src/app/api/`** (glob con `import.meta.glob` o `fs`), importa cada handler (`GET/POST/PUT/PATCH/DELETE`) y lo llama **sin cookie**: debe dar 401, salvo las rutas de la lista pública. Si alguien agrega una ruta nueva sin `withUser`, el test falla solo. Otro recorre `page.tsx` y verifica el redirect. Además: body demasiado grande sigue dando 413, y 401 gana sobre 413 (no se lee el body de quien no tiene sesión).

## 2. Política de registro

Opciones: (A) registro abierto, (B) invitación con token, (C) allowlist de emails por variable de entorno.

**Recomendada: C, con arranque limpio.** `SIGNUP_ALLOWED_EMAILS=ana@x.com,bruno@y.com`.

- Si la variable tiene emails: solo esos se pueden registrar (comparación en minúsculas). El registro es el mismo formulario; se rechaza con "Sign-up is closed" (mensaje igual para email no permitido y para registro cerrado: no revela quién está en la lista).
- Si está vacía: solo se puede crear la **primera** cuenta (cuando `user` está vacía); después se cierra. Es el caso local: el usuario actual crea su cuenta y nadie más puede.
- Se aplica en `databaseHooks.user.create.before` (cubre cualquier camino de alta, no solo el endpoint) y se ve en `/signup` (`GET /api/auth/signup-status` devuelve `{ open: boolean }` para mostrar el formulario o un aviso).
- Para dar de alta a alguien: se agrega su email a la variable y se reinicia (para cuatro o cinco personas alcanza; es el mismo mecanismo que `ALLOWED_HOSTS`). Si algún día hace falta más, B (tabla `invites`) es un cambio chico y compatible.
- En un deploy, la lista **debe** estar definida desde el primer arranque (si no, el primero que llegue a `/signup` se queda con la instancia). Lo exige el checklist de DEPLOY.md.

Por qué no A: cada usuario consume su propia cuota de IA (BYOK) pero también CPU, disco y el clasificador del servidor; el registro abierto invita a abuso y a spam de cuentas, y no hay verificación de email. Por qué no B ahora: más piezas (tabla, pantalla de admin) para un puñado de usuarios.

## 3. Multiusuario (PR b)

### Migración de esquema (aditiva)

Una migración de Drizzle con `ALTER TABLE ... ADD COLUMN user_id text REFERENCES user(id) ON DELETE CASCADE` **nullable** en cada tabla de datos, más índices. SQLite no deja agregar una columna `NOT NULL` con FK sin default, y además la base real ya tiene filas: nullable es lo seguro. Las filas viejas quedan con `user_id` NULL hasta el paso de "claim" y **ninguna consulta las devuelve** (todas filtran `eq(user_id, userId)`).

| Tabla                  | Cambio                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Backfill (script de claim)                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sessions`             | `user_id`, índice `(user_id, updated_at)`                                                                                                                                                                                                                                                                                                                                                                                                              | `UPDATE ... SET user_id = :id WHERE user_id IS NULL`                                                                                                                                 |
| `messages`             | `user_id` (denormalizado desde la sesión: las rutas por id de mensaje y las estadísticas no hacen join), índice `(user_id, created_at)`                                                                                                                                                                                                                                                                                                                | desde `sessions` (`user_id = :id` también)                                                                                                                                           |
| `corrections`          | `user_id`, índices `(user_id, created_at)`, `(user_id, classification)`                                                                                                                                                                                                                                                                                                                                                                                | igual                                                                                                                                                                                |
| `vocabulary`           | `user_id`, índice `(user_id, created_at)`                                                                                                                                                                                                                                                                                                                                                                                                              | igual                                                                                                                                                                                |
| `reviews`              | `user_id`; el único `reviews_card_idx (kind, card_key)` pasa a `(user_id, kind, card_key)`                                                                                                                                                                                                                                                                                                                                                             | igual (el índice nuevo va en la misma migración: con `user_id` NULL no choca, porque SQLite trata los NULL como distintos, y las filas viejas ya eran únicas por `(kind, card_key)`) |
| `missed_exercises`     | `user_id`; su único `(session_id, item_index)` se queda (la sesión ya es de un usuario)                                                                                                                                                                                                                                                                                                                                                                | igual                                                                                                                                                                                |
| `review_log`           | `user_id`, índice `(user_id, reviewed_at)`                                                                                                                                                                                                                                                                                                                                                                                                             | igual                                                                                                                                                                                |
| `read_aloud_attempts`  | `user_id`, índice `(user_id, created_at)`                                                                                                                                                                                                                                                                                                                                                                                                              | igual                                                                                                                                                                                |
| `pronunciation_issues` | `user_id`, índice `(user_id, created_at)`                                                                                                                                                                                                                                                                                                                                                                                                              | igual                                                                                                                                                                                |
| `settings`             | **tabla nueva `user_settings (user_id, key, value)`** con PK `(user_id, key)`. `settings` guarda hoy **más** que `app` y `api-keys`: `practice:<sessionId>` (estado de cada chat de práctica, `practice.ts`) y `insights-plan` (`insights/insights.ts`). Todas pasan a `user_settings`. La `settings` vieja se deja intacta (una release de respaldo) y se borra en una migración posterior (un `DROP TABLE` de una tabla sin FK entrantes es seguro). | **copia todas las filas** de `settings` al usuario (`app`, `api-keys`, `practice:*`, `insights-plan` y cualquier otra)                                                               |

**Guardarraíl obligatorio sobre el SQL generado.** La base se abre con `foreign_keys = ON` y `migrate()` (`src/db/index.ts`) aplica todas las migraciones pendientes dentro de **una** transacción `BEGIN IMMEDIATE`; SQLite ignora `PRAGMA foreign_keys = OFF` dentro de una transacción. Si `drizzle-kit generate` produce una **reconstrucción de tabla** (`CREATE TABLE __new_sessions`, `INSERT ... SELECT`, `DROP TABLE sessions`) en vez de `ADD COLUMN`, el `DROP TABLE` dispara las cascadas (`ON DELETE CASCADE`) y borra `messages`, `corrections` y `vocabulary` de la base real. Por eso:

1. Quien genere la migración **lee el `.sql`**: solo puede contener `ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX` y `DROP INDEX`/`CREATE UNIQUE INDEX`. Si aparece `__new_` o `DROP TABLE` de una tabla con datos, se reescribe a mano (o se parte en pasos que no reconstruyan).
2. El test de migraciones con el fixture viejo (de test-infra) agrega: **conteo de filas por tabla antes y después** de aplicar la migración nueva, igual en todas, y un test que falla si algún `.sql` de `drizzle/` posterior a esta migración contiene `DROP TABLE` sobre una tabla de datos.
3. La misma regla vale para una eventual migración posterior de `NOT NULL`: Drizzle la generaría como reconstrucción de tabla, así que **no se hace**; la columna queda nullable y la garantía es el helper y el test de esquema.

Reglas de la migración: nunca `NOT NULL` sobre filas existentes, nunca borrar datos. Mientras tanto la garantía la da (1) el helper de acceso y (2) un test que revisa que **toda tabla de `schema.ts` salvo las de auth tiene `user_id`** (introspección de `schema`): una tabla nueva sin dueño rompe el test.

### Migración de los datos actuales: `pnpm auth:claim-data <email>`

Elegido: **comando explícito, una vez**, no un claim automático en el primer registro. Es lo más seguro porque:

- No hay forma de que un desconocido se quede con los datos por llegar primero a un deploy que partió de una copia de la base.
- Es reversible (hace un backup antes) y se puede probar sobre una copia (`DATABASE_PATH=data/dev.db`).
- El costo es un comando, una vez, por la persona que ya está administrando la app.

Flujo para el usuario actual:

1. Actualiza la app (PR b mergeada). La migración agrega las columnas; todo sigue andando, pero (con el PR a ya mergeado) tiene que iniciar sesión: crea su cuenta en `/signup` (es la primera, entra sin allowlist).
2. Mientras no corra el claim, la app muestra los chats vacíos y un aviso en el arranque (`console.warn` de una línea, sin contenido) y una banda en la UI para el admin: "Your earlier data isn't assigned to an account yet. Run `pnpm auth:claim-data your@email`".
3. Corre `pnpm auth:claim-data tu@email`:
   - Falla si el email no existe en `user`, o si hay más de un usuario **y** ya hay filas con dueño distinto (no pisa nada ajeno). Solo toca filas con `user_id IS NULL`.
   - Hace un backup con `db.backup()` de better-sqlite3 a `data/backups/pre-claim-<timestamp>.db` (permisos `600`).
   - En **una transacción**: `UPDATE` de cada tabla de la lista (`WHERE user_id IS NULL`), copia de **todas** las filas de `settings` → `user_settings` (incluidas las `practice:*` y `insights-plan`, y las keys `api-keys`; ya cifradas en el paso c o todavía en claro: las cifra con la clave del servidor si ya existe el paso c), y verificación al final (cuenta de filas con NULL = 0 y totales por tabla iguales a los de antes). Si algo falla, rollback.
   - Es idempotente: una segunda corrida no encuentra nada que reclamar.
4. En el deploy: se copia la base local con el claim ya hecho (preferible) o se corre el comando en el servidor con la base restaurada.

### Cómo se acota cada query

Regla: **ninguna función que lee o escribe datos de usuario sin recibir `userId`**. Es un cambio mecánico de firma en **todo módulo que importa `@/db`** (hoy 15 archivos de `src/lib/`, p. ej. `chat`, `corrections`, `stats`, `review-stats`, `flashcards`, `flashcards-upkeep`, `missed-exercises`, `practice`, `practice-start`, `read-aloud`, `vocabulary`, `settings`, `secrets`, `classification`, `insights/insights`; el listado real sale de `grep -l '@/db' src`) y en **todo `route.ts`** (hoy 23). El test de aislamiento y el de "401 en toda ruta" recorren los archivos reales, no una lista escrita acá.

- **`practice.ts` e `insights.ts`** leen y escriben `user_settings` con `userId`; el `LIKE 'practice:%'` de `practice.ts` filtra además por `user_id` (si no, listaría los chats de práctica de todos).

- Helper `src/db/owned.ts`: `owned(table, userId, ...more)` devuelve `and(eq(table.userId, userId), ...more)`, así no se escribe a mano (y se revisa en review) cada filtro.
- **Por id** (`/api/sessions/[id]`, `/api/messages/[id]/retry`, `/api/corrections/[id]`...): el `where` incluye siempre `userId` además del id. Si no existe **para ese usuario**, responde **404** (no 403: no revela que el id existe).
- **Inserts**: toda fila nueva lleva `userId`; los hijos lo copian del padre en la misma función (`messages`, `corrections`, `vocabulary`).
- **Estadísticas** (`stats.ts`, `tense-stats`, `dashboard-summary`, `insights`, nivel CEFR, fluidez, pronunciación): las consultas de carga reciben `userId`; el cálculo puro (`*-core.ts`) no cambia. `countsInStats` se sigue usando igual.
- **Flashcards**: `reviews` se busca por `(user_id, kind, card_key)`; el upkeep (`flashcards-upkeep.ts`: huérfanas, sincronización) corre **por usuario** y solo limpia filas de ese usuario.
- **Borrar un usuario** (futuro): `ON DELETE CASCADE` desde `user`. `missed_exercises.session_id` es `SET NULL`, así que su `user_id` también cascadea (por eso la columna propia).

### Settings por usuario

`getSettings(userId)` / `saveSettings(userId, ...)` leen y escriben `user_settings` con clave `app`. Para un usuario nuevo sin fila: `DEFAULT_SETTINGS`. La cadena de proveedores, el idioma de explicación y las tarjetas por sesión son entonces por usuario sin tocar `settings-core.ts`. Las keys van en la clave `api-keys` de la misma tabla (sección 5).

### Jobs en segundo plano

- **Clasificador** (`classification.ts`): el estado (`running`, `activeChats`, `idleTimer`, `lastError`) hoy es uno solo en `globalThis`. Pasa a `Map<userId, JobState>`. Cada lote trabaja con correcciones de **un** usuario, con **su** `getSettings` y **sus** keys (se resuelven dentro del job, sin request, con el `userId` capturado). `withChatPriority(userId, run)`: un chat solo frena el lote del mismo usuario (las keys y cuotas son suyas). Tope global de lotes simultáneos (2) para no saturar el servidor, con una cola simple en memoria. `getClassificationStatus(userId)` filtra por usuario. El `idleTimer` se arma por usuario; si ese usuario no tiene keys, el lote falla y se reintenta (hasta `MAX_ATTEMPTS`) como hoy.
- **Upkeep de flashcards**: se dispara desde las rutas de flashcards con el `userId` de la sesión; no hay barrido global.
- Ningún job escanea tablas sin filtrar por usuario (lo cubre el test de aislamiento).

### Tests de aislamiento (integración, `ai/test`, base temporal, dos usuarios)

Fixture: usuarios A y B, cada uno con chat, mensajes, correcciones, vocabulario, tarjetas y settings. Tests:

1. Por **cada ruta con id**: B pide/modifica/borra un id de A → 404 y la fila de A queda igual.
2. Por **cada ruta de listado/estadística**: la respuesta de B no contiene ningún id ni texto de A (se comparan los conjuntos de ids).
3. El clasificador de B no toma correcciones de A, ni usa las keys ni los settings de A.
4. `tenseCounts` / dashboard / insights de B ignoran los datos de A.
5. Guardia de esquema: toda tabla de datos tiene `user_id` (arriba).
6. Una consulta "sin filtro" de la API (`db.select().from(schema.x)` sin `userId`) falla un lint: regla `no-restricted-syntax` o un test que greppea `src/lib` por `.from(schema.<tabla>)` sin `owned(`/`userId` cercano (empezar con el test, es más barato que una regla propia).

## 4. Límites por usuario (parte del PR b)

SECURITY_REVIEW hallazgo 8. En memoria (un solo proceso, como el clasificador), en `src/lib/rate-limit.ts` (lógica pura con tests, ventana deslizante):

- Rutas de IA (send, retry, practice, insights, prompt, `settings/test`, `classification`): 30 pedidos por minuto por usuario.
- `/api/transcribe`: 10 por minuto y 60 minutos de audio por día por usuario (se suma `audioDurationMs` de `messages` del día).
- Si el usuario usa las keys compartidas del servidor (sección 5), tope diario de mensajes (default 100, `SHARED_KEY_DAILY_MESSAGES`).
- Respuesta `429` con `Retry-After`. Al reiniciar el proceso se reinician los contadores: aceptable (el diario sale de la base).

## 5. API keys por usuario, cifradas (PR c)

### Qué cambia

`src/lib/secrets.ts` pasa de `getStoredKeys()` global a `getStoredKeys(userId)` (fila `api-keys` de `user_settings`), y `resolveApiKey(userId, provider)`. `resolveModel` y todo lo que lo llama (`analyzeMessage`, `generateText`, el clasificador, `transcribe`, `listModels`) reciben el `userId` (o las keys ya resueltas). La UI de Settings (tarjetas por proveedor, botones Test) no cambia: solo guarda y prueba las keys del usuario de la sesión.

### Cifrado en reposo

- **Algoritmo**: AES-256-GCM con `node:crypto` (sin dependencias). IV aleatorio de 12 bytes por cifrado, tag de 16 bytes.
- **Formato** guardado (string): `v1.<keyId>.<iv>.<tag>.<ciphertext>`, todo base64url. `keyId` = primeros 4 bytes de `SHA-256(clave)` en hex, para saber con cuál clave se cifró.
- **AAD** (datos autenticados): `"<userId>:<provider>"`. Una fila copiada a otro usuario o a otro proveedor no descifra.
- El valor guardado en `user_settings` pasa de `{ gemini: "AIza…" }` a `{ gemini: "v1.…" }`. La lectura detecta el formato: si no empieza con `v1.`, es una key en claro del formato viejo y se acepta (migración perezosa) y se re-cifra al leerla en la primera escritura. El claim de datos (sección 3) las cifra directamente.
- Las keys **nunca** viajan al cliente (hoy ya es así: `maskKey`) ni se loguean. El módulo `secrets-crypto.ts` (puro, sin `server-only`, con tests: ida y vuelta, AAD distinta falla, tag alterado falla, clave equivocada falla, formato viejo se acepta) recibe la clave por parámetro.

### Clave del servidor

- **Variable**: `APP_ENCRYPTION_KEY`, 32 bytes en base64 (`openssl rand -base64 32`). Se valida en `env.ts` (largo exacto tras decodificar).
- **Rotación**: `APP_ENCRYPTION_KEYS_OLD` (lista separada por comas de claves anteriores). Se cifra siempre con `APP_ENCRYPTION_KEY`; se descifra buscando por `keyId` entre la actual y las viejas. Para rotar: poner la nueva en `APP_ENCRYPTION_KEY`, mover la anterior a `..._OLD`, reiniciar, correr `pnpm keys:reencrypt` (relee todas las filas `api-keys` y las vuelve a cifrar con la actual, en una transacción, con backup antes), y recién después se puede quitar la vieja.
- **Sin la variable, en local**: se genera una clave aleatoria una vez en `<carpeta de DATABASE_PATH>/encryption.key` (permisos `600`, aviso de una línea en el log, en inglés). Protege de que alguien lea un backup o una copia de la base sin la carpeta de la clave; **no** protege de quien tenga acceso a la carpeta `data/` entera. Para el uso local de una persona es el equilibrio correcto: el usuario no tiene que configurar nada.
  - **Worktrees**: la base de un worktree es una copia (`data/dev.db`), así que hay que copiar **también `data/encryption.key`** (a la misma carpeta que la base copiada, `data/`); si no, las keys copiadas no descifran. Se agrega a los pasos de worktree de `CLAUDE.md` y a `setup-worktree.sh`.
  - **Una key que no descifra no es un 500**: cuenta como "sin key" para ese proveedor, con una línea de advertencia en el log (sin la key ni el texto cifrado) y el aviso de "add your key" en la UI.
- **Sin la variable, en deploy** (`ALLOWED_HOSTS` definido): el servidor **no arranca** (`instrumentation.ts`, mensaje claro). Nunca se genera una clave sola en un servidor.
- **Backup**: la clave tiene que respaldarse **aparte** de la base (gestor de contraseñas). Perderla = el usuario vuelve a pegar sus keys; no se pierden chats ni estadísticas.

### Keys del servidor (variables de entorno)

`GOOGLE_GENERATIVE_AI_API_KEY` y `GROQ_API_KEY` hoy son fallback global. Con varios usuarios:

- Nueva variable `SHARED_KEYS` (`true`/`false`, default `true` para que el uso local actual no cambie). Con `true`, un usuario sin key propia usa la del servidor, con el tope diario de la sección 4. Con `false` (**recomendado en el deploy**) cada uno trae las suyas.
- Sin ninguna key (propia ni compartida): `NO_PROVIDER_MESSAGE`, como hoy, y el aviso del dashboard (_Dashboard: show the no-API-key notice at the top_) lleva a Settings.

### Dictado sin key de Groq

El dictado usa Groq Whisper. Sin key de Groq (propia o compartida): el botón de micrófono queda **deshabilitado con un texto** ("Add a Groq key in Settings to dictate") y `/api/transcribe` responde 400 con el mismo mensaje (`TranscriptionUnavailableError`, que ya existe). No hay otro motor de respaldo; escribir sigue andando.

### Tests

Cifrado (arriba), "las keys de A no se resuelven para B" (aislamiento), "el cliente nunca recibe la key" (el JSON de `GET /api/settings` no contiene el valor guardado), y el claim cifra las keys viejas.

## 6. Plan de implementación en orden

Tres PRs, en este orden (cada una usable sola). Dependen de que `test-infra` (tests de rutas y de migraciones) ya esté mergeado.

### a) PR auth (tanda 2, equipo `auth`)

1. `better-auth` (versión exacta), variables nuevas en `env.ts` con tests, `BETTER_AUTH_SECRET` autogenerado en local.
2. Tablas de auth en `schema.ts` + `pnpm db:generate` + test de migración con el fixture viejo.
3. `auth.ts`, `auth-core.ts` (+ tests de `canSignUp`), ruta `/api/auth/[...all]`, `session.ts`, `with-user.ts`.
4. Páginas `/login`, `/signup`, botón "Sign out" y email en la barra lateral. Redirect `?next=` solo a rutas internas (validar que empiece con `/` y no con `//`).
5. `proxy.ts`: chequeo optimista + lista pública; `GET /api/health`.
6. Envolver todas las rutas (`route.ts`) con `withUser`; `requireUser`/`getUser` en las páginas. `eval` fuera de dev por `ENABLE_EVAL`.
7. Test de regresión "401 en toda ruta" y "toda página redirige", tests de CSRF con cookie, 413 vs 401.
8. Docs: README (cómo crear la cuenta, reseteo de contraseña), SECURITY_REVIEW (hallazgos 1 y 2 resueltos, checklist), `.env.example`.
   - **Efecto para el usuario**: tras el merge tiene que crear su cuenta una vez; sus datos siguen ahí (todavía sin dueño) y la primera cuenta los ve todos. En esta etapa solo existe una cuenta (registro cerrado salvo el primero), así que no hay mezcla posible.

### b) PR multiusuario (tanda 3, equipo `multi-user`)

1. Migración `user_id` nullable + `user_settings` + índices; `src/db/owned.ts`.
2. Firma con `userId` en los módulos de `src/lib/` y rutas; settings por usuario; límites por usuario (`rate-limit.ts`).
3. Clasificador y upkeep por usuario.
4. `pnpm auth:claim-data <email>` (script en `scripts/`, con tests contra una base temporal: filas con NULL → dueño, idempotencia, rollback si falla, backup creado).
5. Tests de aislamiento (sección 3), guardia de esquema.
6. Banda de "datos sin asignar" y `console.warn` de arranque.
7. `SIGNUP_ALLOWED_EMAILS` documentado; probar con dos cuentas en el worktree.
8. Antes de mergear a `develop`: backup de `data/companion.db` y **correr el claim** sobre la base real justo después del merge (lo hace el usuario o el orquestador, con el comando de arriba).

### c) PR keys (tanda 4, equipo `keys`)

1. `secrets-crypto.ts` + tests; `APP_ENCRYPTION_KEY(S_OLD)`, archivo de clave local, chequeo de arranque en deploy.
2. `secrets.ts` por usuario y cifrado; lectura del formato viejo; `resolveModel` con `userId`.
3. `SHARED_KEYS`, tope diario, dictado sin key (UI y ruta).
4. `pnpm keys:reencrypt`; el claim de datos cifra las keys.
5. Tests (sección 5), docs (README: dónde está la clave y cómo respaldarla), SECURITY_REVIEW (hallazgo 6 resuelto).
6. _Export / import the database_ (también en esta tanda): por usuario y **sin keys**.

## Riesgos y preguntas abiertas

- **Better Auth cambia rápido**: antes de empezar la PR a, leer su guía de Next (`https://www.better-auth.com/docs/integrations/next`) y el `CHANGELOG` de la versión elegida; los nombres de opciones de este doc se verificaron contra los tipos de `better-auth@1.7.14` (`trustedOrigins` como función, `baseURL` dinámico, `rateLimit.customRules/storage`, `emailAndPassword.minPasswordLength/maxPasswordLength/disableSignUp`, `databaseHooks.user.create.before`, `advanced.useSecureCookies/trustedProxyHeaders`, `session.cookieCache`, `ctx.password.hash`); si se sube la versión, repetir la verificación.
- **Reseteo de contraseña sin email**: depende del administrador. Si algún día se suma un proveedor de correo, se activa `sendResetPassword` sin cambiar el esquema.
- **Rate limit en memoria**: sirve con un solo proceso (que es lo que ya exige el clasificador); con más de una instancia habría que moverlo a la base.
- **Índice único de `reviews`**: cambiarlo a `(user_id, kind, card_key)` hay que cubrirlo con el test de migraciones con el fixture viejo (de test-infra).
