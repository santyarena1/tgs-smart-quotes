# Extensión Chrome — Documentación exhaustiva de la lógica de automatización

> **Estado:** congelada. Esta extensión (`apps/extension`) se reemplaza por el CRM + WhatsApp
> Cloud API. Este documento existe para que **no se pierda ni una sola decisión** de comportamiento
> antes de borrarla. Cada sección cierra con el equivalente en el mundo Cloud API.
>
> **No borrar `apps/extension` hasta que el circuito por API esté funcionando y verificado en
> producción.** Mientras tanto convive como red de contención.

---

## 0. Por qué existía y qué resolvía

WhatsApp Web no expone ninguna API. La extensión era un **robot de interfaz**: leía el DOM de
`web.whatsapp.com`, decidía consultando a la API de TGS, y escribía de vuelta en el DOM simulando
a un humano.

Todo lo verdaderamente valioso —persona, reglas, escalación, memoria por conversación, reutilización
de respuestas, creación de solicitudes, recontactos— **ya vivía en el servidor** (`POST /chatbot/respond`).
La extensión aportaba exclusivamente **transporte y percepción**:

| Capa | Dónde vivía | ¿Se conserva? |
|---|---|---|
| Decisión (qué responder, cuándo escalar, memoria) | API TGS + OpenAI | **Sí, intacta** |
| Percepción (¿llegó un mensaje? ¿de quién? ¿qué dice?) | DOM scraping | **Se reemplaza por webhook** |
| Transporte (enviar texto, adjuntar archivos) | DOM + eventos sintéticos | **Se reemplaza por Graph API** |
| Orquestación (a quién atender, en qué orden, con qué ritmo) | Loop en el navegador | **Se reemplaza por cola server-side** |

La consecuencia arquitectónica clave: **el cerebro no se toca**. Lo que sigue documenta la percepción,
el transporte y la orquestación, que sí se reescriben.

---

## 1. Arquitectura de procesos

Tres contextos de ejecución aislados, porque el content script de una extensión MV3 no puede ni
hacer `fetch` cross-origin confiable (CSP de WhatsApp) ni acceder a los objetos JavaScript de la página.

```
┌─────────────────────────────────────────────────────────────────┐
│ background.ts — Service Worker MV3                              │
│ Único que puede: fetch a la API TGS, descargas, abrir pestañas.  │
│ NUNCA automatiza WhatsApp. Solo proxy + descarga.                │
└───────────────▲─────────────────────────────────────────────────┘
                │ chrome.runtime.sendMessage
┌───────────────┴─────────────────────────────────────────────────┐
│ content.tsx + dom-selectors.ts — Content Script (mundo aislado)  │
│ Ve el DOM, NO ve las variables JS de la página.                  │
│ Loop de escaneo, cola, panel React, observers.                   │
└───────────────▲─────────────────────────────────────────────────┘
                │ window.postMessage (puente)
┌───────────────┴─────────────────────────────────────────────────┐
│ injected.ts — script inyectado en el MUNDO DE LA PÁGINA          │
│ Único que alcanza `element.__lexicalEditor` para escribir texto. │
└─────────────────────────────────────────────────────────────────┘
```

### 1.1 `background.ts` — el proxy

Mensajes que atiende:

| Tipo | Qué hace |
|---|---|
| `PING` | `probeConnection()`: verifica `/health`, después `/auth/me`. Distingue tres fallos: API caída, API viva pero sin sesión (401 → "iniciá sesión en {WEB_ORIGIN}"), y error HTTP. |
| `API` | `fetch` con `credentials: "include"`. Devuelve `{ok, status, data}`; si el body no es JSON lo envuelve en `{message: text}`. |
| `FETCH_BLOB` | Descarga binaria (PDFs, imágenes) y la serializa como `Array<number>` — los `ArrayBuffer` no cruzan el puente de mensajes de Chrome. |
| `OPEN_URL` | `chrome.tabs.create`. |
| `DOWNLOAD` | `chrome.downloads.download`, fallback cuando adjuntar al DOM falla. |
| `onMessageExternal` `TGS_PING` | Permite que la web TGS pregunte "¿está instalado el plugin?". |

Config por build: `VITE_API_BASE`, `VITE_WEB_APP_URL`.

> **Cloud API:** este contexto desaparece por completo. La sesión ya no es una cookie del navegador
> del vendedor: la API habla con Meta con su propio token cifrado.

### 1.2 `injected.ts` — el puente Lexical

WhatsApp usa el editor **Lexical** de Meta. Escribir con `element.textContent = "..."` o disparar
eventos `input` **no funciona**: Lexical mantiene su propio estado interno y sobrescribe el DOM.
La única forma es tomar `composer.__lexicalEditor` y llamar a su API — y esa propiedad solo existe
en el mundo JS de la página, invisible para el content script.

Acciones del puente: `insert`, `clear`, `insertEmpty` (limpiar + insertar), `insertCaption`
(pie de foto del visor de adjuntos), `pasteFile`.

`EMPTY_STATE` es el JSON serializado de un documento Lexical vacío — la forma canónica de vaciar
el cuadro de texto.

`tgsPasteFile()` construye un `File`, lo mete en un `DataTransfer`, fabrica un `ClipboardEvent`
de tipo `paste` y le **redefine la propiedad `clipboardData`** (que es de solo lectura) para
inyectar el archivo. Es la manera de adjuntar un archivo sin abrir el diálogo nativo del sistema.

`tgsCaptionComposer()` busca el composer del pie de foto probando siete selectores por idioma
(`coment`, `caption`, `pie de foto`), excluye el composer normal, exige `offsetParent !== null`
(visible) y que tenga `__lexicalEditor`.

> **Cloud API:** todo esto desaparece. `POST /messages` con `{type:"text"}` o `{type:"document", caption}`.

---

## 2. Percepción del DOM (`dom-selectors.ts`, 1196 líneas)

El principio rector, escrito en su cabecera: **WhatsApp cambia su DOM sin previo aviso, así que TODA
lectura de la página vive acá adentro, versionada, con fallbacks y un puntaje de confianza 0-100.
Nunca se debe silenciar un fallo de detección.**

`SELECTOR_VERSION = "2026-08-toolbar-v2"` — se estampa en cada mensaje de error para poder correlacionar
"se rompió tal día" con "WhatsApp cambió el DOM".

### 2.1 Detección del chat abierto — `detectChat()`

Dos estrategias en orden; la primera que encuentra un `header` gana:

1. `conversation-testid`: `[data-testid='conversation-header']`
2. `fallback-main`: `#main header`

**Cálculo de confianza:**
- nombre presente: +40
- teléfono desde `data-id` (formato `NNNN@c.us`): +55
- teléfono desde el texto del header (regex): +35
- si se usó la estrategia de respaldo: el total se multiplica por **0.7**

**Trampas documentadas en el propio código (bugs reales que costaron caro):**

- ❌ **Nunca usar `span[title]` en el header.** El único `span[title]` del header es el estado
  ("en línea"). Como `querySelector` con coma devuelve el primero en el DOM, tomaba "en línea"
  como nombre del contacto y rompía `waitForActiveChat` con "WhatsApp no confirmó el cambio".
- ❌ **Nunca buscar `[data-id]` en todo el `document`.** Tomaba el primer teléfono del panel lateral
  y lo conservaba al cambiar de chat.
- ℹ️ El formato `@c.us` es **legado**: los `data-id` actuales suelen ser hashes opacos. Por eso para
  contactos guardados frecuentemente no hay teléfono y hay que pedirlo a mano
  (`warning: "No pudimos detectar el teléfono automáticamente…"`).

### 2.2 Identidad de conversación — `chatKey`

Función crítica: es la clave primaria de `ChatbotConversation`.

```
chatIdentity(phone, name):
  digits = phone sin no-dígitos
  si digits  → "tel:{digits}"
  si no      → "name:{nombre normalizado}"     // NFD, sin acentos, minúsculas es-AR, espacios colapsados
  si ninguno → ""                              // sin identidad: el bot no opera
```

El fallback `name:` es una **deuda estructural**: dos contactos homónimos colapsan en la misma
conversación, y si el contacto se renombra la memoria se pierde.

> **Cloud API:** el problema se elimina de raíz. Meta siempre entrega `wa_id` (el teléfono en
> formato E.164 sin `+`). **`chatKey` pasa a ser siempre `tel:<wa_id>`; el prefijo `name:` deja de
> existir.** Requiere una migración de datos para las conversaciones históricas con clave `name:`.

### 2.3 Lista lateral de chats — `detectChatList()`

Estrategias: `testid-cell-frame` (confianza 95) y `pane-side-gridcell` (confianza 70).

Por fila extrae: `chatKey`, `name`, `preview`, `unreadCount`, `lastDirection`, `needsReply`.

**Trampas documentadas:**

- ❌ `cell-frame-title` **ya no es el nombre**: WhatsApp lo cambió y ahora contiene el conteo de
  no-leídos. Usarlo corrompía nombre y `chatKey`. Se usa `span[title]`.
- ❌ `last-msg-status` **no sirve como indicador de saliente**: existe en TODAS las filas. Usarlo
  marcaba todo como `OUTGOING` y el bot no procesaba nada.
- ✅ La señal fiable de "el último mensaje es mío" es `rowLastMessageOutgoing()`: WhatsApp dejó de
  usar `data-icon='msg-check'` y ahora pone `<svg><title>wds-ic-check|wds-ic-dblcheck|wds-ic-read</title>`
  dentro de `[data-testid='last-msg-status']`. Esos títulos aparecen **solo** en salientes.
  Otros como `wds-ic-sticker` son tipo de contenido y no cuentan. Sin este arreglo, el selector
  viejo no matcheaba nada y toda la lista quedaba "Pendiente respuesta".

`lastDirection` se resuelve: `OUTGOING` si `rowLastMessageOutgoing()`; `INCOMING` si hay preview;
`UNKNOWN` si no hay ninguna señal.

### 2.4 Navegación entre chats — `switchToChat()`

**La trampa más cara del proyecto.** WhatsApp navega con el handler `onMouseDown` de la fila,
**no** con `onClick`. `Element.click()` (que solo emite un evento `click`) no cambiaba de conversación:
el recorrido automático quedaba atascado en el chat activo, `waitForActiveChat` siempre daba timeout
y el modo prueba dejaba **cero borradores**.

`fireRowNavigation()` emite la secuencia completa `mousedown` → `mouseup` → `click`, con
coordenadas reales calculadas desde `getBoundingClientRect()`, `bubbles`, `cancelable`, `composed`,
`view: window`, `button: 0`. Se dispara sobre el **título** (un nodo hoja) para que el evento burbujee
hasta el handler de la fila.

`waitForActiveChat(chatKey, timeoutMs, expectedDisplayName)` hace polling cada 100 ms y acepta la
confirmación por tres vías: `chatKey` exacto, coincidencia de nombre normalizado, o coincidencia con
el `displayName` esperado.

`searchChatList(query)` es el fallback para chats no renderizados en el DOM (virtualización de lista):
busca el input de búsqueda por heurística de idioma (`/buscar|search/i` sobre `aria-label`,
`aria-placeholder`, `placeholder`, `data-tab`), y para inputs nativos usa el
**setter del prototipo** (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set`)
porque asignar `.value` directamente no dispara los listeners de React.

> **Cloud API:** no existe el concepto de "chat activo". Cualquier conversación se atiende en
> cualquier momento, en paralelo, sin navegar. **Todo el capítulo 2.4 desaparece** — y con él la
> restricción de que el bot solo podía atender un chat por vez.

### 2.5 Lectura de mensajes — `readMessageRecords()`

Filas: `#main [data-testid='msg-container']`, con fallback legacy `div.message-in / div.message-out`.

**Resolución de dirección en cascada** (`directionMethod` queda registrado para auditoría):

1. `tail` — `[data-testid='tail-out']` / `tail-in`. La cola del globo. Señal primaria.
2. `legacy-class` — clases `message-in` / `message-out`.
3. `sender-crosscheck` — en mensajes agrupados (sin tail), busca otro container **del mismo remitente**
   (leído de `data-pre-plain-text`) que sí tenga tail, eligiendo el más cercano por distancia de índice.
4. `group-neighbor` — hereda del vecino explícito, **solo si no hay contradicción** entre el anterior
   y el siguiente.
5. `unknown` — **queda UNKNOWN antes que adivinar**. Invariante deliberado: una dirección mal
   adivinada hace que el bot le conteste a su propio mensaje.

**Tipo de contenido:** `AUDIO` si matchea alguno de 11 selectores de audio/PTT (por `data-testid`,
`data-icon` y `aria-label` en dos idiomas); `TEXT` si hay texto; `OTHER` si no.

**`fingerprintSeed = "{stableId}|{text}"`**, donde `stableId` sale de `data-id`, o del `data-id` de un
hijo, o de `data-pre-plain-text`. Es la base de la deduplicación: se combina con el `chatKey` y se
hashea (`fingerprint()` en `content.tsx`) para producir el `messageFingerprint` que la API usa
en el índice único `@@unique([conversationKey, inboundFingerprint, direction])`.

**Filtro de salientes automáticos** — `isAutomatedOutbound()`, tres criterios:

1. **Tarjeta de anuncio** (`isAdOriginGreetingCard`): WhatsApp Business inserta una tarjeta saliente
   automática al abrir conversaciones que vienen de un anuncio. Tiene `tail-out` pero no es una
   respuesta del comercio. Sin filtrarla, tapaba el mensaje entrante que originó el chat.
   Se exige dirección saliente **+** mención de plataforma (`/anuncio de (instagram|facebook)/`)
   **+** una acción de detalles (`/ver detalles/` o presencia de `button`/`a`) — las tres, para no
   confundir un mensaje normal que casualmente hable de un anuncio.
2. **Selectores de programado/automático** (`ic-schedule`, `data-testid*='scheduled'`, etc.).
3. **`ignoredAutoMessages`** configurable: `matchesConfiguredAutoMessage()` normaliza agresivamente
   (NFD, sin puntuación, minúsculas) y matchea por prefijo bidireccional **o** por
   **cobertura de palabras ≥ 85 %** (exigiendo ≥3 palabras y ≥4 caracteres para evitar falsos
   positivos). Default: `["¡Hola! ¿Cómo podemos ayudarte"]`.

`findRecentMessageSnippets(limit, excludeSeed, ignoredAutoMessages)` arma el contexto conversacional
que se manda a la IA: solo mensajes conversacionales, con dirección conocida, excluyendo el mensaje
actual, tomando los últimos `limit` (`maxRecentSnippets`, default 20). Los audios se representan
como `"[Mensaje de audio sin transcripción]"`.

> **Cloud API:** el webhook entrega `wa_id`, `id`, `type`, `text.body`, `timestamp` y el nombre del
> perfil, **estructurados y sin ambigüedad**. Desaparecen: la cascada de dirección (el webhook solo
> trae entrantes), el `fingerprintSeed` (lo reemplaza `message.id` de Meta, globalmente único),
> y la tarjeta de anuncio (llega como `referral`, un campo explícito).
> **Sobrevive `ignoredAutoMessages`**, que sigue siendo útil si hay respuestas automáticas
> configuradas del lado de Meta. El contexto reciente pasa a leerse de `ChatbotMessageLog`
> en vez de scrapearse del DOM — **más fiable, porque el log tiene todo el historial y el DOM solo
> lo renderizado**.

### 2.6 Confirmación de envío — los observers

Nunca se asume que un envío ocurrió: se **observa** que apareció el mensaje saliente.

`observeOutgoingMessage(chatId, expectedText, timeoutMs, onResult, expectedFilename)`:

| Confianza | Condición |
|---|---|
| 100 | coinciden el texto **y** el nombre del archivo adjunto |
| 70 | coincide el texto (primeros 180 caracteres, normalizados) |
| 40 | apareció un saliente nuevo, pero no coincide |
| 0 | timeout sin ningún saliente nuevo |

Se acepta con `>= 70`. El observer se auto-cancela si cambia el chat activo.

`observeNextOutgoingMessage(chatId, timeoutMs, onResult)` es la variante para **envíos humanos**:
confía en cualquier saliente nuevo (confianza 90) porque el operador pudo haber editado el texto
de la sugerencia antes de enviarlo.

> **Trampa documentada:** `observeNextOutgoingMessage` compara contra el id **crudo** del chat activo
> (`phone || name`), no contra el `chatKey` normalizado (`name:lucas`). Pasarle el `chatKey` hacía
> que su guardia interna creyera que cambiamos de chat y cortara el observer apenas se enviaba la
> primera burbuja — la siguiente nunca bajaba.

> **Cloud API:** se elimina toda la heurística de confianza. `POST /messages` devuelve el
> `message.id` de forma síncrona, y el webhook de `statuses` informa después
> `sent → delivered → read` (o `failed` con código de error). **Pasamos de "adivinar con 70 % de
> confianza" a saber con certeza**, y además ganamos el estado de lectura, que hoy no existe.

### 2.7 Envío automático y adjuntos

`sendMessageAutomatically()`: inserta el texto vía puente Lexical, busca el botón Enviar
(cuatro selectores, incluyendo `aria-label` en dos idiomas), lo pulsa y arma un observer para
confirmar dentro de `sendConfirmationTimeoutMs` (default 15000 ms).

`setAutomaticSimulationGuard(enabled)` es una **barrera global de sesión**: mientras el modo prueba
está activo, ninguna primitiva automática puede pulsar Enviar. Es una segunda línea de defensa
independiente de la lógica de negocio.

`attachFileToComposer()` / `sendAttachedFileAutomatically()`: pegan el archivo con el truco de
`ClipboardEvent`, esperan que abra el visor de adjuntos, escriben el pie de foto en el composer
de caption y confirman el envío verificando el nombre del archivo en el mensaje saliente.

`applyNativeChatStatuses()` / `renderNativeChatStatuses()`: inyecta badges de color en la lista
nativa de WhatsApp (`NEEDS_REPLY` "Pendiente respuesta", `PROCESSING` "Procesando",
`SUGGESTION` "Borrador listo") con estilos propios (`ensureNativeStyles`).
`showMessageQueue()` / `updateMessageQueue()` / `hideMessageQueue()` renderizan el widget flotante
con los mensajes pendientes de la cola y un botón Cancelar.

> **Cloud API:** los adjuntos pasan por el endpoint de **Media**: `POST /{phone-number-id}/media`
> con el binario devuelve un `media_id`, que se referencia en `POST /messages` con
> `{type:"document", document:{id, filename, caption}}`. Los badges y el widget de cola se
> reimplementan como UI nativa del CRM — **mejor, porque no dependen de inyectar CSS en una app ajena**.

---

## 3. Orquestación — `useChatbotRuntime` (`content.tsx`)

El corazón del comportamiento. Todo esto se traslada al servidor.

### 3.1 Los tres interruptores

Persistidos en `sessionStorage` (mueren al cerrar la pestaña — decisión deliberada: ningún modo
peligroso sobrevive a un reinicio):

| Interruptor | Clave | Default | Qué hace |
|---|---|---|---|
| `autoSuggestions` | `tgs:auto-suggestions` | **on** | Genera e inserta sugerencias automáticamente al abrir un chat en modo `SUGGEST`. |
| `simulationMode` | `tgs:auto-simulation` | **off** | Recorre chats y deja borradores **sin enviar jamás**. |
| `autoRunning` | `tgs:auto-running` | **off** | Habilita el recorrido automático de la cola. |

Ortogonales a los modos de negocio del servidor (`OFF` / `SUGGEST` / `AUTO`, global + `modeOverride`
por conversación).

### 3.2 El loop de escaneo

Auto-reprogramado (`setTimeout` encadenado, nunca `setInterval` — evita solapamiento si un tick
tarda más que el intervalo). Cadencia: `max(3000, scanIntervalSeconds * 1000)`, default 8 s.
`runningRef` impide reentrada.

Secuencia de cada tick:

1. Recargar `chatbotSettings` (permite cambiar la configuración sin recargar la página).
2. Si `!enabled` → limpiar cola, limpiar badges, salir.
3. Si `!autoRunning` → limpiar cola, salir.
4. `listChatbotConversations()` → mapa de overrides por `chatKey`.
5. `detectChatList()`. Si `confidence === 0` → mostrar warning y salir (**el modo automático se
   detiene antes que operar a ciegas**).
6. Pintar badges nativos.
7. **Selección de candidatos** (`isScanCandidate`):
   ```
   lastDirection === "INCOMING"
   || (lastDirection !== "OUTGOING" && (hasUnread || needsReply))
   ```
   Comentario original: *procesar si el último mensaje es del cliente. Si WhatsApp no expone la
   dirección (UNKNOWN — su DOM la oculta en la lista), caer al heurístico no-leído/pendiente para no
   dejar de procesar. **Nunca procesar si el último mensaje es NUESTRO.***
8. **Encolar** si: `autoRunning` **y** no simulado ya con el mismo preview **y** no cerrado
   (`escalatedAt` o `modeOverride === "OFF"`) **y** (simulación activa **o** modo efectivo `AUTO`)
   **y** no está ya en cola.
9. **Procesar el lote**: máximo **20 chats por tick**.
10. **Un recontacto por tick**, como máximo, en un pase escalonado e independiente de la cola.
11. Repintar badges con datos frescos.
12. Acumular fallos y mostrarlos juntos: `"Algunos chats no pudieron procesarse: …"`.

**`SUGGEST` es exclusivamente manual desde el botón; el loop nunca genera sugerencias pasivas.**
Invariante explícito en el código.

**Revalidación por iteración dentro del lote:** si el operador apaga el automático a mitad del
recorrido, los chats ya encolados que no sean `AUTO` explícito se descartan.

### 3.3 `processChat()` — el pipeline por conversación

```
1. Si hay que cambiar de chat → switchToChat() + waitForActiveChat(6000)
2. Si lastOpenMessageDirection() === "OUTBOUND" → SALTAR ("el último mensaje es nuestro")
3. findLastIncomingMessage() → texto + fingerprintSeed + messageType
4. POST /chatbot/respond
5. Si action ∉ {AUTO_REPLY, SIMULATED} → devolver (SUGGESTED/ESCALATED/DUPLICATE/OFF/...)
6. Demora aleatoria: random(0, autoDelayMaxSeconds), tope duro de 120 s
7. Si SIMULATED → insertar borrador en composer vacío, esperar 700 ms, devolver
8. ⚠️ REVALIDACIÓN AUTORITATIVA (ver 3.4)
9. Enviar burbuja por burbuja, con delay aleatorio entre cada una
10. Adjuntos (imagen y/o PDF de presupuesto)
11. Mensaje de seguimiento del presupuesto (quoteFollowupMessage)
```

**Demoras** (imitan cadencia humana):
- Antes del primer envío: `random(0, autoDelayMaxSeconds)`, tope 120 s.
- Entre burbujas: `random(betweenDelayMinSeconds, betweenDelayMaxSeconds)`, acotado a [0, 30] y [min, 60].
- Tras insertar un borrador de simulación: 700 ms fijos, *"para darle tiempo a WhatsApp a registrar
  el borrador antes de que el recorrido cambie de chat (si no, el draft se pierde al switchear)"*.

### 3.4 Las barreras de seguridad — el invariante más importante

El sistema revalida la autorización de envío **en cada punto donde el estado pudo haber cambiado**.
Motivo: entre que la IA empieza a generar y que el mensaje sale pueden pasar dos minutos (demora
aleatoria incluida), y en ese lapso el operador pudo apagar el bot o escalar el chat.

**Servidor** (`chatbot.ts`), tres barreras:
1. Al entrar a `respond()`, antes de tocar la IA.
2. `conversation.escalatedAt` y horario comercial.
3. **Después** de generar, relee `chatbotSettings.enabled`: si se apagó durante la generación,
   escribe un log `SEND_FAILED` con `blockedByKillSwitch: true` y devuelve `DISABLED`.

**Cliente**, tres barreras más:
4. Después de la demora aleatoria y **antes** del primer envío: relee settings + conversación.
   Distingue tres razones: bot desactivado / chat escalado durante la espera / dejó de estar en `AUTO`.
5. **`ensureAutoAuthorized()` entre CADA par de burbujas.** Si cambia a mitad, se corta y se registra
   `"La autorización de envío cambió entre burbujas."` con el texto parcial ya enviado.
6. Antes de **cada** adjunto, con `break attachmentLoop`.

**Regla de oro:** cualquier revalidación fallida escribe un `SEND_FAILED` con motivo explícito.
**Nunca falla en silencio.**

**Escalada por adjunto fallido:** si un adjunto falla, el servidor (`logAction` con
`ATTACHMENT_FAILED`) **escala la conversación automáticamente** y crea una notificación. Criterio:
un presupuesto que no llegó es peor que un texto que no llegó.

### 3.5 Sugerencia automática al abrir un chat

Efecto separado del loop, para chats en modo `SUGGEST`:

- `MutationObserver` sobre `#main` con **debounce de 450 ms** detecta mensajes entrantes nuevos
  comparando `fingerprintSeed` con el anterior → incrementa `incomingRevision`.
- Ese cambio dispara la generación con **1300 ms** de espera adicional (deja que WhatsApp termine
  de renderizar).
- `autoSuggestRunRef` es un contador monótono de "corridas": si el usuario cambia de chat mientras
  la IA responde, la corrida vieja se descarta. Comentario original: *"El resultado queda persistido
  como notificación, pero jamás se muestra ni se inserta en el chat que quedó activo después."*
- `suggestedFingerprintsRef` (un `Set`) evita regenerar el mismo mensaje. Si ya se procesó ese
  fingerprint y hay una sugerencia reutilizable en memoria, la inserta sin volver a llamar a la IA.
- Ante un error, el fingerprint **se borra del Set** para permitir reintento.

### 3.6 Inserción de sugerencias y protección del texto humano

`insertSuggestion()` — invariantes:

1. **Verificar identidad**: si el chat activo no es el de la sugerencia → error explícito
   `"La sugerencia pertenece a otro chat."`
2. **Nunca pisar lo que escribió el humano**: si el composer tiene texto distinto al de la
   sugerencia, se marca `composerBlocked: true`, se conserva el texto del operador y se avisa
   *"Ya hay un mensaje escrito. Conservamos tu texto y dejamos la sugerencia lista para insertar."*

**Tres modos de borrador** (`multiMessage.draftMode`):

| Modo | Comportamiento |
|---|---|
| `QUEUE` | Inserta la primera burbuja; al detectar que el operador la envió, baja automáticamente la siguiente. Widget flotante con las pendientes y botón Cancelar. |
| `FIRST_ONLY` | Solo la primera burbuja. |
| `JOINED` | Todas unidas con el separador `\n———\n`. |

`startMessageQueue()` se rearma tras cada envío (`arm()`), se cancela si cambia el chat activo
(`observeActiveChat`), reintenta si hubo timeout o confianza < 70, y **si el composer tiene texto
no lo reemplaza**: *"Hay texto en el cuadro. No lo reemplazamos; la cola sigue esperando."*
Al vaciarse, registra `HUMAN_SENT` con el texto completo.

`trackHumanSend()` observa hasta **30 minutos** el próximo saliente para registrar `HUMAN_SENT`
(confianza ≥ 70).

`dismissCurrentSuggestion()` limpia el composer **solo si coincide** con la sugerencia
(`clearComposerIfMatches`) y registra `DISMISSED`.

> **Cloud API:** el composer pasa a ser un `<textarea>` del CRM, bajo nuestro control total.
> Desaparecen: la protección del texto humano (nadie más escribe en ese cuadro), `trackHumanSend`
> (el envío lo hace el CRM, se registra directo), y la cola con re-armado. **`draftMode` sobrevive
> como preferencia de UI:** ¿el CRM precarga una burbuja, todas separadas, o todas unidas?

### 3.7 Modo simulación

Recorrido completo end-to-end que **jamás envía**:

- `simulationRunIdRef` genera un id único por corrida, que entra en el `messageFingerprint`
  (`|simulation:{runId}`) para que las simulaciones no colisionen con el índice único de la
  base ni contaminen los fingerprints reales.
- El servidor lo recibe como `simulation: true`, fuerza `effectiveMode = "AUTO"` y persiste el log
  con status `SUGGESTED` + `decisionMetadata.simulationOutcome`:
  `{wouldSendText, wouldEscalate, escalationReason, wouldCreateRequest, wouldAttach}`.
- **No** actualiza la conversación (ni summary, ni contadores, ni escalación).
- `simulatedChatsRef` mapea `chatKey → preview`: marca el badge "Borrador listo" hasta que llegue
  un mensaje nuevo. Solo se marca si el borrador **realmente** se insertó (`simulationDraftInserted`).
- `setAutomaticSimulationGuard(true)` bloquea el botón Enviar a nivel primitiva.

> **Cloud API:** se conserva íntegro y **mejora**: el modo prueba pasa a ser un "dry run" del
> servidor que muestra en el CRM exactamente qué se mandaría, sin necesidad de ocupar el navegador
> del vendedor ni dejar borradores en chats reales.

### 3.8 Recontactos en el loop

Máximo **uno por tick**. `processedRecontactsRef` evita reintentos repetidos durante la sesión
—incluso ante fallo, se marca como procesado para no insistir.

Flujo: `getRecontactCandidates()` → primer candidato no procesado → navegar al chat →
`generateRecontact()` → según modo: insertar borrador (`SUGGEST`/simulación) o revalidar y
autoenviar (`AUTO`) → `markRecontactSent()` solo si el envío se confirmó.

La revalidación previa al autoenvío de recontacto es la más estricta de todo el sistema: verifica
`autoRunning`, `!simulationMode`, `settings.enabled`, `recontactEnabled`, `mode === "AUTO"`,
`!escalatedAt` **y** que el chat activo siga siendo el correcto.

> **Cloud API — CAMBIO OBLIGATORIO.** Los recontactos buscan conversaciones con `lastOutboundAt`
> de hace `recontactDays` (default **30 días**). Eso cae **siempre** fuera de la ventana de 24 h de
> Meta, donde el texto libre está prohibido. **El recontacto tal como existe hoy no puede salir por
> Cloud API**: se migra a **plantillas aprobadas con variables** (decisión tomada y aceptada).
> El cuerpo del mensaje pasa a ser fijo; la IA elige qué plantilla usar y con qué variables.

---

## 4. Contrato con la API — lo que se conserva sin cambios

Endpoints consumidos (`apps/extension/src/lib/api.ts`), todos vía el service worker:

```
GET  /chatbot/settings                       PUT  /chatbot/settings/enabled
GET  /chatbot/conversations                  GET  /chatbot/conversations/:chatKey
PUT  /chatbot/conversations/:chatKey         GET  /chatbot/context/:chatKey
GET  /chatbot/logs?chatKey=&limit=           POST /chatbot/respond
POST /chatbot/logs/:id/action                POST /chatbot/logs/:id/create-request
GET  /chatbot/recontacts/candidates          POST /chatbot/recontact
POST /chatbot/recontact/:chatKey/mark-sent
+ quotes, products, customers, collections, notifications, pdf…
```

**Payload de `POST /chatbot/respond`:**

```ts
{
  chatKey, displayName, detectedPhone,
  message,                 // texto del último entrante
  messageType,             // "TEXT" | "AUDIO"
  messageFingerprint,      // hash(chatKey + fingerprintSeed [+ sufijo simulación/manual])
  manualSuggestion,        // fuerza modo SUGGEST
  simulation,              // fuerza modo AUTO y no persiste efectos
  recentMessages,          // [{direction, text}] — contexto conversacional
}
```

De todo esto, con Cloud API **solo cambia el origen de los datos**: `message`, `messageType` y
`messageFingerprint` vienen del webhook de Meta en vez del DOM, y `recentMessages` se lee de
`ChatbotMessageLog` en vez de scrapearse. **La forma del contrato se mantiene**, lo que permite
que el cerebro siga funcionando sin tocarlo.

---

## 5. Tabla maestra de migración

| # | Comportamiento actual (DOM) | Equivalente Cloud API | Veredicto |
|---|---|---|---|
| 1 | Loop de escaneo cada 8 s | Webhook `POST /whatsapp/webhook` | **Mejora** — tiempo real, cero polling |
| 2 | `detectChatList()` + confianza | El webhook dice exactamente quién escribió | **Mejora** — se elimina toda la heurística |
| 3 | `switchToChat()` + `waitForActiveChat()` | No existe el concepto de chat activo | **Se elimina** — y con él el cuello de botella de 1 chat por vez |
| 4 | Cascada de dirección (5 métodos) | El webhook solo trae entrantes | **Se elimina** |
| 5 | `fingerprintSeed` = `data-id\|texto` | `message.id` de Meta, globalmente único | **Mejora** — dedupe garantizado |
| 6 | `chatKey` = `tel:` o `name:` | Siempre `tel:{wa_id}` | **Mejora** — requiere migrar históricos |
| 7 | Detección de audio por 11 selectores | `message.type === "audio"` | **Mejora** |
| 8 | Tarjeta de anuncio (heurística triple) | Campo `referral` explícito | **Mejora** |
| 9 | `ignoredAutoMessages` | Sigue aplicando a auto-respuestas de Meta | **Se conserva** |
| 10 | `insertMessageIntoComposer()` (Lexical) | `POST /messages` `{type:"text"}` | **Se elimina el hack** |
| 11 | `sendMessageAutomatically()` + observer | `POST /messages` → `message.id` síncrono | **Mejora** — certeza, no confianza |
| 12 | `observeOutgoingMessage()` (0/40/70/100) | Webhook `statuses`: sent/delivered/read/failed | **Mejora** — se gana el estado de lectura |
| 13 | `pasteFile` con `ClipboardEvent` | `POST /media` → `media_id` → `POST /messages` | **Se elimina el hack** |
| 14 | Pie de foto (`insertCaption`) | Campo `caption` del mensaje | **Se elimina el hack** |
| 15 | Demora aleatoria previa | Cola server-side con `scheduledAt` | **Se conserva** |
| 16 | Delay entre burbujas | Ídem, en la cola | **Se conserva** |
| 17 | 6 barreras de revalidación | Se conservan las 3 del servidor; las 3 del cliente se vuelven checks de la cola | **Se conserva — crítico** |
| 18 | Modo simulación | Dry run del servidor mostrado en el CRM | **Se conserva y mejora** |
| 19 | `draftMode` QUEUE/FIRST_ONLY/JOINED | Preferencia de UI del CRM | **Se conserva** |
| 20 | Protección del texto humano en el composer | Innecesaria (composer propio) | **Se elimina** |
| 21 | `trackHumanSend()` 30 min | El CRM envía y registra directo | **Se elimina** |
| 22 | Badges en la lista nativa | UI propia del CRM | **Se conserva como diseño propio** |
| 23 | Máx. 20 chats por tick | Concurrencia de la cola | **Se conserva como parámetro** |
| 24 | Máx. 1 recontacto por tick | Ídem | **Se conserva** |
| 25 | Recontacto con texto libre por IA | **Plantilla aprobada** fuera de 24 h | **⚠️ CAMBIO OBLIGATORIO** |
| 26 | Escalada automática por adjunto fallido | Ídem, disparada por `statuses.failed` | **Se conserva** |
| 27 | `sessionStorage` para modos peligrosos | Estado server-side con auditoría | **Mejora** |
| 28 | Cookie de sesión del vendedor | Token de Meta cifrado en la API | **Mejora** |

---

## 6. Lo que NO hay que perder al reescribir

Resumen ejecutivo de los invariantes que costaron incidentes reales y **deben sobrevivir**:

1. **Nunca responder si el último mensaje es nuestro.**
2. **Nunca adivinar la dirección de un mensaje.** Ante la duda, no operar.
3. **Revalidar la autorización de envío en cada punto de espera**, incluso entre burbujas.
4. **Todo fallo se escribe con motivo explícito.** Nunca fallar en silencio.
5. **El kill-switch se relee después de generar**, no solo antes.
6. **Deduplicación por fingerprint** con índice único en base — la doble respuesta es el peor bug posible.
7. **Un adjunto fallido escala la conversación.**
8. **El modo prueba no puede enviar**, garantizado por una barrera independiente de la lógica de negocio.
9. **`SUGGEST` nunca genera solo**; es siempre una acción deliberada.
10. **Las simulaciones no contaminan** memoria, contadores ni fingerprints reales.
11. **Demoras aleatorias** en vez de cadencia robótica.
12. **Tope duro por lote** (20 chats, 1 recontacto) para que un pico no dispare cientos de mensajes.
