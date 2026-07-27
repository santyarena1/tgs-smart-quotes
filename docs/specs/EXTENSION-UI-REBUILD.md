# EXTENSION-UI-REBUILD — Sistema de diseño y reconstrucción visual del panel (spec autoritativa)

> Leé antes `docs/BUILD_PLAN.md` y `docs/specs/EXTENSION-PRO.md` (funcionalidad ya construida —
> NO la reduzcas, esto es una reconstrucción VISUAL/UX, la lógica de negocio ya implementada se mantiene).
> El usuario reportó: textos desalineados dentro de los modales, todo "apretado", falta de pulido general.
> Diagnóstico confirmado: no hay tokens de diseño (valores hex/px sueltos e inconsistentes: 5px/6px/7px/9px
> mezclados sin escala), y `.tgs-item-grid` tiene columnas angostas fijas (64px cantidad, 58px acciones) que
> recortan contenido y mezclan celdas de una y dos líneas (input + `<small>` debajo) causando filas de
> distinta altura → texto que no queda en línea con la fila de al lado. Reconstruí el sistema de diseño
> completo en `panel/ui.tsx` y reescribí cada pantalla/modal para usarlo consistentemente. NO hagas parches
> puntuales de CSS: es una reconstrucción real del lenguaje visual, con criterio propio de diseño profesional.

## 0. Reglas de este rediseño
- Mantené TODA la funcionalidad ya construida (tabs Chat/Presupuesto/Historial, QuickEditModal con ítems/
  total objetivo/PDF, CustomerModal, adjunto real de PDF, detección de envío, análisis de respuesta, etc.).
  Esto es un rediseño de presentación + pulido de UX, no un recorte de alcance.
- Sin librerías de UI externas (nada de Tailwind/MUI/etc.). Seguí con React + CSS-in-JS simple como ya está
  (un único `<style>` inyectado). Está bien REESCRIBIR ese bloque de CSS entero desde cero.
- Paleta dark: podés ajustar tonos si mejora contraste/jerarquía, pero mantené la identidad (verde WhatsApp
  `#25D366` como acento primario de acciones "seguras"/confirmación positiva).
- Idioma español en toda la UI. Formatos ARS/fecha Argentina donde aplique (ya existen helpers en `lib/format.ts`
  y `lib/pricing.ts` — reusalos, no dupliques formateo).

## 1. Sistema de tokens (CSS custom properties, en `:root` dentro de `#tgs-panel-root`)

Definí variables y USALAS en todo el CSS (nada de hex/px sueltos repetidos):

**Espaciado** (escala de 4): `--tgs-space-1:4px; --tgs-space-2:8px; --tgs-space-3:12px; --tgs-space-4:16px;
--tgs-space-5:20px; --tgs-space-6:24px; --tgs-space-8:32px;`

**Radios**: `--tgs-radius-sm:6px; --tgs-radius-md:10px; --tgs-radius-lg:14px; --tgs-radius-pill:999px;`

**Tipografía**: `--tgs-font-xs:11px; --tgs-font-sm:12px; --tgs-font-base:13px; --tgs-font-md:14px;
--tgs-font-lg:16px; --tgs-font-xl:18px;` + `--tgs-line-tight:1.2; --tgs-line-normal:1.45;`

**Color** (mantené los valores actuales de superficie/texto pero nombralos):
`--tgs-bg:#111318; --tgs-surface:#171a21; --tgs-surface-2:#1c2027; --tgs-surface-3:#1a1e26;
--tgs-border:#2a2e37; --tgs-border-strong:#3a3f4c; --tgs-text:#f1f3f5; --tgs-text-muted:#9096a2;
--tgs-text-dim:#6b7280; --tgs-accent:#25D366; --tgs-accent-ink:#06210f; --tgs-danger:#e5484d;
--tgs-warn:#f5a524; --tgs-info:#66c7ff; --tgs-ok:#63e6a2;`

**Alturas de control fijas** (CLAVE para resolver el desalineado): `--tgs-control-h-sm:28px;
--tgs-control-h-md:34px; --tgs-control-h-lg:40px;`. TODO input/select/button de una línea usa
`height: var(--tgs-control-h-md)` (o `-sm`/`-lg` según contexto) — nunca alturas implícitas por padding
inconsistente. Esto es lo que garantiza que una fila de la tabla de ítems quede perfectamente alineada
horizontalmente entre columnas.

## 2. Layout general del panel

- Panel expandido: ancho `380px` (subilo un poco de 360 para dar aire), `border-radius: var(--tgs-radius-lg)`,
  padding interno consistente `var(--tgs-space-4)` en el body.
- Header: altura fija `48px`, logo/título a la izquierda, badge de notificaciones + botón colapsar a la
  derecha, `padding: 0 var(--tgs-space-4)`.
- Tabs: altura fija `40px`, texto `--tgs-font-sm` con peso 600, estado activo con subrayado de 2px en
  `--tgs-accent` (ya existe la idea, solo hacelo con el token) Y fondo sutil distinto (no solo box-shadow).
- Cada sección/tarjeta dentro de una tab: `padding: var(--tgs-space-4)`, `gap: var(--tgs-space-3)` entre
  elementos internos, separador `border-top: 1px solid var(--tgs-border)` con `padding-top`/`margin-top`
  iguales a `var(--tgs-space-4)` (hoy usa 10px, subilo a 16 para dar más aire).
- Todo `Field` (label + control): `gap: var(--tgs-space-1)` entre label y control, el label SIEMPRE
  `--tgs-font-xs`, `color: var(--tgs-text-muted)`, `text-transform: none` (nada de mayúsculas forzadas
  salvo que decidas que mejora legibilidad — si lo hacés, hacelo consistente en TODOS los labels).
- `Alert`/`Pill`: usar `display:flex; align-items:center; gap: var(--tgs-space-2)` y agregar un ícono de
  estado simple (●/⚠/✓ como carácter, no libería de íconos) antes del texto para escaneo visual rápido.

## 3. Sistema de modales (rediseño estructural, no solo estético)

Todo modal (`ConfirmModal`, `CustomerModal`, `QuickEditModal`, `VersionEditModal`, y cualquier picker
anidado) sigue esta estructura fija de 3 zonas:

```
.tgs-modal { display:flex; flex-direction:column; max-height: 84vh; }
.tgs-modal-header { flex:0 0 auto; padding: var(--tgs-space-5); border-bottom:1px solid var(--tgs-border); }
.tgs-modal-body   { flex:1 1 auto; overflow-y:auto; padding: var(--tgs-space-5); }
.tgs-modal-footer { flex:0 0 auto; padding: var(--tgs-space-4) var(--tgs-space-5);
                    border-top:1px solid var(--tgs-border); display:flex; justify-content:flex-end;
                    gap: var(--tgs-space-2); }
```

- Header incluye: título (`--tgs-font-lg`, peso 700), subtítulo opcional (`--tgs-font-sm`, muted, ej.
  "TGS-1193 · V2"), y un botón cerrar (✕) arriba a la derecha (hoy no existe ningún botón de cerrar
  explícito además del backdrop — agregalo, mejora la sensación "pro").
- Footer (acciones) SIEMPRE visible/sticky, nunca se pierde por scroll del body — esto es importante para
  modales largos como `QuickEditModal`.
- Cerrar con tecla `Escape` (listener a nivel modal, remover al desmontar) además de click en backdrop y ✕.
- Al abrir un modal, foco automático al primer campo interactivo (mejora accesibilidad/velocidad).
- Ancho: mantené la idea de modal angosto (~360-420px) para `ConfirmModal`/`CustomerModal`/`VersionEditModal`,
  y ancho (`min(920px,94vw)`) para `QuickEditModal` — pero AMBOS usan la misma estructura de 3 zonas.

## 4. Editor de ítems — el punto más roto hoy (rehacer completo)

Reemplazá `.tgs-item-grid` (columnas fijas angostas, filas de altura mixta) por una tabla con **altura de
fila fija y una sola línea de contenido por celda** (sacá el `<small>` de conversión de moneda que hoy
convive con el input y rompe la alineación — en su lugar, el input YA muestra el valor formateado
directamente cuando no tiene foco, y el valor crudo editable solo al hacer foco; si preferís mantener un
indicador secundario, ponelo en un tooltip `title=` del input, no como texto visible adicional).

Estructura por fila (`--tgs-control-h-md` para TODOS los controles de la fila, sin excepción):
- Columna **Línea**: select, ancho fijo `130px`.
- Columna **Producto**: ocupa el espacio flexible restante (`flex:1 1 auto; min-width:220px`). Dentro:
  input de nombre + badge pequeño "catálogo" (si `productId`) alineados en una sola fila con `display:flex;
  align-items:center; gap:var(--tgs-space-2)`, y el botón "Reemplazar" como ícono `⇄` con `title` tooltip,
  no como botón de texto largo que empuja el layout.
- Columna **Cantidad**: en vez de un `<input type=number>` pelado, un **stepper** compacto
  `[ − ] [ N ] [ + ]` de ancho fijo `96px`, con los botones `−`/`+` de `28px` cuadrados.
- Columna **Costo** / **Venta**: ancho fijo `120px` cada una, `text-align:right`, prefijo `$` visualmente
  dentro del input (usando `padding-left` + un `::before` posicionado, o un span absoluto), formateado con
  separador de miles ARS al perder el foco.
- Columna **Markup %**: ancho fijo `84px`, sufijo `%` visual, `text-align:right`.
- Columna **Subtotal**: ancho fijo `120px`, solo lectura, `text-align:right`, peso 700.
- Columna **Acciones**: ancho fijo `56px`, dos íconos apilados o en fila (eliminar `🗑`, y si aplica, más
  adelante otras) con `title` tooltip — nunca texto "×" suelto sin padding/hitbox decente (mínimo `28x28px`
  de área clickeable).
- Fila entera: `min-height: 48px` fijo, `padding: 0 var(--tgs-space-2)`, `border-bottom:1px solid
  var(--tgs-border)` sutil entre filas (no solo depender del gap) para que se lea como tabla real.
- Encabezado de columnas: mismo grid de anchos que las filas (definilo una sola vez como constante de
  anchos y reusala para header y filas, para que NUNCA queden desalineados entre sí).
- Agregá el campo **Observación** por ítem (existe en el modelo `QuoteItem.observation` y hoy NO es editable
  en el modal — es una función faltante real): un ícono `📝`/`···` por fila que abre un mini-popover o
  expande una segunda línea con un `<textarea>` compacto solo para ese ítem, en vez de agregar otra columna
  ancha permanente (para no volver a saturar la fila).
- Footer de la tabla (no botones sueltos flotando): una fila final con dos botones alineados a la izquierda
  "+ Agregar de catálogo" y "+ Ítem libre", con el mismo padding que las filas de datos.
- El contenedor con scroll horizontal (`tgs-table-scroll`) debe tener un indicio visual de que hay más
  contenido a los costados si no entra (sombra sutil en los bordes al hacer scroll, o simplemente asegurate
  con el ancho `920px` del modal que en la mayoría de los casos NO haga falta scroll horizontal — recalculá
  los anchos fijos propuestos arriba y verificá que sumen ≤ 880px para que quepan sin scroll en el modal wide).

## 5. Selector/picker de producto y línea

- El picker de producto (hoy un modal anidado simple) pasa a mostrar, por cada resultado: nombre, precio de
  venta actual, y un indicador de línea/categoría — en una fila con jerarquía clara (nombre en
  `--tgs-font-base` peso 600, precio en `--tgs-font-sm` alineado a la derecha).
- Input de búsqueda del picker con foco automático al abrir (ya mencionado en §3, reforzalo acá).
- Estado vacío: si no hay resultados, mostrar mensaje claro ("No se encontraron productos con ese nombre")
  en vez de una lista vacía sin feedback.

## 6. Estados de carga, vacío y error — estandarizar en todo el panel

- Reemplazá cualquier texto plano "Cargando…" restante por `Skeleton` (ya existe el componente, usalo en
  TODOS los lugares que hoy no lo tengan: picker de producto, lista de líneas, timeline, notificaciones).
- Agregá un componente `EmptyState` simple (ícono/emoji + texto corto + acción opcional) para: sin
  resultados de búsqueda, sin colecciones, sin solicitudes listas, sin notificaciones, sin historial.
- Errores de red/API: usar siempre `Alert tone="bad"` con el mensaje real del backend (ya existe
  `errorMessage(e)`), nunca alertas nativas del navegador.

## 7. Notificaciones (rediseño del dropdown)

Hoy usa estilos inline ad hoc con posicionamiento absoluto manual. Reconstruilo como parte del sistema:
- Botón campana en el header con `Pill`/badge numérico ya existente, pero el dropdown en sí debe ser un
  panel con la misma estructura visual que un modal angosto (header "Notificaciones" + lista + footer con
  "Marcar todas como leídas" si aplica), usando `--tgs-surface`/`--tgs-border` tokens, no estilos inline.
- Cada notificación: ícono de estado por tipo (usar los mismos tonos de `Pill`: info/warn/bad/ok), texto,
  timestamp relativo corto ("hace 5 min"), y se marca leída al click.
- Usar `EmptyState` de §6 cuando no hay notificaciones.

## 8. Jerarquía de botones (consistencia final)
- Primario (`tgs-btn`, verde): UNA sola acción primaria visible por pantalla/sección a la vez (ej. "Guardar
  cambios" en el footer del modal). Evitá que dos botones verdes compitan en la misma vista.
  cambios" en el footer del modal). Evitá que dos botones verdes compitan en la misma vista.
- Secundario (`ghost`): navegación/cancelar/acciones no destructivas.
- Peligro (`danger`)/Advertencia (`warn`): ya definidos, mantenelos SOLO para lo que ya los usa (rechazar,
  eliminar, reactivar) — no los repartas en otros lados por accidente en la reescritura.
- Todo botón usa `height: var(--tgs-control-h-sm)` en variante `sm` y `--tgs-control-h-md` en la normal,
  con `padding` horizontal (no vertical) para controlar el ancho — la altura la da siempre la variable.

## 9. Harness de verificación visual (NUEVO — para que Claude y el usuario puedan revisar sin WhatsApp)

Agregá una página de previsualización standalone que NO depende de estar dentro de WhatsApp Web ni requiere
login: `apps/extension/preview.html` + `apps/extension/src/preview.tsx` como entrypoint adicional de Vite
(agregá `preview: 'preview.tsx'` a `rollupOptions.input` en `vite.config.ts`, y copiá/enlazá `preview.html`
para que sirva ese bundle). Esta página:
- Monta el `Panel` con datos de fixture (mock) en vez de llamar a la API real: creá
  `src/lib/fixtures.ts` con un `Quote` de ejemplo en estado `BORRADOR` y otro en `ENVIADO`, un `Customer`,
  notificaciones de ejemplo, líneas y productos de catálogo de ejemplo.
- Incluye controles simples arriba de la página (fuera del panel) para: alternar entre quote BORRADOR/ENVIADO,
  abrir directamente `QuickEditModal`, `CustomerModal`, `ConfirmModal` y el dropdown de notificaciones, sin
  tener que navegar todo el flujo — así se puede auditar visualmente cada pieza de forma aislada y rápida.
- Debe poder abrirse sirviendo `apps/extension/dist/preview.html` con cualquier server estático simple
  (documentá en `docs/EXTENSION.md` el comando exacto, por ejemplo `npx serve apps/extension/dist` o
  similar con lo que ya esté disponible en el repo — no agregues una dependencia nueva pesada solo para esto).
- Este harness es una herramienta de desarrollo/QA, no se empaqueta en el ZIP de producción de la extensión
  (excluilo del `zip-extension.ps1` / de `manifest.json`, que no lo referencia igual).

## 9.bis Navegación de vuelta a búsqueda/colecciones (gap funcional real, reportado por el usuario)

Hoy, en `content.tsx` línea ~1121, la tab **Presupuesto** hace: si `quote` está seteado, renderiza SOLO
`<QuoteDetail>` y oculta por completo `SearchQuotesSection`/`CollectionsSection`. Una vez que el vendedor
elige un presupuesto para un chat, **no tiene forma rápida de volver a buscar otro o mirar colecciones** —
tendría que encontrar algún mecanismo indirecto (cambiar de tab y volver, o ninguno). Esto es un defecto de
navegación real, no solo estético. Arreglalo así:

- Cuando `quote` está seleccionado dentro de la tab Presupuesto, agregá una **barra superior persistente**
  (sticky, arriba de `QuoteDetail`, dentro del área con scroll de la tab): a la izquierda un breadcrumb
  compacto "📄 {visibleNumber} · V{version}" con estado (`Pill`), a la derecha un botón `ghost` **"Cambiar
  presupuesto"** que limpia `quote` (`setQuote(null)`) y vuelve a mostrar `SearchQuotesSection` +
  `CollectionsSection` — sin perder el estado de detección de chat/cliente.
- Además, ese botón abre (o la barra se expande a) un **buscador inline compacto** de acceso directo: un
  input de búsqueda + lista corta de resultados (reusá `SearchQuotesSection`/su lógica de fetch, pero en
  presentación compacta tipo dropdown, no la sección completa) para poder cambiar de presupuesto en 1-2
  clics sin perder de vista que hay uno ya seleccionado.
- Agregá también acceso rápido a **colecciones favoritas/recientes** incluso con un quote seleccionado: una
  fila de chips compactos (nombre de colección, click abre la lista de esa colección en el buscador inline)
  visible arriba de `QuoteDetail` o dentro de esa misma barra expandible — no hace falta la sección completa
  `CollectionsSection`, alcanza con una versión resumida (favoritas primero, tope ~5 chips, "Ver todas" que
  expande el resto).
- Mantené además "recientes": los últimos 3-5 presupuestos vistos en la sesión actual (guardalos en estado
  local del `Panel`, no hace falta persistir en backend) como chips rápidos junto a las colecciones, para
  volver a uno anterior sin re-buscarlo.
- Regla de UX: **nunca debe quedar el vendedor sin una salida visible** para buscar/cambiar de presupuesto
  mientras está viendo el detalle de uno — esta barra debe estar siempre presente y accesible sin scroll
  extra cuando `quote !== null`.

## 10. Verificación de salida (Codex debe correr y reportar)
1. `pnpm --filter @tgs/extension typecheck` y `pnpm --filter @tgs/extension build` verdes (incluyendo el
   nuevo entrypoint `preview`).
2. `pnpm --filter @tgs/extension test` verde.
3. `pnpm extension:zip` verde y SIN el harness de preview adentro (confirmá el listado de archivos del zip).
4. Actualizá `docs/EXTENSION.md` con: el nuevo sistema de tokens (resumen), cómo abrir el preview harness
   para QA visual, y capturá en texto qué cambió estructuralmente en el editor de ítems (para que quede
   documentado por qué se resolvió el desalineado).
5. Reportá explícitamente los anchos fijos finales de columnas del editor de ítems y confirmá que su suma
   (+ gaps) entra dentro de los 920px del modal wide sin scroll horizontal en el caso común (sin línea +
   nombre corto).
6. NO declares terminado con typecheck/build/test rotos, ni si queda algún texto "Cargando…" plano sin
   `Skeleton`, ni si algún modal no sigue la estructura header/body/footer de 3 zonas.

## 11. Fuera de alcance
No toques apps/web/api/worker. No agregues dependencias de UI externas. No cambies la lógica de negocio ya
construida (versionado, retarget, adjunto de PDF, detección de envío) — solo su presentación y pulido.
