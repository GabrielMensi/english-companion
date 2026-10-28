# Deploy: host, imagen y plan

> Area: Platform · Kind: Research · Status: Decided · Board: #127

Decisión de dónde y cómo correr la app online, dejándola **lista pero sin publicar**. No se despliega nada hasta que se cumpla la checklist de [SECURITY_REVIEW.md](SECURITY_REVIEW.md) (login, límites, CSP, keys cifradas) y el diseño de [AUTH_MULTIUSER.md](AUTH_MULTIUSER.md) esté implementado. Los releases están en [RELEASES.md](RELEASES.md).

## Restricciones de la app

- **SQLite (better-sqlite3) en un archivo**, con migraciones al arrancar: necesita **disco persistente** y **un solo proceso** escribiendo. Vercel/serverless quedan fuera. Mover a Turso/Postgres es una reescritura de `src/db/` y de las queries: no se justifica para unas pocas personas.
- **Estado en memoria** (clasificador en `globalThis`, timers, rate limit de [AUTH_MULTIUSER.md](AUTH_MULTIUSER.md)): una sola instancia siempre encendida (no "scale to zero", no varias réplicas).
- **Kokoro (TTS en el navegador)**: los headers COOP/COEP de `next.config.ts` y `/api/tts/runtime/[file]` (sirve el WASM de ONNX Runtime desde `node_modules`) tienen que seguir andando. Eso implica **que la imagen lleve `node_modules`** y que el proxy no pise los headers.
- Detrás de un reverse proxy con HTTPS: `TRUST_PROXY=true` y `ALLOWED_HOSTS=<dominio>`.

## Host: comparación

Precios aproximados a octubre de 2026; **verificar antes de contratar**.

| Opción                                                           | Costo mensual aprox.             | Disco persistente                               | Operación                                                                                           | Notas                                                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **VPS chico + Docker + Caddy** (Hetzner CX22 / CAX11, o similar) | 4–6 USD, 2 vCPU y 2–4 GB         | El disco de la máquina (+ snapshots opcionales) | Más manual: actualizar el SO, firewall, backups. Una vez armado, un `docker compose pull && up -d`. | Control total, costo fijo, un solo proceso, HTTPS automático con Caddy, backups con un cron.                                                |
| Fly.io (una Machine + volumen)                                   | 5–8 USD (1 GB RAM) + 0,15 USD/GB | Volumen NVMe, atado a una región y una Machine  | Poco: `fly deploy`, TLS incluido                                                                    | No hay free tier para cuentas nuevas. 512 MB se queda corto con Next + transformers; 1 GB mínimo. Un volumen no se comparte entre Machines. |
| Railway                                                          | 5 USD de plan + uso              | Volumen                                         | Poco: deploy desde GitHub                                                                           | Precio por uso (RAM y CPU), menos predecible; volumen y cron de backup propios.                                                             |

### Decisión: VPS chico con Docker Compose y Caddy

- Es lo más barato y predecible, y el disco local es lo que SQLite quiere.
- Una sola máquina = una sola instancia, que es justo lo que el clasificador y el rate limit en memoria necesitan.
- Caddy da HTTPS (Let's Encrypt) y HSTS sin configurar certificados, y reenvía `X-Forwarded-Host` (que `TRUST_PROXY` usa).
- Costo de la decisión: hay que mantener el servidor (actualizaciones de seguridad automáticas con `unattended-upgrades`, firewall, SSH solo con llave). Si eso pesa más que el ahorro, **Fly.io es el plan B** con el mismo Dockerfile: un volumen en `/data`, `fly.toml` con `[mounts]`, `min_machines_running = 1`, `auto_stop_machines = false`, y los mismos pasos de backup (con `fly ssh` o `fly volumes snapshots`).
- El Dockerfile es portable: elegir el host no cambia la app.

Región: la más cercana a los usuarios (la latencia de la IA pesa más que la de la app).

## Imagen: Dockerfile

Archivos a crear (PR del equipo `deploy-ready`): `Dockerfile`, `.dockerignore`, `deploy/compose.yml`, `deploy/Caddyfile`, `deploy/backup.sh`, `deploy/deploy.sh`, `scripts/db-migrate.mts`.

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 compila con node-gyp si no hay binario prearmado.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# `next build` abre la base (importa src/db): una descartable, nunca la real.
ENV NEXT_TELEMETRY_DISABLED=1 DATABASE_PATH=/tmp/build/companion.db
RUN pnpm build && pnpm prune --prod

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 DATABASE_PATH=/data/companion.db
RUN useradd --system --uid 10001 app && mkdir /data && chown app /data
COPY --from=build --chown=app /app/package.json ./
COPY --from=build --chown=app /app/node_modules ./node_modules
COPY --from=build --chown=app /app/.next ./.next
COPY --from=build --chown=app /app/public ./public
COPY --from=build --chown=app /app/drizzle ./drizzle
COPY --from=build --chown=app /app/next.config.ts ./
USER app
VOLUME /data
EXPOSE 3737
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3737/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# 0.0.0.0 dentro del contenedor: solo Caddy lo alcanza (la red de compose no se publica).
CMD ["node_modules/.bin/next", "start", "--port", "3737", "--hostname", "0.0.0.0"]
```

Decisiones y cuidados:

- **Sin `output: "standalone"`**: el runtime de TTS lee archivos de `node_modules` y las migraciones se leen de `./drizzle` con una ruta relativa al directorio de trabajo (`path.resolve("drizzle")` en `src/db/index.ts`); el trazado de standalone no los incluye solo. Más simple y seguro copiar `node_modules` de producción. Revisar el tamaño de la imagen (transformers.js trae onnxruntime); si es un problema, `outputFileTracingIncludes` es el siguiente paso.
- `pnpm-workspace.yaml` va en la copia por los `overrides` y `onlyBuiltDependencies` (solo better-sqlite3 compila).
- `pnpm prune --prod` deja afuera `eslint`, `vitest`, etc. Verificar que `next.config.ts` no necesite una devDependency para cargarse (`typescript` sí la necesita: Next transpila `next.config.ts` con ella; si falla, dejar `typescript` en `dependencies` o compilar la config).
- Usuario no root (`app`), volumen `/data`. Dentro del contenedor el `--hostname 0.0.0.0` es seguro porque el puerto **no se publica** en el host.
- `package.json` fija `--hostname 127.0.0.1` en `pnpm start` (local); la imagen no usa ese script a propósito.
- Etiquetas de la imagen: `ghcr.io/gabrielmensi/english-companion:vX.Y.Z` y `:main` (las genera el workflow de [RELEASES.md](RELEASES.md) cuando se active el deploy).

## Compose y Caddy

`deploy/compose.yml`:

```yaml
services:
  app:
    image: ghcr.io/gabrielmensi/english-companion:${TAG}
    restart: unless-stopped
    env_file: .env.production # chmod 600, fuera de git
    volumes:
      - ./data:/data
    expose: ["3737"]
    networks: [web]
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    networks: [web]
networks:
  web:
volumes:
  caddy_data:
```

`deploy/Caddyfile`:

```
companion.example.com {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		-Server
	}
	request_body {
		max_size 12MB
	}
	reverse_proxy app:3737
}
```

- `max_size 12MB`: por encima del tope de la app (11 MB, `proxyClientMaxBodySize`).
- Caddy conserva el `Host` y manda `X-Forwarded-Host/Proto/For`; la app confía en eso solo con `TRUST_PROXY=true`, y **solo es seguro porque el puerto 3737 no está publicado**.
- Los headers COOP/COEP/CSP los pone Next; Caddy no los toca (verificar con `curl -I` después de levantar).
- HSTS sin `includeSubDomains`/`preload` hasta estar seguro del dominio.
- Firewall del VPS: solo 22 (con llave), 80 y 443.

## Variables de entorno (`.env.production`)

| Variable                                       | Valor en deploy                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `NODE_ENV`                                     | `production` (lo pone la imagen)                                 |
| `DATABASE_PATH`                                | `/data/companion.db` (lo pone la imagen)                         |
| `ALLOWED_HOSTS`                                | `companion.example.com`                                          |
| `TRUST_PROXY`                                  | `true`                                                           |
| `BETTER_AUTH_URL`                              | `https://companion.example.com`                                  |
| `BETTER_AUTH_SECRET`                           | `openssl rand -base64 48`                                        |
| `APP_ENCRYPTION_KEY`                           | `openssl rand -base64 32` (respaldar aparte de la base)          |
| `SIGNUP_ALLOWED_EMAILS`                        | emails de las personas; obligatorio desde el primer arranque     |
| `SHARED_KEYS`                                  | `false` (cada usuario trae sus keys)                             |
| `MIGRATE_ON_START`                             | `false` (las migraciones corren en el paso de deploy, ver abajo) |
| `ENABLE_EVAL`                                  | sin definir (apagado)                                            |
| `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY` | sin definir con `SHARED_KEYS=false`                              |

Todas se validan en `src/lib/env.ts` al arrancar (hoy lo hacen las que existen; las nuevas las agregan sus PRs). `ALLOWED_HOSTS` definido es lo que el código trata como "estamos desplegados": exige `BETTER_AUTH_SECRET` y `APP_ENCRYPTION_KEY`.

### Pendientes del código que esto necesita (equipo `deploy-ready`)

- **`MIGRATE_ON_START`** (default `true`, para no cambiar el uso local): con `false`, `src/db/index.ts` no migra al importar; si hay migraciones pendientes, el arranque falla con un mensaje claro ("run the migrate step"). Así una actualización no migra sola y sin backup.
- **`scripts/db-migrate.mts`** y `pnpm db:migrate`: aplica las migraciones pendientes con la misma función (`migrate` de `src/db/index.ts`, extraída a un módulo que el script y la app comparten) y sale con código distinto de 0 si falla.
- **`GET /api/health`** (se define en la PR de auth): `select 1` y `{ ok: true }`.
- **Puerto de `X-Forwarded-Host` e IPv6 en `ALLOWED_HOSTS`** (item del tablero): `requestHost` hoy compara el host sin puerto y no entiende `[::1]:3737`; con Caddy el `X-Forwarded-Host` suele venir sin puerto, pero hay que cubrir ambos y IPv6 con tests en `allowed-hosts.test.ts`.

## Migraciones como paso del deploy, con backup y permisos

`deploy/deploy.sh <tag>` (corre en el servidor, o por SSH desde el workflow de deploy):

1. `docker compose pull app` con el tag nuevo.
2. **Backup** de la base con el motor de SQLite, no con `cp` (con WAL, `cp` puede copiar un estado inconsistente): `sqlite3 /data/companion.db "VACUUM INTO '/data/backups/pre-<tag>-<fecha>.db'"` o, sin cliente `sqlite3` en el host, `docker compose run --rm app node scripts/backup.mjs` (usa `db.backup()` de better-sqlite3). Permisos `600`; carpeta `700`.
3. **Migrar** con la imagen nueva y la app vieja apagada: `docker compose stop app && docker compose run --rm app pnpm db:migrate` (la imagen necesita `pnpm`/`tsx`, o el script compilado a `.mjs` durante el build; elegir lo segundo para no meter el toolchain).
4. `docker compose up -d app`, esperar el healthcheck, probar `curl -fsS https://companion.example.com/api/health`.
5. Si falla el paso 3 o 4: `docker compose stop app`, restaurar el backup `pre-<tag>` sobre `/data/companion.db` (borrar `-wal` y `-shm`), levantar la imagen **anterior**. Las migraciones son aditivas y van en una transacción: si falla una, no queda aplicada ninguna, pero una que se aplicó y la app nueva anda mal solo se deshace restaurando el backup (por eso el backup es parte del paso, no opcional).
6. Dejar los últimos 14 backups `pre-*`.

Permisos: `src/db/index.ts` ya deja la carpeta `700` y la base y sus `-wal/-shm` `600` al abrir. En el contenedor corre el usuario `app` (uid 10001), dueño de `/data`. Con un bind mount (`./data:/data`) el dueño del directorio del host tiene que ser ese uid: `chown 10001 data && chmod 700 data` en el setup inicial.

## Backups regulares y restauración

- `deploy/backup.sh` por cron cada noche (`VACUUM INTO` a `/data/backups/daily-<fecha>.db`, `600`), conserva 14 diarios y 8 semanales.
- **Fuera de la máquina**: copiar a otro lado con `restic` o `rclone` hacia un bucket (Backblaze B2 / R2, centavos por mes), con la base **y no** la clave de cifrado en el mismo lugar. La clave `APP_ENCRYPTION_KEY` va en un gestor de contraseñas.
- Alternativa más fina: Litestream (replicación continua del WAL a un bucket). Se deja para después; los backups nocturnos alcanzan para este uso.
- **Probar la restauración** una vez antes de depender de esto (restaurar en otra carpeta y abrir con `DATABASE_PATH` apuntando ahí). Un backup sin restaurar nunca es un backup.

## Costos y límites del free tier

- Servidor: 4–6 USD al mes. Bucket de backups: ~0–1 USD.
- La IA es BYOK (cada usuario sus keys de Gemini y Groq gratis): el costo para el dueño es cero, y los límites de cada free tier son de cada persona. Gemini y Groq cambian sus cuotas seguido; la app ya cae al siguiente modelo de la cadena (`fallback.ts`).
- Si se activa `SHARED_KEYS=true`, las cuotas del servidor se reparten entre todos: por eso el tope diario por usuario.
- Dictado: necesita key de Groq; sin ella se desactiva (ver AUTH_MULTIUSER.md).

## Checklist antes de publicar

- [ ] Todo lo de la checklist de SECURITY_REVIEW.md (login, límites, CSP completa, keys cifradas, `pnpm audit`).
- [ ] PRs a, b y c de AUTH_MULTIUSER.md mergeadas, y `pnpm auth:claim-data` corrido sobre la base que se sube (o base nueva).
- [ ] `SIGNUP_ALLOWED_EMAILS` definido (si no, el primero que llega se queda con la instancia).
- [ ] DNS apuntando al VPS; Caddy emitió el certificado; `curl -I` muestra HSTS, COOP/COEP y CSP.
- [ ] Puerto 3737 **no** publicado; firewall con 22/80/443.
- [ ] Backup, restauración y rollback probados una vez.
- [ ] Release `v1.0.0` taggeado según [RELEASES.md](RELEASES.md) y la imagen construida desde ese tag.
- [ ] Kokoro probado en el sitio real (WASM y headers) en GPU y en CPU.
- [ ] `/eval` y `/api/eval/*` dan 404.

## Orden de trabajo (equipo `deploy-ready`, tanda 2)

1. `MIGRATE_ON_START`, `scripts/db-migrate.mts`, `pnpm db:migrate`, `scripts/backup.mjs` (con tests contra una base temporal: backup restaurable, permisos `600`, migración con fixture viejo).
2. Manejo de puerto e IPv6 en `ALLOWED_HOSTS` / `X-Forwarded-Host` (con tests).
3. `Dockerfile`, `.dockerignore`, `deploy/` (compose, Caddyfile, `deploy.sh`, `backup.sh`). Probar `docker build` y `docker run` local con una base copiada **en otra ruta** (nunca `data/companion.db`).
4. Un job en CI que haga `docker build` (sin push) en las PRs que tocan `Dockerfile` o `deploy/`.
5. Workflow de deploy (build y push a GHCR al publicar un release, `ssh` + `deploy.sh`): **se escribe pero queda deshabilitado** (`workflow_dispatch` manual y sin secrets cargados) hasta publicar de verdad.
