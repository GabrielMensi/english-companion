# Backlog run: prueba manual

> Area: Platform · Kind: Eval · Status: In progress · Board: #111–#128 y siguientes

Qué probar a mano en la rama `integration/backlog` antes de mergearla en `develop`. Plan y estado del trabajo en [BACKLOG_RUN.md](BACKLOG_RUN.md).

## Cómo levantar la rama

1. Worktree: `~/personal-projects/ec-worktrees/integration` (rama `integration/backlog`). Tiene su propia copia de la base en `data/dev.db` (`DATABASE_PATH=data/dev.db` en `.env.local`); tu `data/companion.db` no se toca.
2. Si querés probar con tus datos de hoy, volvé a copiar la base antes de empezar (con la app cerrada o con `better-sqlite3` `backup`).
3. `pnpm install && pnpm dev --port 3738` y abrir https://localhost:3738.

Cada sección dice qué probar y qué tendrías que ver. Marcá `[x]` lo que funciona y anotá abajo lo que no.

<!-- Las secciones se agregan a medida que se mergea cada PR. -->

## Tanda 1

### Tests (#129: #111–#114)

Nada para probar a mano. Opcional: la app arranca y abre un chat (cambió dónde vive `migrate` en `src/db/`).

### Limpieza (#130: #119–#123)

- [ ] Descartar un error en el chat, en Top mistakes y en una fila de categoría: funciona, sin error 400.
- [ ] Flashcards: repasar una tarjeta de vocabulario, una de error, una de ejercicio y una de pronunciación (frente/dorso, pista, nota, suspender/borrar).
- [ ] Dashboard: "Retry" en el aviso de clasificación sigue reintentando y refrescando.
- [ ] Chat: mandar, dictar y reintentar un mensaje: todo igual que antes.
- [ ] Today: los totales de la semana y la fila de pronunciación se ven igual.
- [ ] Settings → Test con una key mal escrita: en la consola del servidor aparece una línea tipo `[POST /api/settings/test] 502 …` sin la key ni texto tuyo.

### Diseño y releases (#131: research de #124–#127, #128)

- [ ] Leer `docs/platform/AUTH_MULTIUSER.md`, `DEPLOY.md` y `RELEASES.md` y confirmar las decisiones: registro cerrado con lista de emails permitidos (`SIGNUP_ALLOWED_EMAILS`; vacía = solo la primera cuenta), tus datos pasan a tu cuenta con `pnpm auth:claim-data <email>`, VPS + Docker + Caddy (revisar los precios en DEPLOY.md, se estimaron), sin archivo CHANGELOG.
- Labels para las notas de release creados en el repo: `feature`, `bug`, `security`, `chore`, `research`, `eval`, `skip-changelog`.

### Arreglos de IA (#141: #115–#118)

- [ ] Con Groq como único proveedor (sin la key de Gemini o desactivado), corregir un mensaje de ~300 palabras con errores: funciona. Uno mucho más largo puede mostrar "too long for the provider's free tier limit" (no "HTTP 400").
- [ ] Varios mensajes seguidos que pasen el límite por minuto de Groq: el aviso es de cuota / probá en unos segundos, no "too long".
- [ ] Descartar un error, marcar otro como typo a mano, cambiar el tipo de otro con "Wrong type?" y reintentar el mensaje: las marcas quedan en las correcciones que coinciden (el descarte solo si la nueva corrección es la misma).
- [ ] Opcional (gasta un poco de cuota): `pnpm eval:models <spec> --limit=2 --check` muestra PASS/FAIL.

### Seguridad (#142)

- [ ] Después de `pnpm install`, la app arranca y funciona como antes (Next 16.4.3).

## Tanda 2

### Kokoro y Content-Security-Policy (#143: #45, #137)

- [ ] En todas las páginas: sin errores "Content Security Policy" en la consola del navegador.
- [ ] Dictado por micrófono, Read aloud y los gráficos de dashboard e insights funcionan.
- [ ] Ventana flotante (PiP): mantiene los estilos y ▶ reproduce Kokoro.
- [ ] Settings → Listening: Kokoro con Device = CPU y con Device = GPU baja el modelo de Hugging Face sin errores.
- Si algo se rompe: `CSP_REPORT_ONLY=true` en `.env.local`, reiniciar, y pasame los mensajes de la consola.
- [ ] En la RX 9070 XT (#45): copiar de `chrome://gpu` las líneas de WebGPU, GL_RENDERER, driver y backend; Device = GPU → Try it; "Copy diagnostics" y pegar el reporte en #45.

### Voz: chequeo de sonidos beta (#145: #132–#136)

- [ ] `/read-aloud`: la primera lectura muestra "Sound check · Beta: Getting the sound model ready (N%)…" hasta que baja el modelo (~318 MB, una sola vez).
- [ ] Leé una oración diciendo "to" como "tuu" y "banana" con todas las vocales plenas: aparece "Weak vowels (schwa) · /ə/ → /uː/" con un consejo y "not saved and not counted in your stats yet".
- [ ] Leé "I think this is very good" diciendo "tink" y "bery": los problemas muestran "the sounds say the same, /θ/ → /t/".
- [ ] "Sounds to work on" y el dashboard no muestran schwa.
- [ ] El servidor de la app usa ~0,5 GB más de RAM con el modelo cargado (si molesta: `PHONEME_CHECK=false`).
- [ ] Eval con tus grabaciones (#136): `pnpm tsx scripts/spike/pron-audio/real.mts --list`, después `--init`; grabá los clips en `data/pron-real/` (33 en total, mínimo los 13 marcados con `*`) y corré el script sin flags. Con eso decidimos si schwa pasa a las estadísticas. La guía está en `docs/voice/PRONUNCIATION_AUDIO.md`.

### Listo para deploy (#144: #127, #139, #140)

- [ ] `pnpm dev` como siempre: migra al arrancar y https://localhost:3738/api/health devuelve `{"ok":true}`.
- [ ] `pnpm db:backup` en el worktree de integración crea un backup de `data/dev.db` en `data/backups/` (nunca toca `data/companion.db`).
- [ ] Opcional, si instalás Docker: los comandos de "Probar la imagen" en `docs/platform/DEPLOY.md` (base descartable). CI ya construye la imagen y chequea `/api/health` en cada PR que toca esos archivos.
- [ ] Leer la guía "Cómo desplegar" en DEPLOY.md. No se publicó nada; el workflow de deploy está apagado.

### Login (#148: #124, #138)

Desde acá la app pide login siempre, también en local.

- [ ] Reiniciar `pnpm dev` en el worktree de integración: cualquier página (p. ej. /dashboard) manda a `/login?next=/dashboard`.
- [ ] `/signup`: crear tu cuenta (la primera; contraseña de 10+ caracteres). Entrás a la app, la barra lateral muestra tu email y "Sign out". Desde multiusuario tus chats viejos no aparecen hasta correr `pnpm auth:claim-data` (ver la sección siguiente).
- [ ] Con sesión, `/login` y `/signup` te llevan al inicio. "Sign out" vuelve a `/login`.
- [ ] `/signup` con otro email: rechazado (403), el mismo mensaje exista o no ese email.
- [ ] Contraseña mal varias veces seguidas: "too many attempts" (429) a partir del 4º intento.
- [ ] Sin cookie, `curl -sk https://localhost:3738/api/sessions` da 401; `curl -sk https://localhost:3738/api/health` da `{"ok":true}`.
- [ ] La app de 3737 y la del worktree tienen sesiones separadas (entrar en una no te saca de la otra).
- [ ] `pnpm auth:reset-password <tu email>` pone una contraseña nueva y cierra las sesiones.
- Con multiusuario ya podés agregar otras cuentas (ver la sección de multiusuario más abajo).

### Multiusuario (#125)

Probalo con la copia de la base del worktree de integración (`data/dev.db`), nunca con `data/companion.db`. Cada cuenta ve solo lo suyo.

- [ ] Reiniciá `pnpm dev` en el worktree de integración (migra a `0015_multi_user`: el backup lo hace `pnpm db:migrate`, o copiá `data/dev.db` antes). Entrá con tu cuenta (o creala en `/signup`: la primera no necesita allowlist): los chats, las estadísticas y las tarjetas aparecen **vacíos**, y arriba hay una banda amarilla "Your earlier chats, mistakes and flashcards aren't assigned to an account yet..." con el comando.
- [ ] Con el servidor andando (o apagado), en la carpeta del worktree: `pnpm auth:claim-data <tu email>`. Muestra las filas sin dueño, escribe `data/backups/pre-claim-<fecha>.db` y lista cuántas filas pasaron por tabla (sesiones, mensajes, correcciones...). Recargá: aparecen todos tus chats, el dashboard con tus estadísticas, el vocabulario, las tarjetas (con su avance), la pronunciación, los ajustes (modelo, idioma) y el plan de estudio de Insights. La banda desaparece.
- [ ] Corré el mismo comando otra vez: "Nothing to claim". Con un email que no existe: error "No account with the email", y no cambia nada.
- [ ] Segunda cuenta: agregá su email a `SIGNUP_ALLOWED_EMAILS` en `.env.local` del worktree (p. ej. `SIGNUP_ALLOWED_EMAILS=otra@x.com`), reiniciá, cerrá sesión y registrate en `/signup`. La cuenta nueva ve todo vacío (sin chats, sin tarjetas, dashboard en cero, vocabulario vacío), sin banda amarilla, y los ajustes por defecto. Escribí un mensaje de prueba (necesita una key; las guardadas de la app se comparten por ahora): aparece solo en esa cuenta.
- [ ] Volvé a entrar con la primera cuenta: no aparece nada de la segunda, y sus datos están igual que antes. Cambiá un ajuste en una cuenta y comprobá que la otra no cambia.
- [ ] Con las dos cuentas abiertas en navegadores distintos, pedí a mano `/chat/<id de un chat de la otra>` o `/api/sessions/<id>/messages`: 404.
- [ ] Sacá la segunda cuenta de la lista (`SIGNUP_ALLOWED_EMAILS`) cuando termines.

## Tanda 3

### Evals (#150: #146, #147)

- [ ] `pnpm eval:export-discards`: con tus datos dice "9 discarded corrections, 9 kept in 6 messages, 0 dropped" (o los números que tengas) y `.eval-results/discards.json` no aparece en `git status`.
- [ ] Opcional (pocas llamadas): `pnpm eval:models gemini:gemini-flash-lite-latest --with-discards`: aparece la columna `repeatedDiscards` y la terminal muestra `discard #n`, no tu texto.
- [ ] `pnpm eval:models <spec> --topics-only --check` se niega a correr.
- Resultado del eval de temas (n=8, orientativo): Gemini 100% con la regla de tema vs 90% sin, Groq 90% vs 90%, 0 falsos positivos: los chats de tema no empeoran la corrección (`docs/ai/TOPIC_EVAL.md`).

### E2E y CSP (#164: #149, #153)

- [ ] `pnpm test:e2e`: construye la app y pasa 10/10 sin tocar `data/`.
- [ ] `AI_FAKE=1 pnpm dev` (sin `E2E_TEST_SERVER`, o con la base real) se niega a arrancar.
- [ ] Después del merge a `main` (GitHub solo deja disparar workflows que existen en la rama por defecto): Actions → "E2E" → Run workflow: verde. La corrida nocturna prueba `develop`.
- [ ] En /settings (y en general): sin errores "Content Security Policy" en la consola. Zod ahora se importa siempre desde `@/lib/zod` (el lint lo exige).

## Tanda 4

### Ventana flotante y dashboard (#154: #151, #152)

Necesita Chrome o Edge (la ventana flotante no se pudo probar a mano).

- [ ] Chat → mensaje con errores → ventana flotante: al pasar por un error aparecen "Wrong type?" y "Discard".
- [ ] "Wrong type?" abre el diálogo dentro de la ventana flotante; Tab / Shift+Tab no salen del diálogo; los desplegables de categoría y tiempo verbal quedan dentro de la ventana; con una categoría de tiempo verbal (4 campos) Save sigue alcanzable; al guardar se actualizan la lista y la pestaña. También en modo oscuro.
- [ ] Sin red → Save: el error aparece dentro del diálogo.
- [ ] "Discard": el error desaparece y una nota dice que se deshace desde la pestaña; Undo funciona desde la pestaña.
- [ ] Sin API key → /dashboard muestra el aviso arriba; con key, no.

### Clases (#158, #159, #160)

Con la base copiada y la cuenta con tus datos (`pnpm auth:claim-data <email>`). Para el paso de la IA hace falta una API key.

- [ ] Barra lateral → Review → **Class** abre `/class`. Agregá una clase de hace 3 días con nivel B1 y una nota: aparece en la lista; cambiar el nivel en el selector se guarda al recargar.
- [ ] **Report for the next class** (o "Report since this class"): muestra "Since the class on …", los errores más repetidos con ejemplos, las áreas que empeoraron y las palabras con [corchetes] de esos días; "Level" muestra la estimación de la app y el B1 del profesor.
- [ ] En el reporte, "Use these dates" con otras fechas y "Since a class" cambian el período. **Print / save as PDF**: la vista previa no tiene la barra lateral y todo el texto entra; **Copy as Markdown** y **Download .md** traen el mismo contenido.
- [ ] **What should I ask?** escribe 3 a 5 preguntas con su porqué; al recargar siguen ahí.
- [ ] En la clase → **Load the teacher's corrections**: pegá `I have went → I went` y `I'm agree → I agree`, más `New word: bucket list`. **Structure with AI** muestra los errores con su categoría y la palabra con su traducción; quitá uno con la X y guardá con "Save as From class" (sin API key el botón está deshabilitado y explica por qué).
- [ ] La clase lista lo cargado con el badge **From class**. En el Dashboard (categoría → lista de errores) y en Vocabulary aparece el badge; en Flashcards → errores están las tarjetas nuevas (sin ícono de chat). Los números del dashboard subieron en esos errores.
- [ ] Esos errores NO aparecen en el reporte para llevar a clase. Borrar la clase borra también lo cargado.
- [ ] Insights → Estimated level: debajo de la estimación dice "Your teacher's level on …: B1" y cuántos niveles de diferencia hay.
- [ ] El chat oculto de la clase no aparece en la barra lateral.
- [ ] Descartá un error "From class" (Dashboard) y abrí Discarded: su link dice "Open class" y va a /class.
- [ ] Today: "wrote this week" no cuenta lo cargado de una clase (con una semana sin escribir y una clase cargada, Today sigue pidiendo escribir).

### Errores descartados (#166: #165)

- [ ] /dashboard → "Most frequent mistakes" → "Discard this example" en uno: aparece el link "Discarded (1)".
- [ ] Abrirlo: el fragmento tachado, la corrección, la categoría y la fecha; "Open chat" abre el chat correcto.
- [ ] Undo: la fila desaparece; en el dashboard el error vuelve a contar y el link se va.
- [ ] Una segunda cuenta ve solo sus propios descartes.

### Chats de tema (#167: #161–#163)

Usa algunas llamadas reales a la IA.

- [ ] "Talk about…" → "Also practice": Present perfect → entrevista: las preguntas del tutor tiran al present perfect sin nombrarlo. Cambiar o sacar el tiempo desde el header: la respuesta siguiente lo sigue y queda guardado al recargar.
- [ ] Responder 3–4 preguntas con errores → Feedback: cada frase citada y cada error son cosas que escribiste; nada inventado (empresas, números, detalles); las frases en español con ¡…! y los nombres de tiempos verbales quedan. Al recargar sigue ahí; "Write it again" lo regenera. Con menos de 2 respuestas, Feedback está deshabilitado.
- [ ] Phrases: aparecen sugerencias tildadas; destildar una y guardar; /vocabulary las muestra con link al chat; dos con el mismo significado se ven las dos; volver a Phrases no repite las guardadas.
- [ ] En un chat normal estos botones no aparecen. A ~400px de ancho el header se acomoda sin desbordarse.

### API keys por usuario y exportar/importar (#168: #156, #126, #157)

- [ ] Reiniciar `pnpm dev` del worktree de integración; Settings: tus cards de Gemini y Groq siguen diciendo "API key set" con los mismos 4 últimos caracteres y Test funciona. Existe `data/encryption.key` (permisos 600).
- [ ] Cambiar o borrar una key y recargar: queda guardada y enmascarada.
- [ ] Con `SHARED_KEYS=false` en `.env.local` (y sin keys en el env), una segunda cuenta (en la allowlist) ve el aviso de "sin key", no puede chatear ni dictar y no ve ninguna de tus keys.
- [ ] Exportar desde tu cuenta: el archivo no tiene `AIza`/`gsk` ni `api-keys`. Importarlo en la segunda cuenta: aparecen sus chats, errores y flashcards (los chats de tema conservan tema y tiempo verbal); importarlo de nuevo no agrega nada.
- Importante al mergear a `develop`: tu key actual pasa cifrada a tu cuenta la primera vez que se lee; hacé backup de `data/companion.db` antes (como siempre) y guardá `data/encryption.key` junto con la base.

### Clases (#169: #158–#160)

Los pasos de la sección de clases que agregó el equipo (más arriba) siguen valiendo. Además:

- [ ] Una corrección de clase de preposiciones (`depend of → depend on`) cuenta en la categoría del dashboard y en flashcards, y no aparece en "Written".
- [ ] Sin cantidad de palabras, el "errors per 100 words" del dashboard no cambia, pero los errores aparecen en los conteos y en Flashcards.
- [ ] Today: "wrote this week" no cuenta cargas de clase.
- [ ] Descartar un error "From class": en Discarded dice "Open class" y lleva a /class.

## Al mergear a `develop` (después de aceptar todo)

Simulado sobre una copia de tu base anterior a la corrida (revisión final, `reviews/final-r1.md`): migraciones 0014–0016, alta de cuenta, tus keys pasan cifradas a tu cuenta y `auth:claim-data` mueve todo; no se pierde ninguna fila (21 chats, 96 mensajes, 329 correcciones).

1. **Pará la app de 3737** (Ctrl+C en `pnpm dev`): el merge sube Next (16.4.0 → 16.4.3) y agrega dependencias (better-auth…); un hot reload antes de `pnpm install` rompe la app.
2. **Backup**, con la app parada: `mkdir -p data/backups && cp data/companion.db data/backups/pre-accounts-$(date +%F).db` (y `companion.db-wal` / `-shm` si siguen ahí).
3. Mergear la PR y, en esta carpeta, `git pull && pnpm install` (un solo comando).
4. **Variables de entorno:** en local no hace falta nada nuevo (tus keys están guardadas en la app; `SHARED_KEYS` vale `true` por defecto). Opcional: `SIGNUP_ALLOWED_EMAILS` para sumar cuentas más adelante. No pongas `ALLOWED_HOSTS` en local: activa el modo deploy, que exige `BETTER_AUTH_*`, `APP_ENCRYPTION_KEY` y `SHARED_KEYS`.
5. `pnpm dev`: las migraciones se aplican al arrancar. https://localhost:3737 te manda a `/login`; en `/signup` creá tu cuenta (contraseña de 10+ caracteres; la primera cuenta no necesita allowlist).
6. **Settings:** tus keys de Gemini y Groq aparecen como `••••xxxx` y ya quedaron cifradas. En `data/` aparecen `encryption.key` y `auth.secret`. **Guardá `data/encryption.key` aparte de la base:** sin ese archivo las keys guardadas no se pueden descifrar y hay que volver a pegarlas.
7. En esta carpeta: `pnpm auth:claim-data <tu email>` (puede correr con la app levantada). Hace `data/backups/pre-claim-<fecha>.db` e imprime las filas que movió.
8. Verificar: tus chats en la barra lateral, los números del dashboard iguales a antes, sin el aviso amarillo de "claim", y Settings → Test anda en cada proveedor.
9. Para volver atrás: parar la app, `git checkout <sha anterior de develop> && pnpm install` y restaurar el backup del paso 2 sobre `data/companion.db` (borrando `-wal` / `-shm`).
10. Worktrees de acá en adelante: copiar `data/encryption.key` junto con la base.

## Problemas encontrados

-
