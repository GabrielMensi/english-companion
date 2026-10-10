# Libros: resolver los ejercicios en la app

> Area: Class & textbook · Kind: Research · Status: Exploring

Estado (2026-09-30): **idea explorada, no implementada**. Este documento es la investigación y una propuesta de diseño.

## La idea

Un espacio dedicado a los libros del curso (los que hoy están a mano en `books/`):
1. Cargar un libro (PDF) y verlo en un visor dentro de la app.
2. En la página que estás trabajando, un botón pasa esa página a texto y detecta los ejercicios.
3. Resolvés cada ejercicio en la app y lo mandás a corregir **aislado** (un ejercicio por vez, o varios juntos).
4. Se registra el avance en el libro (qué lecciones y ejercicios hiciste y cómo te fue).
5. El índice pasado a texto sirve después para recomendar ejercicios (ver [ROADMAP.md](../ROADMAP.md), "La app sigue el libro").

## Qué hay en los PDFs (verificado 2026-09-30)

`ROADMAP.md` dice que "son escaneos sin texto". Eso vale para los Student's Books, pero **no para los Workbooks**:

| Archivo | Páginas | Capa de texto | Answer key |
|---|---|---|---|
| `Roadmap.pdf` (Student's Book) | 161 | No (escaneo), solo la última página | No |
| `Roadmap - Workbook.pdf` | 86 | Solo pp. 69–86: **texto digital limpio** | **Sí, pp. 69–78** (después, audio scripts pp. 80–86) |
| `Speak up.pdf` (Student's Book) | 170 | No (escaneo) | No |
| `Speak up - Workbook.pdf` | 96 | **Sí, en todas las páginas, pero es OCR con ruido** | **Sí, pp. ~88–96** |

Detalles que importan para el diseño:
- **La capa OCR del Speakout Workbook no alcanza para los ejercicios**: se lee el texto corrido, pero los números de los huecos salen como basura (`Ifyouwantto®`, `phene` por *phone*, `'    __._....`), y en dos columnas `pdftotext -layout` mezcla los ejercicios. Para resolver un ejercicio hace falta saber exactamente dónde está cada hueco, así que igual conviene un modelo de visión.
- **Las answer keys son lo más valioso que encontramos**. Corregir contra la clave es mucho más confiable que pedirle a un modelo que invente la respuesta correcta (sobre todo con modelos locales). Están organizadas por lección y ejercicio (`2B 1 How do you know Sol?`, `1C 1c 2b 3b…`), así que se pueden mapear a los ejercicios.
- **Los audio scripts** del Roadmap Workbook permiten hacer los ejercicios de listening leyendo el script (o mostrarlo después de responder). Los audios en sí no están.
- **Número de página del PDF ≠ número impreso**: la página 20 del PDF del Speakout Workbook es la 18 del libro. Hay que guardar un offset por libro para hablar el mismo idioma que el profesor ("hacé la página 18").
- **Tipos de ejercicio** vistos en una página típica (Speakout WB, lección 3A; Roadmap WB, unidad 1): completar huecos con palabras de un recuadro, completar palabras incompletas (`memor____`), ordenar palabras para formar una pregunta, multiple choice (a/b/c), elegir entre dos o tres palabras en negrita, conjugar el verbo entre paréntesis, preguntas abiertas de comprensión sobre un texto de la misma página, y pronunciación con audio (no se puede hacer en la app, ver [VOICE.md](../voice/VOICE.md), fase 3).

## ¿Pasar el libro entero a texto o página por página?

**Página por página, a pedido y guardado en caché**, como propone la idea. Motivos:
- Son 513 páginas entre los cuatro libros y la mayoría no se van a usar nunca en la app (el Student's Book se usa en clase con el profesor).
- La extracción con un modelo de visión sale mal a veces: conviene que la revises en el momento, con la página al lado, y no descubrir 200 páginas mal leídas después.
- El free tier de Gemini alcanza de sobra para algunas páginas por día.

Hay tres excepciones que sí conviene extraer una sola vez por libro, al cargarlo:
1. **El índice** (pp. 2–5): es el "syllabus" de ROADMAP §2 y el esqueleto para el avance (unidades → lecciones → páginas).
2. **La answer key**, cuando el libro la tiene. Con texto digital limpio (Roadmap WB) ni siquiera hace falta IA: alcanza con `getTextContent()` de pdf.js y un parser.
3. **El offset de páginas** (se puede detectar leyendo el número impreso de una página, o pedirlo a mano).

Regla general: **usar la capa de texto si existe y es buena; si no, visión**. Se puede medir la calidad barata (proporción de palabras de diccionario, caracteres raros) y decidir por página.

## Propuesta de diseño

### Visor
- **pdf.js** (`pdfjs-dist`) en el navegador: renderiza la página en un `<canvas>` y ya da una imagen lista para mandar al modelo de visión, sin `poppler` en el servidor. Además `getTextContent()` devuelve la capa de texto cuando existe.
- Los PDFs no se suben a ningún lado ni a git: se guardan en `data/books/` (ignorado) o se registra la ruta de `books/`. Una route handler los sirve con soporte de `Range` para no cargar 200 MB de una.
- Navegación por índice (unidad / lección) y por página impresa, con miniaturas si hace falta.

### Detectar los ejercicios de una página
Botón **"Extract exercises"** en la página actual. Se manda la imagen de la página (y la capa de texto como ayuda, si existe) a un modelo de visión, y devuelve los ejercicios como filas **planas** (el proyecto prefiere schemas simples, que todos los proveedores llenan bien):

```
{ exercise: "3A", item: 1, instruction: "Put the words in the correct order.",
  kind: "reorder", prompt: "music / to / What kind of / usually / you / listen / do ?",
  options: null, needsAudio: false }
```

- `kind` sale de una lista fija, igual que la taxonomía: `gap_fill`, `word_box`, `word_completion`, `reorder`, `multiple_choice`, `choose_word`, `verb_form`, `open_answer`, `matching`, `audio`.
- Los textos de lectura de la página se guardan aparte como **contexto del ejercicio**, porque las preguntas de comprensión no se pueden corregir sin ellos.
- Una lección puede ocupar dos páginas (spread): la extracción tiene que poder tomar un rango de páginas.
- **Siempre editable**: la extracción se muestra al lado de la imagen para que arregles lo que se leyó mal antes de resolver. Se guarda en la base y no se vuelve a pedir.

### Resolver y corregir
- Cada ejercicio se muestra como un formulario (un input por hueco, radio buttons para las opciones, textarea para las abiertas), con la imagen de la página al lado.
- **"Check"** por ejercicio, o seleccionar varios y corregirlos juntos (la "función de grupo"). Grupo = varios ejercicios en **una** llamada al modelo, pero cada uno con su resultado. Sirve para ahorrar llamadas; no conviene mezclar ejercicios de páginas distintas en el mismo prompt.
- Corrección en capas, de lo más barato a lo más caro:
  1. **Con answer key y respuesta cerrada** (multiple choice, elegir palabra, completar con recuadro): comparación normalizada, sin IA. Instantáneo y exacto.
  2. **Con answer key y respuesta que puede variar** (ordenar palabras, conjugar, huecos libres): si coincide con la clave, correcto; si no, la IA decide si tu respuesta *también* vale (contracciones, sinónimos) y explica la diferencia.
  3. **Sin clave o respuesta abierta**: la IA corrige como en el chat (el mismo formato de errores con categoría fija y explicación en el idioma configurado), con el contexto del ejercicio.
- Por cada ítem: correcto / aceptable / incorrecto, la respuesta esperada y una explicación corta. Los errores se clasifican con la taxonomía de `src/lib/taxonomy.ts`, nunca categorías nuevas.
- Las llamadas pasan por `resolveModel` / `withFallback` y por `withChatPriority` (una corrección que estás esperando va antes que la clasificación diferida).

### ¿Los errores de los ejercicios cuentan en las estadísticas?
Hay que decidirlo antes de implementar. Un ejercicio de huecos no tiene "palabras escritas" comparables con un mensaje libre, así que meterlo en "errores cada 100 palabras" rompería esa métrica. Propuesta:
- Guardar los resultados en tablas propias, **no** en `corrections`.
- En el dashboard, una sección aparte "Book exercises": aciertos por categoría de la taxonomía y por lección.
- Usar esos aciertos como **segunda señal** de las categorías flojas: "question_formation: 40 % de aciertos en el libro y muchos errores al escribir" es un diagnóstico más fuerte que cualquiera de los dos solo. Es la misma distinción de ROADMAP §2 entre "no lo estudié" y "lo estudié y no se me fijó".

### Avance en el libro
- Unidades y lecciones salen del índice; ejercicios, de las extracciones.
- Estado por ejercicio: sin hacer / hecho (con % de aciertos) / salteado (p. ej. audio). Por lección: % de ejercicios hechos y de aciertos.
- La "unidad actual" de ROADMAP §2 puede **deducirse** de la última lección trabajada en vez de elegirla a mano en Configuración.
- "Rehacer los que fallé": volver a hacer solo los ítems incorrectos, más adelante (encaja con el repaso espaciado del roadmap).

### Recomendaciones (más adelante)
Con el índice mapeado a la taxonomía (ROADMAP §2 ya tiene ejemplos del mapeo) y las estadísticas:
- "Tus errores de `question_formation` subieron esta semana → Speakout WB 3A, ejercicios 3A–3C (question forms), todavía sin hacer."
- Priorizar lecciones ya vistas en clase (según el avance) sobre las que todavía no estudiaste.
- Si un tema del libro ya está agotado, que los "ejercicios dirigidos" del roadmap generen más del mismo tipo.

### Datos (borrador, todo aditivo)
- `books`: id, título, tipo (`student` / `workbook`), ruta del archivo, cantidad de páginas, offset de página, páginas de índice y de answer key.
- `book_lessons`: libro, unidad, lección (`3A`), título, gramática, vocabulario, categorías de la taxonomía, página inicial y final. Sale del índice.
- `book_pages`: libro, página, texto extraído, fuente (`text_layer` / `vision:<modelo>`), editado a mano sí/no.
- `book_exercises`: libro, página, lección, código (`3A`), ítem, instrucción, `kind`, prompt, opciones, respuesta de la answer key, `needs_audio`.
- `book_attempts`: ejercicio, respuesta, resultado, respuesta esperada, explicación, categoría, quién corrigió (`key` / `<provider>:<model>`), fecha.

Todo queda en `data/` (ignorado en git): el contenido de los libros tiene copyright y nunca se sube.

## Modelos de visión

Hoy ninguna llamada de la app manda imágenes. Opciones a evaluar (con un set chico de páginas reales, como `pnpm eval:models`):
- **Gemini Flash / Flash-Lite**: free tier, muy buenos leyendo páginas de libros. Es el candidato principal.
- ~~**Ollama local**~~ (descartado: los modelos locales se quitaron en #72, ver [LOCAL_MODELS.md](../ai/LOCAL_MODELS.md)) con un modelo de visión (familias Qwen-VL o Gemma, que entran en 16 GB de VRAM): privado y gratis, pero más lento y probablemente peor con layouts de dos columnas. Hay que medirlo.
- **Groq**: tiene algún modelo de visión según la época; revisar al implementar.

Como no todos los modelos de la cadena ven imágenes, `resolveModel` necesita saber qué modelo es capaz de visión, y la extracción usa su propia cadena (o un modelo elegido en Configuración) en vez de la del chat. Mandar una página a Gemini implica mandarle contenido con copyright a Google: para uso personal está bien, pero vale la pena tenerlo en cuenta.

## Preguntas abiertas
- ¿Cuentan los ejercicios en las estadísticas principales, o solo en su sección? (propuesta: solo en su sección, más la señal combinada).
- ¿Vale la pena el Student's Book en la app, o solo los Workbooks? Los ejercicios del Student's Book son sobre todo orales y de clase; los Workbooks son para hacer solo y tienen answer key. **Propuesta: empezar solo con los Workbooks.**
- Answer key: ¿se muestra la respuesta correcta siempre, o solo después de intentar dos veces?
- ¿Se puede mostrar el audio script de un listening sin arruinar el ejercicio? (propuesta: solo después de responder, o como "modo lectura").

## Plan por fases
1. **Visor + libros**: cargar un PDF, verlo con pdf.js, offset de páginas, índice extraído una vez (esto también cubre la extracción del syllabus de ROADMAP §2).
2. **Ejercicios con answer key**: extraer ejercicios de una página, parsear la answer key, corrección sin IA para respuestas cerradas y con IA para las que varían. Avance por ejercicio y lección.
3. **Respuestas abiertas y grupos**: corrección con IA sin clave, con contexto de lectura; corregir varios ejercicios juntos.
4. **Recomendaciones**: cruzar el índice y el avance con las categorías flojas del dashboard.

Antes de la fase 1 conviene un spike chico: 5–10 páginas de cada Workbook contra Gemini Flash-Lite y un modelo local, midiendo cuántos ítems se extraen bien, y un parser de la answer key del Roadmap WB (que ya tiene texto limpio).
