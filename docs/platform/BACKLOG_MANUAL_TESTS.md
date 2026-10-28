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

## Problemas encontrados

-
