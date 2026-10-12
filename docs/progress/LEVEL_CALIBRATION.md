# Calibración del nivel CEFR estimado

> Area: Progress · Kind: Eval · Status: Done · Board: #37, #101

El nivel de **Insights** sale de reglas fijas en `src/lib/insights/level-core.ts`: cuatro señales (precisión, vocabulario, complejidad de las oraciones y rango de tiempos verbales) que se pasan a un puntaje de 1 (A1) a 6 (C2) con puntos de anclaje fijos, y se promedian con pesos. Al principio esos anclajes y pesos eran aproximaciones (precisión 40 %, el resto 20 % cada una). Este documento cuenta cómo se contrastaron con textos de alumnos calificados por humanos (issue #37) y qué cambió.

## Datos

**Cambridge English Write & Improve + LOCNESS** (release BEA-2019, v2.1): <https://www.cl.cam.ac.uk/research/nl/bea2019st/>

- 3.300 textos de alumnos de inglés (cartas, ensayos, historias, respuestas a consignas) con un **nivel CEFR asignado por evaluadores de Cambridge**, de A1.i a C2.ii, y **todas las correcciones** marcadas a mano. Más 50 ensayos de nativos (LOCNESS) como referencia.
- Licencia: uso **no comercial, de investigación y educativo**; no se puede redistribuir (LOCNESS pide autorización para pasarlo a terceros). Usarlo localmente para calibrar una app personal entra en eso, pero **no está en el repo**: se descarga en `data/` (ignorado por git):

  ```bash
  mkdir -p data/cefr && curl -L https://www.cl.cam.ac.uk/research/nl/bea2019st/data/wi+locness_v2.1.bea19.tar.gz | tar xz -C data/cefr
  ```

- Cita: Yannakoudakis, Andersen, Geranpayeh, Briscoe y Nicholls (2018). _Developing an automated writing placement system for ESL learners_. Applied Measurement in Education 31:3.

Se eligió porque es el único corpus abierto (sin registro) que tiene **las dos cosas** que necesita el estimador: nivel CEFR por texto y los errores marcados. EFCAMDAT, ICNALE y el Write & Improve 2024 completo piden registro o acuerdo de uso; ELLIPSE tiene puntajes holísticos 1–5, no niveles CEFR; CEFR-SP y los textos "levelled" de Kaggle son textos de lectura, no escritura de alumnos.

## Método

`pnpm eval:level` (`scripts/eval/level.mts` y `level-data.ts`):

1. **Alumnos simulados.** El estimador necesita al menos 300 palabras y en la app suele ver entre 1.000 y 3.000. Un texto del corpus tiene 65 (A1) a 270 (C2) palabras, así que se juntan textos del mismo nivel, ordenados por usuario (en general son del mismo alumno), en bloques de ~1.000 palabras (`--words=300` y `--words=3000` para los otros tamaños). Cada bloque se estima igual que en la app: un mensaje por texto, tiempos verbales contados sobre el texto corregido.
2. **Errores.** Las correcciones del corpus se clasifican como lo haría la app: si solo cambian puntuación, espacios o mayúsculas son _sugerencias_ (casi siempre comas opcionales); una palabra cambiada por otra muy parecida que no es una flexión ("resaon" → "reason") es _typo_; el resto cuenta como error.
3. **Puente con la IA de la app.** Los anotadores de Cambridge corrigen más que la IA de la app (también corrigen estilo y fluidez). Para medir la diferencia, `pnpm eval:level --analyze=gemini:gemini-flash-lite-latest --limit=30` pasa 30 textos (5 por nivel, del split _dev_) por el análisis real de la app y compara: **la app cuenta 0,6 de los errores** que cuenta el corpus, y esa proporción es estable en todos los niveles (0,52–0,70). El eval usa ese 0,6 (`--app-ratio`) para que las tasas estén en la escala de la app. Los resultados de la IA quedan en caché en `.eval-results/level-analysis-cache.json`.
4. **Ajuste en _train_, medición en _dev_.** Los anclajes se sacaron de las medianas por nivel del split _train_ (495 alumnos de 1.000 palabras); los pesos, de una búsqueda en grilla sobre _train_, eligiendo una opción conservadora (ver abajo). _Dev_ (46 alumnos + 17 nativos) no se usó para ajustar y es el número honesto. Se reporta acuerdo exacto, acuerdo ±1 nivel, error medio, sesgo y matriz de confusión.

## Qué mostró la evidencia

Correlación de rango (Spearman) de cada señal con el nivel humano, en alumnos de 1.000 palabras:

| Señal                                           | Spearman | Conclusión                                                                              |
| ----------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| Precisión (errores cada 100 palabras)           | **0,92** | La mejor señal por lejos.                                                               |
| Vocabulario (MATTR + palabras largas)           | 0,52     | Ayuda, con rangos chicos entre niveles.                                                 |
| Complejidad (palabras por oración + conectores) | 0,05     | No separa niveles: los A1 casi no puntúan, así que sus "oraciones" son largas.          |
| Rango de tiempos verbales                       | 0,10     | No separa niveles: la consigna decide los tiempos, y todos usan más o menos los mismos. |

Medianas por nivel en _train_ (errores en escala de la app, ×0,6):

|                            | A1    | A2    | B1    | B2    | C1    | C2    |
| -------------------------- | ----- | ----- | ----- | ----- | ----- | ----- |
| Errores / 100 palabras     | 8,2   | 7,4   | 5,7   | 4,0   | 2,6   | 1,5   |
| Palabras distintas (MATTR) | 0,772 | 0,781 | 0,787 | 0,798 | 0,796 | 0,799 |
| Palabras de 7+ letras      | 17 %  | 18 %  | 19 %  | 19 %  | 21 %  | 21 %  |
| Palabras por oración       | 14,8  | 16,9  | 16,4  | 16,5  | 16,9  | 16,7  |

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

Split _dev_ (no usado para ajustar), errores en escala de la app:

| Palabras por alumno | Antes: exacto / ±1 / error medio | Después: exacto / ±1 / error medio |
| ------------------- | -------------------------------- | ---------------------------------- |
| 300 (134 alumnos)   | 23 % / 75 % / 1,04               | **40 % / 93 % / 0,66**             |
| 1.000 (46 alumnos)  | 20 % / 74 % / 1,07               | **59 % / 100 % / 0,41**            |
| 3.000 (16 alumnos)  | 19 % / 75 % / 1,06               | **81 % / 100 % / 0,19**            |

En _train_ (1.000 palabras): 23 % / 76 % antes, 62 % / 97 % después. Antes, casi todo caía en B1 o B2 (A2 → B2, C1 → B2); ahora la matriz es diagonal, con los errores en niveles vecinos. Los nativos de LOCNESS salen C1 o C2. Con todo dictado (`--spoken`, que simula que la mitad de los errores no se cuentan) da 59 % / 98 %.

## Revisión por proveedor y en chat real (#101, octubre 2026)

**Groq (qwen/qwen3.8-27b), los mismos 30 textos de _dev_.** Solo 22 se pudieron analizar: el plan gratis de Groq limita a Qwen a **1.000 tokens de salida por minuto** y la corrección de un ensayo de ~200 palabras con muchos errores pide 1.000–1.900, así que Groq rechaza el pedido entero ("Request too large", HTTP 429) por más que se espere. Con 75 s entre pedidos pasan los demás (con 15 s se corta al tercero). Comparando los 22 textos que salieron con lo que contó Gemini en esos mismos textos:

|       | Corpus | Gemini flash-lite | Groq Qwen | Gemini ÷ corpus | Groq ÷ corpus |
| ----- | ------ | ----------------- | --------- | --------------- | ------------- |
| A1    | 53     | 35                | 38        | 0,66            | 0,72          |
| A2    | 35     | 19                | 16        | 0,54            | 0,46          |
| B1    | 41     | 26                | 26        | 0,63            | 0,63          |
| B2    | 43     | 33                | 38        | 0,77            | 0,88          |
| C1    | 53     | 22                | 22        | 0,42            | 0,42          |
| C2    | 15     | 9                 | 15        | 0,60            | 1,00          |
| Total | 240    | 144               | 155       | **0,60**        | **0,65**      |

Groq cuenta un 8 % más que Gemini en los mismos textos; por nivel salta entre 0,42 y 1,0, pero con 2 a 5 textos por nivel eso es ruido (C2 son 15 errores en total). Un 8 % más de errores mueve el puntaje de precisión menos de un cuarto de nivel. Además, en la app Groq es solo el respaldo: de los 59 mensajes reales, 52 los corrigió Gemini flash-lite, 2 Groq y 5 Ollama (gemma4:12b, de antes de sacar los modelos locales en #72) (el modelo principal sigue siendo `gemini-flash-lite-latest`, el mismo del puente original, así que no hizo falta gastar cuota de Gemini).

**Chat real: no hay calificación del profesor.** La base no guarda ningún nivel ni nota del profesor por sesión (no existe ese campo), así que calibrar contra el profesor sigue bloqueado hasta que se registre. Lo que sí se puede medir sin IA, con `countsInStats` y la taxonomía, sobre `data/dev.db` (copia del 28/9 al 8/10, 59 mensajes):

| Tipo     | Mensajes | Palabras | Errores contados | Cada 100 palabras | En categorías no medibles al hablar |
| -------- | -------- | -------- | ---------------- | ----------------- | ----------------------------------- |
| Escritos | 55       | 2.648    | 189              | 7,1               | 108 de 189 (**57 %**)               |
| Dictados | 4        | 105      | 5 (9 reportados) | 4,8 (×2 = 9,5)    | 4 de 9 (excluidos)                  |

**Factor de dictado.** Si una proporción _p_ de los errores cae en categorías que no se cuentan al dictar, el factor que compensa es 1 / (1 − _p_):

| Fuente                                   | _p_  | Factor |
| ---------------------------------------- | ---- | ------ |
| Ensayos, Gemini (30 textos, 252 errores) | 0,50 | 1,98   |
| Ensayos, Groq (22 textos, 155 errores)   | 0,52 | 2,09   |
| Chat escrito real (55 mensajes, 189)     | 0,57 | 2,33   |

En el chat real el intervalo (bootstrap por mensaje, 95 %) es 0,50–0,64, o sea un factor de 2,0 a 2,8. Pesa la ortografía: 37 errores de spelling marcados como error y no como typo; sin ellos _p_ baja a 0,47. Con 4 mensajes dictados no se puede comparar la tasa hablada con la escrita.

**Decisión.**

- **0,6 se queda.** Groq da 0,65 en los mismos textos, dentro del ruido de la muestra, y casi todo el chat lo corrige Gemini.
- **El factor 2 se queda.** Los tres números lo incluyen en su rango; el chat real apunta a algo más (~2,3), pero son 55 mensajes de diez días y una parte es ortografía. Si con más datos se mantiene por encima de 2,2, subirlo a 2,3 (`SPOKEN_MISTAKE_FACTOR`).
- **Pendiente:** calibrar contra el profesor cuando haya sesiones con su nivel (hace falta guardarlo); repetir el factor con unos 500 errores de chat escrito; comparar tasa dictada vs escrita cuando haya unas 1.000 palabras dictadas.

## Límites

- **Ensayos, no chat.** Los textos son respuestas a consignas de examen. Tus mensajes son prompts y charla: más cortos, más técnicos, otro registro. No hay corpus CEFR de chat, así que no se puede medir cuánto cambia; se bajó el peso de lo que más depende del registro, pero la precisión también puede variar (en un prompt se escribe rápido).
- **Los errores de la app los cuenta la IA.** El puente (0,6) sale de 30 textos con gemini-flash-lite; Groq (Qwen) dio 0,65 en 22 de esos textos (ver arriba). Vale repetir `--analyze` si cambia el modelo principal.
- **El factor de dictado sale de texto escrito.** En ensayos y en el chat escrito real da 2 a 2,3; al hablar la mezcla de errores puede ser distinta y todavía hay muy pocos mensajes dictados para medirlo.
- **Niveles de Write & Improve.** Los asignan evaluadores de Cambridge para la plataforma, no son exámenes oficiales; A1 tiene pocos textos y muy cortos.
- **Señales flojas.** Con tan poca diferencia entre niveles, A1 vs A2 se distingue mal (en A1 los errores por palabra no suben más que en A2) y C1 vs C2 también.
- **Alumnos simulados.** Los bloques juntan textos de un mismo nivel; cuando un alumno no llega a 1.000 palabras, se completa con otro.

## Cómo repetirlo

```bash
pnpm eval:level                     # alumnos de 1.000 palabras, sin IA
pnpm eval:level --words=300         # o 3000
pnpm eval:level --spoken            # todo dictado
pnpm eval:level --analyze=gemini:gemini-flash-lite-latest --limit=30   # puente con la IA (gasta cuota; queda en caché)
pnpm eval:level --analyze=groq:qwen/qwen3.8-27b --limit=30 --delay=75000   # Groq: más pausa por su límite de tokens por minuto
```

Los resultados se guardan en `.eval-results/level-*.json` (con las mediciones de cada alumno simulado, para recalcular anclajes). `--analyze` se corta en el primer error de cuota; los textos que Groq rechaza por largos se saltean.
