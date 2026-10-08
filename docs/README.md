# Docs

Una carpeta por **Area** del tablero ([GitHub Project](https://github.com/users/GabrielMensi/projects/1)). Cada doc empieza con una línea `> Area · Kind · Status · Board` con los mismos valores que el tablero. El tablero lleva el estado; los docs, el detalle.

- **Kind**: Feature, Bug, Research (exploración: el resultado es un doc y una decisión), Eval (medir calidad), Chore.
- **Status**: Exploring, Decided, In progress, Done, Discarded.

| Area | Carpeta | Doc | Kind | Status |
|---|---|---|---|---|
| Chat & corrections | `chat/` | — | | |
| Voice | `voice/` | [VOICE.md](voice/VOICE.md): investigación y plan de voz (dictado, escuchar, pronunciación) | Research | In progress |
| Practice | `practice/` | [VERB_TENSES.md](practice/VERB_TENSES.md): diagnóstico y práctica por tiempo verbal | Feature | Done |
| Progress | `progress/` | [LEVEL_CALIBRATION.md](progress/LEVEL_CALIBRATION.md): calibración del nivel CEFR | Eval | Done |
| Class & textbook | `class/` | [TEXTBOOKS.md](class/TEXTBOOKS.md): resolver los ejercicios de los libros en la app | Research | Exploring |
| AI pipeline | `ai/` | [ERROR_CLASSIFICATION.md](ai/ERROR_CLASSIFICATION.md): clasificación diferida de errores (Kev / Jev) | Research | Done |
| AI pipeline | `ai/` | [LOCAL_MODELS.md](ai/LOCAL_MODELS.md): modelos locales con Ollama, archivados (cómo recuperarlos) | Chore | Done |
| UI/UX | `ui/` | [UI-PLAN.md](ui/UI-PLAN.md): plan de UI "el margen del cuaderno" | Feature | Done |
| Platform | `platform/` | [TESTING.md](platform/TESTING.md): estrategia de tests antes del deploy (capas, CI, plan) | Research | Decided |

[ROADMAP.md](ROADMAP.md) queda en la raíz: lo hecho y lo próximo, de todas las áreas.

## Reglas

- Un doc nuevo va en la carpeta de su Area, con la línea de cabecera. Si no tiene carpeta todavía, se crea.
- El Area es donde lo ve el usuario (el panel de pronunciación del dashboard es Progress). AI pipeline es solo para lo que cruza features: providers, prompts, elección de modelo, el clasificador.
- Al cambiar el estado de un doc, actualizar la cabecera y esta tabla.
