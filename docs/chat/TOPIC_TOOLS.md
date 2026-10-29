# Herramientas de los chats de tema

> Chat & corrections · Feature · Done · [#161](https://github.com/GabrielMensi/english-companion/issues/161), [#162](https://github.com/GabrielMensi/english-companion/issues/162), [#163](https://github.com/GabrielMensi/english-companion/issues/163)

Tres extras de los chats "Talk about…" (#71). Aparecen en el encabezado del chat, solo en chats de tema.

## Feedback al final (#161)

- Botón **Feedback**: escribe una revisión (qué salió bien, errores que volvieron, respuestas más fuertes) y la guarda por chat en `user_settings` (`feedback:<chat id>`). Se puede reescribir con los mensajes nuevos.
- El modelo recibe solo datos reales: tus mensajes (hasta 30), la pregunta del tutor que cada uno respondió, la versión nativa y los errores guardados que cuentan en las estadísticas (`countsInStats`). Pide al menos 2 mensajes.
- Anti-invención (Groq inventó un detalle en la prueba de #71): las citas (`example`, `answer`) tienen que estar textualmente en tus mensajes o en los errores guardados; las que no están se descartan (`normalizeFeedback`). Los errores que vuelven se piden solo si aparecen 2 veces.
- Esquema plano (`feedbackSchema`), detrás de `withFallback` y con `withChatPriority`. Texto en el idioma de explicación; citas en inglés.

## Tiempo verbal en un chat de tema (#162)

- Selector en el diálogo "Talk about…" ("Also practice") y en el encabezado del chat (se puede cambiar o quitar después, `PATCH /api/sessions/:id` con `tense`).
- Se guarda en la entrada `practice:<chat id>` (campo opcional `tense`; los chats viejos no lo tienen). La regla `topicTenseRule` se suma a la del tema: la pregunta final pide el tiempo sin nombrarlo. Conteo y estadísticas de tiempos no cambian.

## Frases al Vocabulario (#163)

- Botón **Phrases**: el modelo elige hasta 8 frases de las respuestas del tutor y de las versiones nativas de tus mensajes; las que no están textualmente en esos textos se descartan y no se repiten las que ya están en el Vocabulario (`normalizePhrases`).
- Nada se guarda hasta que marcás cuáles (diálogo con casillas). Se guardan como entradas de `vocabulary` (español = significado, inglés = frase, nota = el chat de tema) apuntando al mensaje de origen, así que se ven en la página y en las tarjetas sin cambios de esquema.
