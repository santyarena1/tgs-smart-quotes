# Extensión Chrome (WhatsApp Web)

Panel Manifest V3 inyectado en `https://web.whatsapp.com`. Asiste al vendedor, pero **nunca pulsa Enviar**.

## Flujo profesional

El panel expandido usa tres tabs con scroll propio:

- **Chat:** detección y confianza del chat, cliente coincidente, modal para buscar/crear/vincular clientes, solicitudes listas, creación rápida y notificaciones del número.
- **Presupuesto:** buscador, solicitudes y colecciones cuando no hay selección; al seleccionar muestra resumen, editor rápido, PDF/mensaje, intentos y estados.
- **Historial:** timeline unificado con filtro por tipo de evento.

El editor rápido tiene subtabs para ítems, total objetivo y configuración PDF/observación. Permite cantidad, costo, markup, venta, línea, producto de catálogo, ítems libres y eliminación confirmada. Los cálculos de UX usan centavos `bigint` y bps; el backend sigue siendo la fuente de verdad. Si la versión está `ENVIADO`, un único guardado crea automáticamente la versión siguiente; en borrador usa `PUT /quotes/:id`.

## PDF y envío asistido

“Preparar mensaje y PDF” inserta primero el texto, genera/recupera el PDF autenticado mediante el service worker e intenta cargarlo en el input Documento de WhatsApp usando `DataTransfer`. Si los selectores cambiaron, muestra un aviso visible con acciones **Descargar PDF** y **Abrir PDF**; nunca falla en silencio.

Después de preparar se crea un `QuoteSendAttempt` y un `MutationObserver` limitado al contenedor del chat observa un mensaje saliente durante 45 segundos:

- Confianza `100`: texto y nombre de adjunto compatibles.
- Confianza `70`: coincide el texto.
- Confianza `40`: apareció un saliente nuevo, pero no es concluyente.
- `>=70` confirma automáticamente el intento y lo informa en pantalla.
- `<70` o timeout conserva la revisión manual con Confirmar / No enviado / Ambiguo.

La respuesta entrante se clasifica primero con reglas determinísticas. Sólo un resultado ambiguo intenta el endpoint opcional de IA. El estado nunca cambia sin confirmación explícita del vendedor mediante los modales del panel.

## Configuración

`VITE_WEB_APP_URL` define el origen usado por “Abrir editor completo”; el fallback de desarrollo es `http://localhost:3000`.

## Empaquetado

```bash
pnpm extension:zip
```

Genera `apps/extension/tgs-extension.zip` y `storage/extension/tgs-extension.zip`.

La conexión se comprueba desde Configuración o con el botón **Probar** del panel. ID estable: `edfnidnbmlepdddpofocidojlfphjdkc`.
## Reconstrucción visual y navegación

El panel usa un sistema único de tokens CSS para superficies, texto, estados, espaciado en escala de 4 px, radios, tipografía y alturas de control. Inputs, selects y botones de una línea tienen alturas fijas (`28/34/40 px`), evitando que padding o textos auxiliares desplacen columnas.

Todos los modales comparten tres zonas: header con título/subtítulo/cierre, body con scroll y footer fijo. Se cierran con Escape, enfocan el primer control al abrir y mantienen las acciones visibles. Los estados de carga usan `Skeleton`; vacíos y errores usan `EmptyState` y `Alert`.

El editor de ítems dejó de mezclar inputs con conversiones debajo. Header y filas reutilizan exactamente esta grilla: línea `100`, producto `min 180`, cantidad `96`, costo `100`, markup `68`, venta `100`, subtotal `104` y acciones `48` px. Con siete gaps de `4 px` y padding lateral de `16 px`, el ancho común mínimo es `840 px`, dentro de los `880 px` útiles del modal de `920 px`. Cada fila tiene controles de `34 px`, mínimo `48 px`, stepper de cantidad, moneda/porcentaje embebidos y observación expandible por ítem.

Mientras hay un presupuesto activo, una barra sticky conserva siempre visible el breadcrumb, estado y “Cambiar presupuesto”. Al expandirla ofrece búsqueda compacta, hasta cinco colecciones rápidas y los últimos cinco presupuestos vistos durante la sesión.

## Preview visual sin WhatsApp

El build genera `dist/preview.html` con fixtures BORRADOR/ENVIADO y controles para abrir QuickEditModal, CustomerModal, ConfirmModal y notificaciones. No requiere API ni login para renderizarse.

```bash
pnpm --filter @tgs/extension build
pnpm --dir apps/extension exec vite preview
```

Luego abrir la URL local indicada por Vite y entrar a `/preview.html`. El harness y `preview.js` se excluyen explícitamente de `pnpm extension:zip`. La extensión de producción conserva `content.js` autocontenido.
## Detección actual de chat y memoria de sesión

La prioridad vigente usa primero `[data-testid='conversation-header']` y su título `[data-testid='conversation-info-header-chat-title']`. La auditoría en WhatsApp Web encontró cuatro `<header>` en orden DOM: `chatlist-header`, `chatlist-header`, sin `data-testid` (`null`) y `conversation-header`. Por eso el selector genérico `header` devolvía incorrectamente la cabecera lateral; el único respaldo genérico queda ahora limitado a `#main header`.

En contactos guardados, WhatsApp no expone pasivamente el teléfono en la cabecera. Los `data-id` modernos son hashes opacos y el patrón legado `@c.us` puede no aparecer. Si se detecta el nombre pero no el número, el panel lo informa como una limitación esperada y pide completarlo manualmente; no abre automáticamente la información del perfil.

Durante la vida del content script, el panel recuerda en memoria el presupuesto elegido por chat. La clave usa primero el teléfono normalizado y, cuando no está disponible, el nombre normalizado. Al cambiar de conversación guarda la selección anterior, limpia el estado para chats nuevos y restaura por ID la selección de un chat ya visitado. No se persiste en backend ni en storage.
## Solicitudes listas del chat

La tab Chat prioriza como primera sección las solicitudes `LISTA` que corresponden a la conversación activa. El filtro se hace en la extensión sobre `GET /requests`: coincide por `customerId` cuando existe cliente identificado o por teléfono normalizado contra `detectedPhone`. No se muestran solicitudes listas de otros contactos.

Cuando la solicitud tiene una familia de presupuesto asociada, el ítem muestra su número y la acción “Abrir para enviar →”. Al seleccionarlo se carga el presupuesto y se cambia automáticamente a la tab Presupuesto, donde quedan disponibles el mensaje, PDF y seguimiento de envío.

La detección de contacto se presenta compacta por defecto: estado, nombre, teléfono y acción Editar en una sola línea. La confianza, advertencia, campos manuales y selector utilizado aparecen únicamente al expandirla. Un fallo total de detección mantiene un indicador visible aun estando colapsada.