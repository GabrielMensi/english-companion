# Tiempos verbales: diagnóstico por tiempo

Estado (2026-09-29): propuesta. Los tiempos verbales son uno de los temas más importantes para un hispanohablante, pero hoy la app solo sabe **cuántos** errores hay en `verb_tense`, no **en qué tiempo** ni **cuáles domino**.

## Qué pasa hoy

- Todo error de tiempo va a la categoría `verb_tense`, con un `subcategory` que el modelo inventa libremente. En la base actual hay, por ejemplo, `past_simple` y `present_tense_for_future_conditions`: nombres distintos para cosas del mismo tipo, que no se pueden agrupar por tiempo.
- Los errores de *forma* del mismo tiempo van a otras categorías: *"I have wrote"* es `verb_form`, *"he go"* es `subject_verb_agreement`, *"If I will have time"* es `conditionals`. El present perfect aparece repartido en tres lugares.
- **Solo se registran fallas.** Para saber qué tiempo es fuerte hace falta saber cuántas veces lo usaste **bien**. Hoy, "cero errores de past perfect" puede significar que lo dominás o que nunca lo usás (evitación, muy común con el present perfect y los perfect continuous).
- El dato más útil para un hispanohablante es la **confusión**: qué tiempo usaste en lugar de cuál (*past simple en vez de present perfect*, *present simple en vez de present perfect* con *since/for*). Hoy no se guarda.

## Propuesta

Tres datos nuevos, todos con listas fijas (como la taxonomía) para que las estadísticas agrupen bien:

1. **`tense`**: el tiempo que *correspondía*, en cada error de categorías verbales.
2. **`tenseUsed`**: el tiempo que *usaste*, cuando el error es de uso. Con los dos sale la matriz de confusión.
3. **Usos por tiempo** en cada mensaje: cuántas veces aparece cada tiempo en el texto corregido. Es el denominador para calcular la precisión.

Con eso, para cada tiempo: `usos`, `errores de uso`, `errores de forma`, `precisión = 1 − errores / usos`, tendencia y estado.

### Lista fija de tiempos (`src/lib/taxonomy.ts`)

```ts
export const TENSES = [
  "present_simple",
  "present_continuous",
  "past_simple",
  "past_continuous",
  "present_perfect",
  "present_perfect_continuous",
  "past_perfect",
  "past_perfect_continuous",
  "future_will",
  "future_going_to",
  "future_present_continuous", // arrangements: I'm meeting him tomorrow
  "future_continuous",
  "future_perfect",
  "used_to_would",             // past habits
  "conditional_would",         // would do / would have done
] as const;
```

Con `TENSE_LABELS` y `TENSE_HINTS` (una línea para el modelo, igual que `CATEGORY_HINTS`). Los condicionales y los modales mantienen su categoría; `tense` indica qué tiempo verbal había dentro (p. ej. *"If I will have time"* → `conditionals` con `tense: present_simple`, `tenseUsed: future_will`).

### Uso vs forma

Distinguir dos tipos de falla por tiempo cambia la estrategia de estudio:
- **Uso** (`verb_tense`): sabés formarlo pero no cuándo usarlo → explicación de contraste y ejercicios de elección (*"I live here since 2020"*).
- **Forma** (`verb_form`, `subject_verb_agreement`, `question_formation`): sabés cuándo usarlo pero lo armás mal → drills de conjugación (*"I have wrote"*, *"he don't"*, *"Did you went?"*).

Se deriva de la categoría que ya existe, no hace falta un campo nuevo.

## Cambios

### Salida del modelo (`src/lib/ai/analysis.ts`)

> Alternativa: en vez de agregar estos campos al prompt del análisis, los puede resolver la etapa de clasificación separada de [ERROR_CLASSIFICATION.md](ERROR_CLASSIFICATION.md). Así el prompt no crece.

Dos campos planos más por error, que funcionan con modelos locales (enum con `"none"` en vez de null, porque los modelos chicos manejan mejor un string que un null):

```ts
tense: z.enum([...TENSES, "none"]).describe("Tense the sentence needed. 'none' unless the error involves a verb."),
tenseUsed: z.enum([...TENSES, "none"]).describe("Tense the learner used instead. 'none' if the error is about form, not tense choice."),
```

Instrucciones: una regla nueva con la lista de tiempos y un ejemplo; el ejemplo actual ya sirve (*"Yesterday I have went"* → `tense: past_simple`, `tenseUsed: present_perfect`).

`normalizeAnalysis` (puro, con tests):
- `tense` / `tenseUsed` → `null` si son `"none"` o si la categoría no es verbal (`verb_tense`, `verb_form`, `subject_verb_agreement`, `question_formation`, `conditionals`, `modals`).
- En `verb_tense`, si `tenseUsed === tense`, el error es de forma: se descarta `tenseUsed`.
- Nada de esto aplica a `suggestion` ni `typo`.

### Conteo de usos (el denominador)

Contar los tiempos del **texto corregido** (el que expresa lo que quisiste decir) con código, no con el modelo:
- **Opción recomendada: [compromise](https://github.com/spencermountain/compromise)**, NLP en JS basado en reglas. Detecta frases verbales y su forma (simple / progressive / perfect, past / present / future). Es determinístico, corre offline en microsegundos, se puede testear con vitest y **se puede correr sobre todo el historial** (el `correctedText` ya está guardado) sin volver a llamar a la IA.
- Alternativa si compromise falla demasiado: pedirle al modelo `tensesUsed: TENSE[]`. Cuesta tokens y los modelos locales cuentan mal, así que queda como plan B.
- Paso 0: un spike con ~50 oraciones etiquetadas a mano (incluidas las de `scripts/eval/samples.ts`) para medir la precisión de compromise por tiempo. Si confunde algún tiempo en particular (p. ej. `future_present_continuous` vs `present_continuous`, que solo el contexto separa), se fusionan esos tiempos en el conteo.

Nuevo módulo puro `src/lib/tenses-core.ts`: `countTenses(text): Partial<Record<Tense, number>>`, con tests. Se ignoran los bloques de código y el texto entre backticks, igual que en el análisis.

### Schema (`src/db/schema.ts` + `pnpm db:generate`)

```ts
// corrections
tense: text("tense").$type<Tense>(),
tenseUsed: text("tense_used").$type<Tense>(),

// messages
tenseCounts: text("tense_counts", { mode: "json" }).$type<Partial<Record<Tense, number>>>(),
```

Backfill: un script que recorre los mensajes con `correctedText` y completa `tenseCounts`. Los pocos errores verbales viejos se pueden reclasificar con el modelo o quedarse sin `tense` (se muestran como "sin clasificar").

### Estadísticas (`src/lib/stats-core.ts`)

Nueva sección `tenses` en `Stats`:

```ts
interface TenseStat {
  tense: Tense;
  uses: number;
  usageErrors: number;   // verb_tense
  formErrors: number;    // verb_form, subject_verb_agreement, question_formation...
  accuracy: number | null;           // null con muy pocos usos
  smoothedAccuracy: number;          // para rankear sin que 1 de 1 gane
  trend: number | null;              // vs el período anterior
  status: "strong" | "shaky" | "weak" | "not_enough_data" | "avoided";
  confusedWith: { tense: Tense; count: number; example: {...} }[];
}
```

- **Precisión suavizada** (Beta(1,1)): `(usos − errores + 1) / (usos + 2)`. Con 2 usos y 0 errores da 75 %, no 100 %, así no se declara "fuerte" algo que casi no usaste.
- **Estados** (umbrales iniciales, ajustables): `strong` ≥ 90 % con ≥ 15 usos; `weak` < 75 %; `shaky` en el medio; `not_enough_data` con < 5 usos; `avoided` si el tiempo casi no aparece en muchas palabras escritas y es un tiempo común (present perfect, past continuous, going to). Evitar un tiempo también es una debilidad.
- **Matriz de confusión**: pares `tenseUsed → tense` ordenados por frecuencia, con el ejemplo más reciente.
- Respeta el mismo `countTypos` y los mismos rangos de fechas; cuando exista la voz ([VOICE.md](VOICE.md)), también el filtro escrito / hablado.

### Dashboard

Una card "Verb tenses":
- Tabla por tiempo: usos, precisión (barra), errores de uso vs forma, tendencia y estado con color (fuerte / inestable / débil / evitado / sin datos), agrupada por familia (presentes, pasados, perfectos, futuros).
- "Your most common confusions": *"Past simple instead of present perfect — 7 times"*, con el ejemplo real y un link a la explicación.
- Resumen de una línea: *"Strongest: present simple (96 %). Needs work: present perfect (58 %, mostly used past simple instead). Avoided: past perfect."*

### Estrategia de mejora (lo que se hace con el diagnóstico)

El diagnóstico alimenta las features del roadmap que ya estaban previstas, con más precisión que "la categoría más floja":
- **Ejercicios dirigidos**: en vez de "verb tenses", ejercicios de **contraste** para el par más confundido (elegir entre past simple y present perfect con marcadores como *yesterday / since / ever / just*), o de **forma** si la falla es de conjugación.
- **Repaso espaciado**: las tarjetas de errores verbales llevan el tiempo, así que se puede repasar "solo present perfect".
- **Conversación que fuerza el tiempo**: el modo conversación propone preguntas que requieren el tiempo débil o evitado (*"What have you done this week that you haven't done before?"*, *"What were you doing when…?"*). Es la forma de generar usos del tiempo evitado.
- **Plan semanal y reporte para la clase**: "Present perfect: 58 % de precisión, lo confundís con past simple" es algo concreto para pedirle al profesor. Con el syllabus del libro se puede marcar "visto en Roadmap 3A y todavía débil".
- **Escrito vs hablado** (con la voz): un tiempo fuerte al escribir y débil al hablar indica que se conoce la regla pero todavía no está automatizada.

### Evaluación de modelos

- Sumar a `scripts/eval/samples.ts` un campo opcional `tense` / `tenseUsed` en las expectativas y agregar casos típicos: *"I live here since 2020"*, *"When I will arrive, I call you"*, *"I didn't saw him"*, *"I was knowing the answer"*, *"If I would have known"*.
- `score.ts` suma un puntaje de "tiempo correcto" para decidir si los modelos locales lo clasifican bien. Si `gemma4:12b` falla mucho en `tenseUsed`, se puede dejar solo `tense` para los modelos locales.

## Plan de implementación

1. **Spike de conteo**: compromise sobre ~50 oraciones etiquetadas; decidir compromise vs plan B y qué tiempos fusionar.
2. **Taxonomía**: `TENSES`, labels y hints en `taxonomy.ts`.
3. **Análisis**: campos en el schema de salida, regla y ejemplo en las instrucciones, normalización con tests.
4. **Conteo**: `tenses-core.ts` con tests; guardar `tenseCounts` al persistir el análisis (`src/lib/chat.ts`).
5. **DB**: columnas nuevas, `pnpm db:generate`, script de backfill.
6. **Stats**: `tenses` en `computeStats` con tests (precisión suavizada, estados, confusiones, tendencia).
7. **Dashboard**: card "Verb tenses".
8. **Eval**: casos nuevos y puntaje de tiempo; correr `pnpm eval:models` con los modelos recomendados.
9. **Docs**: README y ROADMAP.

Después: ejercicios de contraste y conversación dirigida, que se apoyan en esto.
