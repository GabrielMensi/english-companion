# Backlog run: prueba manual

> Area: Platform · Kind: Eval · Status: In progress · Board: #111–#128 y siguientes

Lo que queda por probar a mano de la corrida del backlog (mergeada en `develop` en #175). Lo ya probado se sacó de esta lista el 2026-10-29; los problemas encontrados pasaron al board (ver abajo). Plan y estado del trabajo en [BACKLOG_RUN.md](BACKLOG_RUN.md).

## Dónde probar

- Lo que solo mira o usa la app normal: en tu app de siempre (`develop`, [https://localhost:3737](https://localhost:3737)).
- Lo que necesita una segunda cuenta, `SHARED_KEYS=false`, importar datos o borrar cosas: en un worktree con una copia de la base (pasos en `CLAUDE.md`, "The app is always in use"), nunca sobre `data/companion.db`.

Marcá `[x]` lo que funciona y anotá abajo lo que no.

## Pendiente

### Dashboard y Today (#130)

- [ ] Dashboard: "Retry" en el aviso de clasificación sigue reintentando y refrescando.
- [ ] Today: los totales de la semana y la fila de pronunciación se ven igual.

### Decisiones de diseño (#131)

- [ ] Leer `docs/platform/AUTH_MULTIUSER.md`, `DEPLOY.md` y `RELEASES.md` y confirmar las decisiones: registro cerrado con lista de emails permitidos (`SIGNUP_ALLOWED_EMAILS`; vacía = solo la primera cuenta), VPS + Docker + Caddy (revisar los precios en DEPLOY.md, se estimaron), sin archivo CHANGELOG.

### Arreglos de IA (#141)

- [ ] Descartar un error, marcar otro como typo a mano, cambiar el tipo de otro con "Wrong type?" y reintentar el mensaje: las marcas quedan en las correcciones que coinciden (el descarte solo si la nueva corrección es la misma). Para forzarlo: reintentá un mensaje con varios errores claros (p. ej. "Yesterday I go to the store and buyed three apple"); la IA suele devolver los mismos.
- [ ] Opcional (gasta un poco de cuota): `pnpm eval:models <spec> --limit=2 --check` muestra PASS/FAIL.

### Listo para deploy (#144)

- [ ] [https://localhost:3737/api/health](https://localhost:3737/api/health) devuelve `{"ok":true}`.
- [ ] `pnpm db:backup` crea un backup en `data/backups/` (es la única operación permitida sobre `data/companion.db`: solo lectura).
- [ ] Opcional, si instalás Docker: los comandos de "Probar la imagen" en `docs/platform/DEPLOY.md` (base descartable). Está en el board como tarea antes del deploy.
- [ ] Leer la guía "Cómo desplegar" en DEPLOY.md. No se publicó nada; el workflow de deploy está apagado.

### Login (#148)

- [ ] Sin cookie, `curl -sk https://localhost:3737/api/sessions` da 401; `curl -sk https://localhost:3737/api/health` da `{"ok":true}`.
- [ ] La app de 3737 y la de un worktree tienen sesiones separadas (entrar en una no te saca de la otra).

### Evals (#150)

- [ ] Opcional (pocas llamadas): `pnpm eval:models gemini:gemini-flash-lite-latest --with-discards`: aparece la columna `repeatedDiscards` y la terminal muestra `discard #n`, no tu texto.
- [ ] `pnpm eval:models <spec> --topics-only --check` se niega a correr.

### E2E y CSP (#164)

- [ ] `pnpm test:e2e`: construye la app y pasa 10/10 sin tocar `data/`.
- [ ] `AI_FAKE=1 pnpm dev` (sin `E2E_TEST_SERVER`, o con la base real) se niega a arrancar.
- [ ] Después del merge a `main`: Actions → "E2E" → Run workflow: verde. La corrida nocturna prueba `develop`.
- [ ] En /settings (y en general): sin errores "Content Security Policy" en la consola.

### Ventana flotante (#154)

- [ ] Sin red → Save en "Wrong type?": el error aparece dentro del diálogo.

### Clases (#158–#160, #169, #173)

Para el paso de la IA hace falta una API key. Lo de borrar e importar, en un worktree.

- [ ] En el reporte, "Use these dates" con otras fechas y "Since a class" cambian el período. **Print / save as PDF**: la vista previa no tiene la barra lateral y todo el texto entra; **Copy as Markdown** y **Download .md** traen el mismo contenido.
- [ ] En la clase → **Load the teacher's corrections**: pegá `I have went → I went`, `I'm agree → I agree` y `depend of → depend on`, más `New word: bucket list`. **Structure with AI** muestra los errores con su categoría y la palabra con su traducción; quitá uno con la X y guardá con "Save as From class" (sin API key el botón está deshabilitado y explica por qué).
- [ ] La clase lista lo cargado con el badge **From class**. En el Dashboard (categoría → lista de errores) y en Vocabulary aparece el badge; en Flashcards → errores están las tarjetas nuevas (sin ícono de chat). Los números de esas categorías subieron, pero el "errors per 100 words" no cambia y nada aparece en "Written".
- [ ] Esos errores NO aparecen en el reporte para llevar a clase. Borrar la clase borra también lo cargado.
- [ ] Insights → Estimated level: debajo de la estimación dice "Your teacher's level on …: B1" y cuántos niveles de diferencia hay.
- [ ] El chat oculto de la clase no aparece en la barra lateral.
- [ ] Descartá un error "From class" (Dashboard) y abrí Discarded: su link dice "Open class" y va a /class.
- [ ] Today: "wrote this week" no cuenta lo cargado de una clase (con una semana sin escribir y una clase cargada, Today sigue pidiendo escribir).
- [ ] Exportar desde una cuenta con una clase cargada e importar en una segunda cuenta: /class muestra la clase con fecha, nivel del profesor, notas, correcciones y palabras, y las estadísticas de clase coinciden.

### Errores descartados (#166)

- [ ] Una segunda cuenta ve solo sus propios descartes.

### Chats de tema (#167)

Usa algunas llamadas reales a la IA.

- [ ] "Talk about…" → "Also practice": Present perfect → entrevista: las preguntas del tutor tiran al present perfect sin nombrarlo. Cambiar o sacar el tiempo desde el header: la respuesta siguiente lo sigue y queda guardado al recargar.
- [ ] Responder 3–4 preguntas con errores → Feedback: cada frase citada y cada error son cosas que escribiste; nada inventado (empresas, números, detalles); las frases en español con ¡…! y los nombres de tiempos verbales quedan. Al recargar sigue ahí; "Write it again" lo regenera. Con menos de 2 respuestas, Feedback está deshabilitado.
- [ ] Phrases: aparecen sugerencias tildadas; destildar una y guardar; /vocabulary las muestra con link al chat; dos con el mismo significado se ven las dos; volver a Phrases no repite las guardadas.
- [ ] En un chat normal estos botones no aparecen. A ~400px de ancho el header se acomoda sin desbordarse.

### API keys por usuario y exportar/importar (#168)

- [ ] Settings: tus cards de Gemini y Groq dicen "API key set" con los 4 últimos caracteres de tus keys nuevas y Test funciona. Existe `data/encryption.key` (permisos 600).
- [ ] Cambiar o borrar una key y recargar: queda guardada y enmascarada.
- [ ] En un worktree, con `SHARED_KEYS=false` en `.env.local` (y sin keys en el env), una segunda cuenta (en la allowlist) ve el aviso de "sin key", no puede chatear ni dictar y no ve ninguna de tus keys.
- [ ] Exportar desde tu cuenta: el archivo no tiene `AIza`/`gsk` ni `api-keys`. Importarlo en la segunda cuenta: aparecen sus chats, errores y flashcards (los chats de tema conservan tema y tiempo verbal); importarlo de nuevo no agrega nada.

### Varios (#172)

- [ ] `pnpm dev` sigue validando las variables de entorno al arrancar (un valor inválido en `.env.local` lo frena con un mensaje claro).

## Problemas encontrados (pasados al board)

- #176: `pnpm auth:reset-password` no cerró la sesión abierta (probable caché de cookie de 5 minutos).
- #177: en Practice, la lista de respuestas de un ejercicio se corrige como texto suelto y marca errores falsos (chat `69f00159…`).
- Draft "Corrections on text that isn't the learner's": un lorem ipsum vuelve sin errores ni aviso, y un texto de Wikipedia recibe un falso positivo (chat `9f04a227…`).
- Draft "Most frequent mistakes: Open chat link on each example": el link "Open chat" solo está en Discarded.
- Draft "Kokoro on WebGPU: ONNX session options": Device = GPU sigue sin andar en la RX 9070 XT; el diagnóstico (audio check passed en webgpu/fp32) quedó en el draft.
- El límite por minuto de Groq no se pudo forzar a mano (las respuestas tardan demasiado): queda cubierto por los tests.
