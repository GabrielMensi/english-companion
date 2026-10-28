# Flujo de releases

> Area: Platform · Kind: Chore · Status: In progress · Board: #128

Reglas de ramas, versiones, tags y releases para cuando la app sea desplegable. Hoy no hay deploy: el flujo está listo y el primer release real es `v1.0.0` (el primer deploy). Ver [DEPLOY.md](DEPLOY.md).

## Ramas

| Rama                        | Qué es                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`                      | Lo **publicado**: cada commit es un release (o un hotfix de uno). Lo que corre desplegado sale de un tag sobre `main`. Protegida, solo entra por PR. |
| `develop`                   | **Integración**: donde se juntan las features y de donde sale el próximo release. Es lo que el usuario corre localmente. Protegida.                  |
| `feat/*`, `fix/*`, `team/*` | Trabajo en curso, se mergean a `develop` por PR (o a una rama `integration/*` en una corrida grande).                                                |
| `archive/<tema>` (tags)     | Ver abajo.                                                                                                                                           |

- **Cuándo se mergea `develop` en `main`**: cuando hay algo que publicar y `develop` está verde y probado a mano. Con una PR "Release vX.Y.Z" de `develop` a `main` (merge commit, no squash, para conservar la historia).
- **Hotfix**: rama desde `main` (`fix/...`), PR a `main`, tag de patch, y se mergea `main` de vuelta en `develop` para que no diverjan.
- Antes del primer release: `main` solo recibe docs; la PR "Release v0.2.0" la pone al día.

## Versionado (SemVer)

`package.json` está en `0.1.0`. Se usa **SemVer `MAJOR.MINOR.PATCH`**, tag `vX.Y.Z`.

- **Antes del primer deploy (0.x)**: MINOR = una tanda de features o cualquier cambio de esquema; PATCH = arreglos. Cualquier cosa puede cambiar entre MINOR.
- **`1.0.0` = el primer deploy público**.
- **Desde 1.0.0**:
  - **MAJOR**: un cambio que obliga al operador o a los usuarios a hacer algo a mano: variable de entorno nueva obligatoria o renombrada, un formato de export/import incompatible, una migración que no se puede revertir restaurando un backup sin perder datos, un paso manual de datos (como `auth:claim-data`).
  - **MINOR**: feature nueva o cambio visible para el usuario, y migraciones aditivas.
  - **PATCH**: arreglos, copy, dependencias, docs.
- **Prereleases**: `v1.1.0-rc.1` para probar en el servidor antes de publicar. No exigen estar en `main` y GitHub los marca como _pre-release_.
- Las migraciones solo avanzan: **volver a una versión anterior requiere restaurar el backup previo** (DEPLOY.md). Por eso el backup es parte de cada deploy.
- CalVer se descartó: no hay un calendario de releases, y SemVer dice si el update es riesgoso.

## Tags

- **Release**: tag **anotado** `vX.Y.Z` sobre el commit de merge en `main`: `git tag -a vX.Y.Z -m "vX.Y.Z"`. El workflow rechaza los tags livianos.
- **Archivo**: `archive/<tema>` preserva trabajo que se quitó de `main` pero puede volver (ya existe `archive/local-models-ollama`, de #72, que ya sigue la convención). Se crea anotado con el motivo, y el doc del tema (por ejemplo `docs/ai/LOCAL_MODELS.md`) explica cómo recuperarlo. Nunca empiezan con `v`, así que no disparan releases.
- No se mueven ni se borran tags publicados: si un release salió mal, se publica el patch siguiente.

## Cómo se publica un release

1. En `develop`, todo lo que va está mergeado; `pnpm typecheck && pnpm lint && pnpm test && pnpm format:check && pnpm knip` y `pnpm build` verdes (CI lo hace en la PR).
2. Rama `release/vX.Y.Z` desde `develop`: sube la versión con `npm version X.Y.Z --no-git-tag-version` (cambia `package.json`; `pnpm-lock.yaml` no lleva la versión del proyecto). Actualiza "Hecho" de `docs/ROADMAP.md`. Commit "Release vX.Y.Z".
3. PR `release/vX.Y.Z` → `develop` (rápida), después PR `develop` → `main`. La descripción de la PR de release lista las migraciones nuevas y los pasos manuales (variables nuevas, comandos), porque es lo que lee quien despliega.
4. Con el merge en `main`: `git checkout main && git pull && git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.
5. El workflow `release.yml` corre solo: valida el tag (formato, anotado, igual a `package.json`, y en `main` si no es prerelease), corre **los mismos chequeos que CI** (`ci.yml` reusado) y crea el GitHub Release con las notas generadas. Si algo falla, no hay release: se corrige y se vuelve a tagear (borrar el tag que nunca se publicó es la excepción a la regla de arriba).
6. Cuando exista el deploy, un workflow aparte (deshabilitado hasta entonces) construye la imagen desde el tag.

## Notas del release y changelog

- **No hay `CHANGELOG.md`**: el GitHub Release es el changelog (notas generadas de las PRs mergeadas desde el tag anterior); mantener un archivo duplicaría eso y se desactualizaría. Lo hecho a nivel producto sigue en `docs/ROADMAP.md`.
- `.github/release.yml` agrupa las notas por label de la PR: `feature`, `bug`, `security`, `chore`/`dependencies`, `research`/`eval`; sin label cae en "Other changes", así que nunca queda vacío. `skip-changelog` oculta una PR; los PRs de Dependabot se excluyen.
- Los labels se crean una vez en el repo (`gh label create feature` etc.); el tablero sigue siendo la fuente de _Kind_ y _Area_, los labels de PR solo sirven para agrupar notas. La plantilla de PR (`.github/pull_request_template.md`) recuerda ponerlo.

## Commits y PRs

- **Sin Conventional Commits**: los commits son frases cortas en inglés en imperativo ("Mark mistakes the corrected text forgot to fix"), como hasta ahora. El título de la PR es lo que aparece en las notas, así que tiene que leerse solo.
- Cada PR lleva `Closes #N` (cierra el issue al mergear en `main`), el label de _Kind_ y la sección _Manual test_ (plantilla de PR).
- Los commits terminan con la línea `Co-Authored-By` de la sesión que los hizo.

## Automatización que ya existe

- `.github/workflows/ci.yml`: typecheck, lint, test, knip, format y build en cada PR a `develop`/`main`/`integration/**` y en cada push a `develop`/`main`; también se llama desde `release.yml`.
- `.github/workflows/gitleaks.yml`, `codeql.yml` (CodeQL solo con `CODEQL_ENABLED=true`) y `.github/dependabot.yml` (semanal, apunta a `develop`).
- Branch protection en `develop` y `main` con los chequeos requeridos.
- `.github/workflows/release.yml` (nuevo, #128): ver arriba. Probarlo: con un tag de prueba `v0.0.0-rc.1` en un fork, o revisarlo con `actionlint` antes del primer tag real.

## Pendiente

- Crear los labels del repo (`feature`, `bug`, `security`, `chore`, `research`, `eval`, `skip-changelog`).
- Primer release: `v0.2.0` cuando se mergee la corrida del backlog a `develop` y de ahí a `main` (pone `main` al día), y `v1.0.0` con el primer deploy.
- Workflow de deploy por tag (con DEPLOY.md).
- Ruleset del repo sobre los tags `v*` (restringir update y delete), para que "no se mueven ni se borran tags publicados" lo haga cumplir GitHub y no solo esta regla.
- La plantilla de PR pide labels de _Kind_ que todavía no existen (salvo `bug`): crearlos antes de la primera PR de release.
