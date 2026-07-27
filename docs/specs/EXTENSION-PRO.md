# EXTENSION-PRO — Rediseño profesional de la extensión WhatsApp (spec autoritativa para Codex)

> Leé antes `docs/BUILD_PLAN.md` (invariantes). Este documento especifica mejoras puntuales sobre
> `apps/extension/src/*` YA EXISTENTE (content.tsx, background.ts, dom-selectors.ts, lib/api.ts,
> lib/types.ts, panel/ui.tsx). NO reescribas desde cero: extendé lo que funciona. Objetivo del usuario:
> "más intuitiva, editar presupuestos desde ahí, adjuntar PDFs mejor, modales para info compleja,
> que sea super pro". No hay envío automático de WhatsApp bajo ninguna circunstancia (README §28/30).

## 0. Estado actual (confirmado por auditoría)
- Panel es un único scroll largo de secciones (`Section`), sin tabs. Único modal real: `VersionEditModal`
  (edita solo el texto del mensaje cuando la versión ya fue ENVIADA). Todo lo demás usa `window.confirm`/`window.prompt`.
- No hay edición de ítems/cantidad/costo/markup/venta/línea/total/observación/flags PDF desde la extensión,
  pese a que la API ya expone `PUT /quotes/:id`, `POST /quotes/:id/retarget`, `POST /quotes/:id/prices`.
- No hay gestión de clientes (buscar/crear/vincular) pese a que `GET/POST/PUT /customers` ya existen.
- El adjunto de PDF es 100% manual: se descarga el archivo y el usuario lo arrastra a mano a WhatsApp.
  No se toca el `input[type=file]` de WhatsApp desde `dom-selectors.ts`.
- La detección de envío es 100% manual (crear intento + botones "Confirmar/No enviado/Ambiguo").
  `findLastOutgoingMessageText` existe en `dom-selectors.ts` pero no se usa.
- `POST /quotes/:id/replies` (intent: ACEPTA/RECHAZA/PIDE_CAMBIO/CONSULTA/AMBIGUA, con `applyState` opcional)
  existe pero la extensión nunca lo llama.

## 1. Reestructuración del panel: de scroll único a Tabs

Reemplazá el layout de scroll largo por **tabs horizontales** dentro del panel expandido (mismo shell/header/
colapsable de `ui.tsx`, agregar componente `Tabs`/`TabButton` al design system de `panel/ui.tsx` con el mismo
lenguaje visual dark ya definido — no inventes una paleta nueva).

Tabs:
1. **Chat** — `ChatDetectionCard` (detección actual) + búsqueda de cliente vinculado (ver §2) + accesos
   rápidos: "Solicitudes listas de este número", "Presupuestos de este cliente", notificaciones del chat.
2. **Presupuesto** — si hay un `quote` seleccionado: resumen compacto (número, versión, estado con `Pill`,
   total) + botón grande "Editar" (abre `QuickEditModal`, §3) + acciones de PDF (§4) + acciones de envío (§5)
   + cambio de estado (§6). Si no hay quote seleccionado: buscador + lista de resultados (lo que hoy es
   `SearchQuotesSection`) + solicitudes listas + colecciones, en sub-secciones colapsables dentro de la tab.
3. **Historial** — timeline unificado (lo que hoy es la sección de timeline al fondo de `QuoteDetail`),
   con filtro por tipo de evento.

Mantené: notificación bell en el header (fuera de las tabs, siempre visible), pill de conexión API.
Cada tab conserva su scroll propio, con altura máxima acorde al panel (`max-height: 86vh` ya existe).

Mostrar loading skeletons (no solo texto "Cargando…") para: búsqueda de presupuestos, lista de colecciones,
lista de solicitudes listas — usá un componente `Skeleton` simple (barras grises pulsantes) agregado a `ui.tsx`.

## 2. Gestión de cliente (nuevo, README §28.3-4)

En la tab **Chat**, debajo de `ChatDetectionCard`:
- Si el teléfono detectado matchea un cliente existente (`GET /customers` + filtro client-side por
  `normalizedPhone`, o si ya existe un endpoint de búsqueda por teléfono úsalo — revisá `apps/api/src/products.ts`
  `CustomerController`; si no existe búsqueda server-side por query, hacé el filtro en la extensión sobre la
  lista, ya que el volumen es bajo): mostrar tarjeta de cliente (nombre, teléfono, DNI) + botón "Ver presupuestos
  de este cliente" (filtra la búsqueda de presupuestos por `customerId`).
- Si no matchea ninguno: botón "Vincular o crear cliente" que abre `CustomerModal` (nuevo modal):
  - Tab interna "Buscar": input de búsqueda por nombre/teléfono/DNI sobre `GET /customers`, lista de resultados
    seleccionables, botón "Vincular" (asocia el customerId al request/quote actual vía `PUT /requests/:id` o
    `PUT /quotes/:id` según cuál esté activo).
  - Tab interna "Crear": formulario (nombre obligatorio, teléfono prellenado con el detectado, DNI opcional) →
    `POST /customers` → vincula automáticamente el nuevo cliente.
  - Detección de duplicados: antes de crear, si `POST /customers` devuelve conflicto o si hay match por
    teléfono normalizado ya visible en la búsqueda, mostrar alerta "Ya existe un cliente similar" con opción
    de usar el existente en vez de crear uno nuevo.

## 3. Edición rápida completa — `QuickEditModal` (README §29, EL PUNTO CENTRAL DEL PEDIDO)

Nuevo modal grande (más ancho que los modales actuales, usar `.tgs-modal` pero con `max-width` mayor y
`max-height: 80vh; overflow-y:auto` para que quepa una tabla de ítems). Se abre desde un botón destacado
"Editar presupuesto" en la tab Presupuesto. Estructura en sub-tabs internas (reutilizá `Tabs` de §1):

**Sub-tab Ítems** (tabla compacta, una fila por `QuoteItem`):
- Columnas: línea (select de `PcLine`), nombre (si `productId` es null, editable; si tiene producto,
  mostrar nombre + badge "vinculado a catálogo"), cantidad (input numérico), costo (input moneda ARS,
  formateado `Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'})`), markup % (input, se muestra
  como porcentaje pero internamente son bps: `bps/100`), venta (input moneda), subtotal (solo lectura,
  recalculado en vivo cliente-side con las mismas fórmulas de `packages/pricing` — replicá
  `saleFromCost`/`markupFromPrices` en `lib/pricing.ts` de la extensión, mismo criterio: enteros/centavos/bps,
  NUNCA floats para el cálculo final, redondeo consistente con el backend), botón eliminar fila, botón
  "reemplazar producto" (abre buscador de catálogo `GET /products?q=`, al elegir reemplaza nombre/línea/costo
  manteniendo cantidad y recalculando venta con el markup vigente del ítem).
- Botón "+ Agregar ítem" (buscador de catálogo o ítem libre sin producto).
- Al guardar: `PUT /quotes/:id` con `items: [...]` completo (reemplaza todos los ítems, así es como lo espera
  el endpoint hoy — no hagas PATCH parcial de un solo ítem por este medio).
- Reglas bidireccionales igual que el README §6 al editar un campo de un ítem: cambia costo→recalcula venta
  manteniendo markup; cambia markup→recalcula venta; cambia venta→recalcula markup. Implementalo en el estado
  local del modal antes de enviar.

**Sub-tab Total objetivo**:
- Input "Total deseado" (moneda ARS) + botón "Previsualizar" → llamá **en modo preview** las mismas fórmulas
  de retarget del lado cliente (replicá `retarget` de `packages/pricing` en `lib/pricing.ts`, mismo algoritmo:
  factor de ganancia, reparto determinístico del residuo) para mostrar la tabla de ítems con precios nuevos
  ANTES de confirmar. Botón "Aplicar" → `POST /quotes/:id/retarget { targetTotalCents }` (la fuente de verdad
  es siempre el backend; el preview cliente es solo para UX, no reemplaza la llamada real).
- Mostrar errores de validación en español: total objetivo no puede ser menor al costo total, etc. (igual que
  errores que ya devuelve el backend — mapealos, no inventes texto distinto).

**Sub-tab Configuración PDF y observación**:
- Toggles triestado (HEREDAR/MOSTRAR/OCULTAR) para los campos de `resolvedPdfConfig` que ya existan en el
  tipo (revisá `lib/types.ts` / respuesta de quote para los nombres exactos de campos de `resolvedPdfConfig`).
  Usá un componente `TriStateToggle` (tres botones pequeños agrupados) en el design system.
  Nota importante: los cambios acá son **por versión** y solo tienen efecto real la próxima vez que se genere
  el PDF (README §19: "al crear una versión, resolver y congelar"). Si la versión ya generó PDFs, mostrar aviso
  "Los PDFs ya generados no cambian; generá uno nuevo para aplicar estos cambios".
- Textarea de observación pública (`publicObservation`).
- Guardar → `PUT /quotes/:id { resolvedPdfConfig, publicObservation }`.

**Regla de versionado (ya existe en `VersionEditModal`, reutilizala acá también)**: si `version.state !== "ENVIADO"`
todo lo anterior edita el borrador directamente. Si `version.state === "ENVIADO"`, el modal debe advertir
claramente arriba ("Esta versión ya fue enviada — los cambios crearán la versión N+1") y, al guardar, en vez de
`PUT /quotes/:id` llamar `POST /quotes/:id/version` con los ítems/campos modificados como payload inicial de la
nueva versión (mismo patrón que ya usa `VersionEditModal` para el mensaje). Un único guardado, un único
resultado: no dupliques botones de guardar por sub-tab.

**Botón "Abrir editor completo"**: en la cabecera del modal, un link/botón que abra en una nueva pestaña
`${WEB_APP_URL}/quotes/${familyId}` (agregá `WEB_APP_URL` a la config de la extensión si no existe; fallback
razonable `http://localhost:3000` en dev) — para cambios grandes que excedan lo que cubre el modal rápido.

## 4. Adjunto de PDF real (README §30)

En `dom-selectors.ts`, agregar función `attachFileToComposer(file: File): Promise<boolean>`:
- Localizar el botón de adjuntar/clip de WhatsApp Web (agregar sus selectores al mismo esquema
  primary/testid/aria-fallback que ya usa `detectChat`), abrir el menú de adjuntos, localizar el
  `input[type=file]` correspondiente a "Documento" (no "Foto y video", los PDF deben ir como documento),
  construir un `DataTransfer` con el `File`, asignar `input.files = dataTransfer.files`, disparar evento
  `change` (`new Event('change', {bubbles:true})`). Devolver `true` si cada paso encontró su elemento,
  `false` en cualquier paso fallido (sin excepciones sin capturar).
- En `content.tsx`, nuevo flujo `handleAttachPdf(kind)`:
  1. Asegurar que el PDF existe (reusar `handlePreparePdf` si `pdfReady[kind]` es falso).
  2. Descargar el blob autenticado (nuevo mensaje al background `FETCH_BLOB` con la URL del PDF y
     `credentials:'include'`, devolver el blob/arrayBuffer al content script — no se puede hacer fetch
     cross-origin autenticado directo desde el content script por CSP de WhatsApp; el background sí puede).
  3. Construir `File` desde el blob con nombre `${visibleNumber}-V${version}-${kind}.pdf`.
  4. Llamar `attachFileToComposer(file)`.
  5. Si `true`: mostrar `Alert` tono "ok" ("PDF adjuntado. Revisá el mensaje antes de enviar.").
  6. Si `false`: **fallback explícito** — mostrar `Alert` tono "warn" con texto claro
     ("No pudimos adjuntar el PDF automáticamente (cambio de interfaz de WhatsApp). Descargalo y adjuntalo
     manualmente.") + botón "Descargar PDF" (el `handleDownloadPdf` que ya existe) + botón "Abrir PDF"
     (nueva pestaña con la URL autenticada vía background). Nunca fallar en silencio.
- Insertar el texto del mensaje (`insertMessageIntoComposer`, ya existe) ANTES de intentar el adjunto, en la
  misma acción del usuario (un solo botón "Preparar mensaje y PDF" que hace ambos pasos en secuencia).

## 5. Detección de envío real (README §31)

En `dom-selectors.ts`, activar y extender `findLastOutgoingMessageText` (ya existe) con
`observeOutgoingMessage(chatId, expectedTextFragment, timeoutMs): { stop(): void }` que:
- Instancia un `MutationObserver` acotado al contenedor de mensajes del chat activo (no `document.body` entero
  como hace hoy el observer de detección de chat — usar un observer separado y más targeted para esto).
- En cada mutación, busca el último mensaje saliente; compara contra `expectedTextFragment` (normalizado,
  ignorando espacios) y, si hay adjunto, intenta leer el nombre de archivo visible en la burbuja del mensaje.
- Calcula una **confianza** 0-100: 100 si texto coincide Y se detectó adjunto con nombre compatible; ~70 si
  solo coincide el texto; ~40 si hay un mensaje saliente nuevo pero no concluyente. Igual criterio de
  "nunca ocultar que se usó fallback" que ya aplica `detectChat`.
- Se detiene solo (`stop()`) al confirmar, al cambiar de chat, o al superar `timeoutMs` (p.ej. 45s).

En `content.tsx`, tras `handleAttachPdf` + inserción de mensaje exitosos: en vez de requerir que el usuario
cree el intento manualmente, crear automáticamente el `QuoteSendAttempt` (`POST /quotes/:id/send-attempts`)
y arrancar `observeOutgoingMessage`. Cuando el observer resuelve:
- confianza ≥ 70 → auto-resolver el intento (`PUT/POST resolve` existente) como `CONFIRMADO_AUTO`, mostrar
  `Alert` tono ok "Envío detectado y confirmado automáticamente", y disparar el cambio de estado a ENVIADO
  (ya existe el endpoint de estado) — pero SIEMPRE mostrando la confirmación en UI, nunca sin feedback visible.
- confianza < 70 o timeout → dejar el intento `PENDIENTE`/`AMBIGUO` y mostrar la UI de confirmación manual que
  YA EXISTE (`handleResolveAttempt` con botones Confirmar/No enviado/Ambiguo) con el mensaje
  "No pudimos confirmar automáticamente el envío. ¿Se envió correctamente?" (texto exacto del README §31).
- El usuario SIEMPRE puede corregir manualmente un resultado automático (dejar visibles los 3 botones de
  resolución incluso después de una auto-confirmación, con un aviso "confirmado automáticamente, tocá acá si
  fue un error").

## 6. Aceptación/rechazo asistido (README §32)

Nuevo botón en la tab Presupuesto (visible cuando `version.state === 'ENVIADO'`): "Analizar última respuesta".
- Toma el último mensaje entrante del chat (agregar `findLastIncomingMessageText` simétrico al saliente en
  `dom-selectors.ts` si no existe ya algo equivalente).
- Clasificación **determinística primero** (regex simple en español: palabras como "dale", "acepto", "sí" vs
  "no", "caro", "en otro lado" vs "podés bajarlo", "una consulta") con fallback a IA solo si está habilitada en
  settings (reusar el servicio de IA existente si hay uno de intención/respuesta; si no hay endpoint de
  clasificación de intención en el backend, NO lo inventes en la extensión — llamá `POST /quotes/:id/replies`
  con `source: 'MANUAL'` o `'HEURISTICA'` según corresponda y dejá `intent` como el mejor candidato detectado,
  SIN `applyState` todavía).
- Mostrar el resultado como `Alert` con el intent detectado (`ACEPTA`/`RECHAZA`/`PIDE_CAMBIO`/`CONSULTA`/`AMBIGUA`)
  y **acciones de confirmación rápida** (no `window.confirm`): botones "Marcar como Aceptado"/"Marcar como
  Rechazado"/"Fue una consulta, no cambiar estado" — al confirmar, volver a llamar `/replies` (o reusar el ya
  creado) con `applyState` seteado al estado correspondiente. Nunca cambiar el estado solo por el mensaje
  entrante sin esta confirmación explícita del vendedor.
- Reemplazá TODOS los `window.confirm`/`window.prompt` restantes (cambio de estado, reactivar, etc.) por
  modales pequeños del design system (`ConfirmModal` genérico: título, cuerpo, botón primario con el tono
  correspondiente —`danger` para RECHAZADO, `warn` para reactivar, `ok` para ACEPTADO— y botón cancelar ghost).

## 7. Jerarquía visual de acciones delicadas
- Botones de cambio de estado a ACEPTADO/RECHAZADO/REEMPLAZADO deben usar `button.tgs-btn.danger`/`.warn`
  ya existentes en el design system, no el estilo neutro genérico que usan hoy.
- Acciones "seguras" (buscar, ver, filtrar) sin confirmación; acciones "delicadas" (cambiar estado, reactivar,
  eliminar ítem en el modal, crear versión) siempre con el `ConfirmModal` de §6.

## 8. Verificación de salida (Codex debe correr y reportar)
1. `pnpm --filter @tgs/extension typecheck` y `pnpm --filter @tgs/extension build` verdes.
2. `pnpm --filter @tgs/extension test` si existen tests de la extensión (agregar tests unitarios para
   `lib/pricing.ts` réplica cliente-side: mismos casos que `packages/pricing` para las fórmulas usadas en vivo).
3. `pnpm extension:zip` genera el ZIP sin errores.
4. Documentar en `docs/EXTENSION.md` el nuevo flujo de tabs, el adjunto automático + fallback, y la detección
   de envío con umbrales de confianza. Documentar en `docs/DECISIONS.md` cualquier decisión menor (p.ej. si
   `WEB_APP_URL` se agrega como variable de manifest/config).
5. NO declarar terminado con typecheck roto, build roto, o si algún `window.confirm`/`window.prompt` sigue
   usándose para acciones delicadas.

## 9. Fuera de alcance
No tocar apps/web, apps/worker, apps/api (salvo que falte un endpoint estrictamente necesario y documentado
en DECISIONS.md — preferí adaptarte a lo que ya existe). No implementar envío automático real de WhatsApp.
No agregar dependencias pesadas nuevas (nada de frameworks de UI externos; seguí con React + CSS-in-JS simple
como ya está en `panel/ui.tsx`).
