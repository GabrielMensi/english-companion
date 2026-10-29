# Docs

Una carpeta por **Area** del tablero ([GitHub Project](https://github.com/users/GabrielMensi/projects/1)). Cada doc empieza con una línea `> Area · Kind · Status · Board` con los mismos valores que el tablero. El tablero lleva el estado; los docs, el detalle.

- **Kind**: Feature, Bug, Research (exploración: el resultado es un doc y una decisión), Eval (medir calidad), Chore.
- **Status**: Exploring, Decided, In progress, Done, Discarded.

| Area               | Carpeta     | Doc                                                                                                                                                                  | Kind     | Status      |
| ------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| Chat & corrections | `chat/`     | —                                                                                                                                                                    |          |             |
| Voice              | `voice/`    | [VOICE.md](voice/VOICE.md): investigación y plan de voz (dictado, escuchar, pronunciación)                                                                           | Research | In progress |
| Voice              | `voice/`    | [PRONUNCIATION_AUDIO.md](voice/PRONUNCIATION_AUDIO.md): schwa, acento de palabra y acento desde el audio (Gemini vs wav2vec2); chequeo de sonidos beta en Read aloud | Research | In progress |
| Practice           | `practice/` | [VERB_TENSES.md](practice/VERB_TENSES.md): diagnóstico y práctica por tiempo verbal                                                                                  | Feature  | Done        |
| Progress           | `progress/` | [LEVEL_CALIBRATION.md](progress/LEVEL_CALIBRATION.md): calibración del nivel CEFR                                                                                    | Eval     | Done        |
| Class & textbook   | `class/`    | [TEXTBOOKS.md](class/TEXTBOOKS.md): resolver los ejercicios de los libros en la app                                                                                  | Research | Exploring   |
| AI pipeline        | `ai/`       | [ERROR_CLASSIFICATION.md](ai/ERROR_CLASSIFICATION.md): clasificación diferida de errores (Kev / Jev)                                                                 | Research | Done        |
| AI pipeline        | `ai/`       | [TOPIC_EVAL.md](ai/TOPIC_EVAL.md): correcciones en chats de tema y role-play, y correcciones descartadas como ejemplos de eval                                       | Eval     | In progress |
| AI pipeline        | `ai/`       | [LOCAL_MODELS.md](ai/LOCAL_MODELS.md): modelos locales con Ollama, archivados (cómo recuperarlos)                                                                    | Chore    | Done        |
| UI/UX              | `ui/`       | [UI-PLAN.md](ui/UI-PLAN.md): plan de UI "el margen del cuaderno"                                                                                                     | Feature  | Done        |
| Platform           | `platform/` | [CODE_QUALITY.md](platform/CODE_QUALITY.md): revisión de calidad de código y las reglas (lint, formato, knip)                                                        | Chore    | Done        |
| Platform           | `platform/` | [SECURITY_REVIEW.md](platform/SECURITY_REVIEW.md): revisión de seguridad antes de desplegar, arreglos y checklist                                                    | Chore    | Done        |
| Platform           | `platform/` | [TESTING.md](platform/TESTING.md): estrategia de tests antes del deploy (capas, CI, plan)                                                                            | Research | Decided     |
| Platform           | `platform/` | [AUTH_MULTIUSER.md](platform/AUTH_MULTIUSER.md): login (Better Auth), multiusuario y API keys por usuario cifradas, con plan por PR                                  | Research | In progress |
| Platform           | `platform/` | [DEPLOY.md](platform/DEPLOY.md): host (VPS + Docker + Caddy), Dockerfile, migraciones con backup y checklist de deploy; listo, sin publicar                          | Research | In progress |
| Platform           | `platform/` | [RELEASES.md](platform/RELEASES.md): ramas, SemVer, tags, GitHub Releases y workflow de release                                                                      | Chore    | In progress |
| Platform           | `platform/` | [BACKLOG_RUN.md](platform/BACKLOG_RUN.md): plan y estado de la corrida que cierra el backlog                                                                         | Chore    | In progress |
| Platform           | `platform/` | [BACKLOG_MANUAL_TESTS.md](platform/BACKLOG_MANUAL_TESTS.md): qué probar a mano antes de mergear la corrida                                                           | Eval     | In progress |

[ROADMAP.md](ROADMAP.md) queda en la raíz: lo hecho y lo próximo, de todas las áreas.

## Reglas

- Un doc nuevo va en la carpeta de su Area, con la línea de cabecera. Si no tiene carpeta todavía, se crea.
- El Area es donde lo ve el usuario (el panel de pronunciación del dashboard es Progress). AI pipeline es solo para lo que cruza features: providers, prompts, elección de modelo, el clasificador.
- Al cambiar el estado de un doc, actualizar la cabecera y esta tabla.
