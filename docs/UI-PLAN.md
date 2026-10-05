# Plan de UI/UX

La app dejó de ser solo un chat y la jerarquía se volvió difícil de leer. Este plan mantiene el minimalismo, pero la jerarquía sale de dos "voces" y de colores con un solo significado, no de más bordes.

## Diagnóstico

1. **Todo pesa lo mismo**: cada página era una pila de paneles idénticos (`rounded-xl border bg-card p-5`) y los `h2` tenían el tamaño del texto común, así que una sección y un ítem de esa sección se veían igual.
2. **La navegación es plana, pero la app es un ciclo**: Dashboard, Insights, Practice, Vocabulary, Flashcards y Settings tenían el mismo peso, y todos los chats el mismo ícono.
3. **Los colores significaban cosas distintas en cada página**: celeste era "sugerencia" en el chat, "poco usado" en Practice y "nueva" en Flashcards; rojo era error grave, "needs work" y "más que antes".
4. **La tarjeta de corrección es plana**: errores, typos, versión nativa, nota del modelo y acciones con el mismo peso.
5. **Muletillas de plantilla**: tiles de número grande, links con `→`, etiquetas en mayúsculas, textos con `A · B · C`.
6. **La home no lleva a ningún lado**: explica la app, pero no muestra qué hacer hoy.

## Dirección: "el margen del cuaderno"

Es un tutor de escritura: tu inglés es el texto que se estudia, y la app son las marcas alrededor.

**Tipografía, dos voces**
- **Tu inglés** (mensajes, correcciones, versión nativa, respuestas, más adelante flashcards y ejercicios): Newsreader, serif de lectura, 17px con interlineado 1.6 (`font-serif text-reading`).
- **La app** (navegación, etiquetas, botones, números): Hanken Grotesk.
- Escala 1.25: título de página 25px (`text-title`), sección 20px (`text-section`), lectura 17px, UI 14–16px.
- La serif nunca va en títulos de página (sería el cliché "serif display").

**Color, dos sistemas separados**

| Rol | Claro | Oscuro | Uso |
|---|---|---|---|
| Write | `#2f5bd3` | `#7c9bf0` | chats, composer |
| Review | `#0f7c72` | `#4fc2b5` | Dashboard, Insights |
| Train | `#7046c9` | `#a88af0` | Practice, Flashcards, Vocabulary |
| Lo que estaba mal | `#c2362b` | `#f07a6e` | texto tachado, tendencias que empeoran |
| La corrección | `#18794e` | `#5fcf98` | texto corregido, tendencias que mejoran |
| Gravedad | ámbar → naranja → rojo | | badges, gráficos |

- Los **colores de área** solo indican dónde estás: la marca junto al título, los botones primarios de la página y (fase 2) los íconos de navegación. Nunca codifican datos. Se aplican con `<Page area="…">` (`data-area` redefine `--primary`).
- Los **colores de marca** son solo para datos. Los estados (`StatusBadge`) usan la misma rampa que la gravedad: rojo es un problema, ámbar es inestable, verde está bien, y un contorno punteado es opcional o informativo (sugerencias, "rarely used").
- Todos los pares texto/fondo pasan AA (≥ 4.5:1) en los dos temas.

**Dónde va la audacia**: en la corrección marcada (fase 3). El resto queda quieto.

## Fases

| # | Fase | Issue |
|---|---|---|
| 1 | Tokens, fuentes, escala; `Page` / `PageHeader` / `Section` compartidos; `StatusBadge`; colores semánticos en vez de la paleta de Tailwind; sin mayúsculas ni `→` | #48 |
| 2 | Sidebar agrupada (Today, Write con los chats, Review, Train; Settings abajo), ícono por tipo de chat, badge de tarjetas pendientes | #49 |
| 3 | Tarjeta de corrección: marcas en línea con números de referencia, versión nativa arriba, errores agrupados por categoría y ordenados por gravedad, typos y sugerencias plegados, nota del modelo en un popover, Correction/Conversation como control segmentado | #50 |
| 4 | Hub "Today" en lugar de la home: qué hacer hoy, seguir el último chat, tarjetas pendientes, práctica sugerida | borrador |
| 5 | Review y Train: titular en frase en vez de tiles, "Practice this" en cada área, detalles con menos peso; jerarquía sección → ítem en Practice y Flashcards | borrador |
| 6 | Calidad: foco visible, `prefers-reduced-motion`, capturas antes/después | borrador |

### Bocetos

Sidebar (fase 2):
```
English Companion          ◐  ⇤
[ + New chat ]
  Today
Write
  ✎ The app is growing…   (corrección)
  💬 I take English cl…    (conversación)
  🏋 Past simple drill     (práctica)
Review
  Dashboard · Insights
Train
  Practice · Flashcards (1) · Vocabulary
───────────
  Settings
```

Tarjeta de corrección (fase 3):
```
 The app is growing¹ and it's no longer just a chat app…   ← serif, marcas en línea
 How a native would say it                          🔊     ← serif itálica, arriba
 Mistakes  ●1 moderate  ●5 minor
 Phrasal verbs
   ¹ growing up → growing            Moderate
 Spelling (4)                                    ▸ show
 Typos and suggestions (2)                       ▸ show
 Listen  Copy  Turn into prompt                  ⓘ model
```
