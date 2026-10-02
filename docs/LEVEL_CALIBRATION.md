# Calibración del nivel CEFR estimado

El nivel de **Insights** sale de reglas fijas en `src/lib/insights/level-core.ts`: cuatro señales (precisión, vocabulario, complejidad de las oraciones y rango de tiempos verbales) que se pasan a un puntaje de 1 (A1) a 6 (C2) con puntos de anclaje fijos, y se promedian con pesos. Al principio esos anclajes y pesos eran aproximaciones (precisión 40 %, el resto 20 % cada una). Este documento cuenta cómo se contrastaron con textos de alumnos calificados por humanos (issue #37) y qué cambió.

## Datos

**Cambridge English Write & Improve + LOCNESS** (release BEA-2019, v2.1): <https://www.cl.cam.ac.uk/research/nl/bea2019st/>

- 3.300 textos de alumnos de inglés (cartas, ensayos, historias, respuestas a consignas) con un **nivel CEFR asignado por evaluadores de Cambridge**, de A1.i a C2.ii, y **todas las correcciones** marcadas a mano. Más 50 ensayos de nativos (LOCNESS) como referencia.
- Licencia: uso **no comercial, de investigación y educativo**; no se puede redistribuir (LOCNESS pide autorización para pasarlo a terceros). Usarlo localmente para calibrar una app personal entra en eso, pero **no está en el repo**: se descarga en `data/` (ignorado por git):

  ```bash
  mkdir -p data/cefr && curl -L https://www.cl.cam.ac.uk/research/nl/bea2019st/data/wi+locness_v2.1.bea19.tar.gz | tar xz -C data/cefr
  ```

- Cita: Yannakoudakis, Andersen, Geranpayeh, Briscoe y Nicholls (2018). *Developing an automated writing placement system for ESL learners*. Applied Measurement in Education 31:3.

Se eligió porque es el único corpus abierto (sin registro) que tiene **las dos cosas** que necesita el estimador: nivel CEFR por texto y los errores marcados. EFCAMDAT, ICNALE y el Write & Improve 2024 completo piden registro o acuerdo de uso; ELLIPSE tiene puntajes holísticos 1–5, no niveles CEFR; CEFR-SP y los textos "levelled" de Kaggle son textos de lectura, no escritura de alumnos.

## Método

`pnpm eval:level` (`scripts/eval/level.mts` y `level-data.ts`):

1. **Alumnos simulados.** El estimador necesita al menos 300 palabras y en la app suele ver entre 1.000 y 3.000. Un texto del corpus tiene 65 (A1) a 270 (C2) palabras, así que se juntan textos del mismo nivel, ordenados por usuario (en general son del mismo alumno), en bloques de ~1.000 palabras (`--words=300` y `--words=3000` para los otros tamaños). Cada bloque se estima igual que en la app: un mensaje por texto, tiempos verbales contados sobre el texto corregido.
2. **Errores.** Las correcciones del corpus se clasifican como lo haría la app: si solo cambian puntuación, espacios o mayúsculas son *sugerencias* (casi siempre comas opcionales); una palabra cambiada por otra muy parecida que no es una flexión ("resaon" → "reason") es *typo*; el resto cuenta como error.
3. **Puente con la IA de la app.** Los anotadores de Cambridge corrigen más que la IA de la app (también corrigen estilo y fluidez). Para medir la diferencia, `pnpm eval:level --analyze=gemini:gemini-flash-lite-latest --limit=30` pasa 30 textos (5 por nivel, del split *dev*) por el análisis real de la app y compara: **la app cuenta 0,6 de los errores** que cuenta el corpus, y esa proporción es estable en todos los niveles (0,52–0,70). El eval usa ese 0,6 (`--app-ratio`) para que las tasas estén en la escala de la app. Los resultados de la IA quedan en caché en `.eval-results/level-analysis-cache.json`.
4. **Ajuste en *train*, medición en *dev*.** Los anclajes se sacaron de las medianas por nivel del split *train* (495 alumnos de 1.000 palabras); los pesos, de una búsqueda en grilla sobre *train*, eligiendo una opción conservadora (ver abajo). *Dev* (46 alumnos + 17 nativos) no se usó para ajustar y es el número honesto. Se reporta acuerdo exacto, acuerdo ±1 nivel, error medio, sesgo y matriz de confusión.

## Qué mostró la evidencia

Correlación de rango (Spearman) de cada señal con el nivel humano, en alumnos de 1.000 palabras:

| Señal | Spearman | Conclusión |
|---|---|---|
| Precisión (errores cada 100 palabras) | **0,92** | La mejor señal por lejos. |
| Vocabulario (MATTR + palabras largas) | 0,52 | Ayuda, con rangos chicos entre niveles. |
| Complejidad (palabras por oración + conectores) | 0,05 | No separa niveles: los A1 casi no puntúan, así que sus "oraciones" son largas. |
| Rango de tiempos verbales | 0,10 | No separa niveles: la consigna decide los tiempos, y todos usan más o menos los mismos. |

Medianas por nivel en *train* (errores en escala de la app, ×0,6):

| | A1 | A2 | B1 | B2 | C1 | C2 |
|---|---|---|---|---|---|---|
| Errores / 100 palabras | 8,2 | 7,4 | 5,7 | 4,0 | 2,6 | 1,5 |
| Palabras distintas (MATTR) | 0,772 | 0,781 | 0,787 | 0,798 | 0,796 | 0,799 |
| Palabras de 7+ letras | 17 % | 18 % | 19 % | 19 % | 21 % | 21 % |
| Palabras por oración | 14,8 | 16,9 | 16,4 | 16,5 | 16,9 | 16,7 |

Los anclajes viejos de errores (20, 13, 8, 4,5, 2,2, 1) eran demasiado exigentes abajo (nadie llegaba a A1) y todo terminaba en B1–B2; los de vocabulario (MATTR 0,55–0,82) ponían a todos en C1–C2.

## Cambios

- **Anclajes de errores**: las medianas de arriba, `[8.2, 7.4, 5.7, 4, 2.6, 1.5]`.
- **Anclajes de vocabulario**: recta ajustada por nivel (MATTR `0.774…0.804`, palabras largas `0.17…0.215`). El valor ahora se muestra con un decimal, porque un nivel son ~0,6 puntos de MATTR.
- **Pesos**: precisión 65 %, vocabulario 25 %, complejidad 10 %, tiempos verbales 0 % (se sigue mostrando como contexto: "Context" en la tabla, y la IA lo recibe como "not scored"). La grilla daba algo mejor con precisión 80 %, pero en la app los errores los cuenta la IA, con más ruido que un anotador: simulando ese ruido, 65/25/10 aguanta igual o mejor, y depende menos de una sola señal.
- **Dictado**:
  - La complejidad se mide solo en mensajes escritos (en los dictados, la puntuación y por lo tanto el largo de las oraciones lo decide el speech-to-text) y su peso se escala por la proporción de palabras escritas: con todo dictado, pesa 0.
  - Los mensajes dictados no cuentan las categorías que el transcriptor decide u oculta (`NOT_MEASURABLE_WHEN_SPOKEN`), y en los 30 textos analizados esas categorías eran **la mitad** de los errores (126 de 252). Sin compensarlo, hablar parecía un nivel mejor que escribir; ahora cada error contado en un mensaje dictado vale 2 (`SPOKEN_MISTAKE_FACTOR`). Sigue usando `countsInStats`: no se cuentan esas categorías, se extrapola.
- **Chat informal**: la complejidad (la señal que más depende del registro: chat y prompts usan oraciones más cortas y menos conectores que un ensayo) pasó de 20 % a 10 %, y no cuenta los mensajes de menos de 6 palabras ("ok, go ahead"). Tiempos verbales, también sensible a la tarea, ya no puntúa.
- **Rango y confianza**: el error del puntaje en el eval es 0,85 / 0,6 / 0,45 niveles con 300 / 1.000 / 3.000 palabras, con errores contados por humanos. El rango mostrado pasó a ±1 / ±0,75 / ±0,5 (antes ±1 / ±0,6 / ±0,35) para dejar margen a la IA y al registro.
- **Nota de la UI**: dice que las reglas se contrastaron con ensayos calificados por Cambridge, cuánto coinciden y que en la app hay que esperar más o menos un nivel de error.

## Resultados

Split *dev* (no usado para ajustar), errores en escala de la app:

| Palabras por alumno | Antes: exacto / ±1 / error medio | Después: exacto / ±1 / error medio |
|---|---|---|
| 300 (134 alumnos) | 23 % / 75 % / 1,04 | **40 % / 93 % / 0,66** |
| 1.000 (46 alumnos) | 20 % / 74 % / 1,07 | **59 % / 100 % / 0,41** |
| 3.000 (16 alumnos) | 19 % / 75 % / 1,06 | **81 % / 100 % / 0,19** |

En *train* (1.000 palabras): 23 % / 76 % antes, 62 % / 97 % después. Antes, casi todo caía en B1 o B2 (A2 → B2, C1 → B2); ahora la matriz es diagonal, con los errores en niveles vecinos. Los nativos de LOCNESS salen C1 o C2. Con todo dictado (`--spoken`, que simula que la mitad de los errores no se cuentan) da 59 % / 98 %.

## Límites

- **Ensayos, no chat.** Los textos son respuestas a consignas de examen. Tus mensajes son prompts y charla: más cortos, más técnicos, otro registro. No hay corpus CEFR de chat, así que no se puede medir cuánto cambia; se bajó el peso de lo que más depende del registro, pero la precisión también puede variar (en un prompt se escribe rápido).
- **Los errores de la app los cuenta la IA.** El puente (0,6) sale de 30 textos y un modelo (gemini-flash-lite); otro modelo de la cadena (Groq, Ollama) puede contar más o menos. Vale repetir `--analyze` si cambia el modelo principal.
- **El factor de dictado sale de texto escrito.** Al hablar, la mezcla de errores puede ser distinta; 2 es una aproximación.
- **Niveles de Write & Improve.** Los asignan evaluadores de Cambridge para la plataforma, no son exámenes oficiales; A1 tiene pocos textos y muy cortos.
- **Señales flojas.** Con tan poca diferencia entre niveles, A1 vs A2 se distingue mal (en A1 los errores por palabra no suben más que en A2) y C1 vs C2 también.
- **Alumnos simulados.** Los bloques juntan textos de un mismo nivel; cuando un alumno no llega a 1.000 palabras, se completa con otro.

## Cómo repetirlo

```bash
pnpm eval:level                     # alumnos de 1.000 palabras, sin IA
pnpm eval:level --words=300         # o 3000
pnpm eval:level --spoken            # todo dictado
pnpm eval:level --analyze=gemini:gemini-flash-lite-latest --limit=30   # puente con la IA (gasta cuota; queda en caché)
```

Los resultados se guardan en `.eval-results/level-*.json` (con las mediciones de cada alumno simulado, para recalcular anclajes).
