# Roadmap

## Hecho (v0.1)

- Chat por sesiones (modos corrección y conversación) con historial en SQLite.
- Corrección estructurada: diff, errores con categoría fija, gravedad y explicación.
- Tolerancia a typos (gravedad `typo`, excluida de las estadísticas por defecto).
- "Cómo lo diría un nativo" y escape al español con `[corchetes]` → vocabulario.
- Convertir un mensaje corregido en prompt estructurado.
- Dashboard: errores cada 100 palabras, evolución, áreas a trabajar, tendencias, errores frecuentes.
- Providers: Ollama (local), Gemini y Groq (free tier), con API keys y URL de Ollama configurables desde la app.
- Set de evaluación de modelos (`pnpm eval:models`) y timeouts por request.
- Selector de modelo en el chat, modelo registrado en cada respuesta y fallback automático entre modelos configurados.

## Próximo

### Repaso espaciado de tus errores
Flashcards generadas desde tus correcciones reales (el original como pregunta, la corrección como respuesta), con un algoritmo tipo SM-2. Se guarda el estado de cada tarjeta en una tabla `reviews`.

### Ejercicios dirigidos
A partir de las 3 categorías más flojas del dashboard, generar ejercicios cortos: completar huecos, reescribir oraciones o elegir la opción correcta. La respuesta del usuario también se corrige y suma a las estadísticas.

### Reporte semanal / plan de estudio
La IA lee las estadísticas de la semana (categorías, tendencias, errores frecuentes, vocabulario) y arma un plan concreto: qué temas practicar, con qué tipo de ejercicios y ejemplos.

### Streaming de la corrección
Mostrar la corrección a medida que se genera (`streamText` + `Output.object`) para que los modelos locales se sientan más rápidos.

## Ideas a futuro

### Claude Code como paso intermedio
Objetivo: escribir el prompt una sola vez, en inglés, directamente en Claude Code, y obtener igual todo el beneficio de la app.

Flujo:
1. Escribo el prompt en Claude Code.
2. Un hook `UserPromptSubmit` manda el texto a un endpoint de la app (p. ej. `POST /api/correct`), que lo corrige y lo guarda en las estadísticas como cualquier mensaje (en una sesión "Claude Code").
3. El hook devuelve el prompt corregido como `additionalContext`, así Claude trabaja con la versión corregida.
4. La corrección (diff y errores principales) se muestra en el chat de Claude Code vía `systemMessage`.

Consideraciones:
- Tiene que ser rápido: con un modelo local conviene un timeout corto y, si la app no responde, dejar pasar el prompt original sin bloquear.
- Ignorar prompts en español o muy cortos (comandos, "sí", "dale").
- El endpoint sería el mismo análisis que usa el chat, sin la UI.

### Otras
- Voz: dictado con Whisper local para practicar speaking y pronunciación.
- Exportar/importar la base de datos para mover el historial entre PCs. El export tiene que excluir la fila `api-keys` de `settings`, para no compartir keys por accidente.
- Nivel estimado (CEFR) según la evolución de errores y el vocabulario usado.
