# WhatsApp Cloud API — Especificación de la capa de mensajería

> Reemplaza por completo a `apps/extension` (ver `docs/EXTENSION-LEGACY-LOGIC.md`) y al módulo
> `apps/api/src/whatsapp.ts` previo, que se descarta y se reescribe.
>
> **Principio rector: el cerebro no se toca.** La lógica de decisión (persona, reglas, escalación,
> memoria, reutilización, creación de solicitudes) vive en `POST /chatbot/respond` y se conserva.
> Esta capa reemplaza únicamente **percepción, transporte y orquestación**.

---

## 1. Conceptos de Meta que condicionan el diseño

### 1.1 La ventana de 24 horas

Meta clasifica cada conversación según cuánto hace que el cliente escribió por última vez.

| Situación | Qué se puede mandar |
|---|---|
| El cliente escribió hace **< 24 h** | Texto libre, cualquier cantidad de mensajes, imágenes, documentos. Sin costo por mensaje. |
| Pasaron **≥ 24 h** | **Solo plantillas aprobadas.** Cualquier mensaje de texto libre es rechazado con error de Meta. |

La ventana se **reinicia con cada mensaje entrante**. Esto obliga a:

- Guardar `windowExpiresAt` en cada conversación y actualizarlo en cada inbound.
- **Bloquear el envío de texto libre antes de intentarlo** cuando la ventana está cerrada — nunca
  mandar algo que sabemos que va a fallar.
- Mostrarlo con claridad en el CRM (contador de tiempo restante, y estado explícito cuando venció).

### 1.2 Plantillas (decisión tomada)

Los recontactos —que buscan conversaciones de hace 30 días— caen **siempre** fuera de la ventana.
Se migran a plantillas aprobadas con variables. El cuerpo es fijo y lo aprueba Meta; la IA elige
qué plantilla usar y con qué variables completarla.

**Alcance por bloque:** este bloque construye el *tracking* de la ventana y el bloqueo preventivo.
El ABM de plantillas, la sincronización con Meta y el envío con variables van en un bloque posterior,
cuando el número esté verificado y se pueda probar de verdad contra Meta.

### 1.3 Estados de entrega

El webhook manda un array `statuses[]` independiente de `messages[]`, con la progresión
`sent → delivered → read`, o `failed` con un código de error. Es información que hoy **no existe**
en el sistema: la extensión solo podía adivinar con una heurística de confianza.

---

## 2. Modelo de datos

### 2.1 `WhatsappCloudSettings` (se reescribe)

```prisma
model WhatsappCloudSettings {
  id                   String   @id @default("singleton")
  enabled              Boolean  @default(false)
  phoneNumberId        String?
  businessAccountId    String?
  accessTokenEncrypted String?     // encryptSecret() — nunca en texto plano
  appSecretEncrypted   String?     // para validar la firma HMAC del webhook
  webhookVerifyToken   String?     // se autogenera si no se provee
  apiVersion           String   @default("v21.0")
  displayPhoneNumber   String?     // informativo, lo devuelve Meta
  verifiedName         String?     // informativo, lo devuelve Meta
  updatedAt            DateTime @updatedAt
}
```

### 2.2 `ChatbotConversation` — campos nuevos

```prisma
windowExpiresAt   DateTime?   // lastInboundAt + 24h. null = nunca escribió.
waContactName     String?     // nombre del perfil de WhatsApp, distinto de displayName (editable)
unreadCount       Int      @default(0)
lastReadAt        DateTime?
assignedUserId    String?     // para repartir conversaciones entre vendedores en el CRM
```

`@@index([windowExpiresAt])` y `@@index([assignedUserId, updatedAt])`.

### 2.3 `ChatbotMessageLog` — campos nuevos

```prisma
deliveredAt   DateTime?
readAt        DateTime?
failedAt      DateTime?
waErrorCode   Int?        // código de error de Meta, para diagnóstico
mediaId       String?     // media_id devuelto por Meta
mediaMimeType String?
mediaFilename String?
```

Y dos valores nuevos en `ChatbotMessageStatus`: `DELIVERED`, `READ`.

> Los enums de Postgres se amplían con `ALTER TYPE ... ADD VALUE`, que **no puede correr dentro de
> una transacción**. Prisma lo maneja, pero la migración tiene que quedar en su propio archivo.

### 2.4 `WhatsappOutboundQueue` (modelo nuevo)

Reemplaza a la cola en memoria del navegador. Es la pieza que hace que los delays humanos, las
barreras de seguridad y los reintentos vivan en el servidor.

```prisma
model WhatsappOutboundQueue {
  id              String   @id @default(uuid())
  conversationKey String
  logId           String?              // ChatbotMessageLog que originó el envío
  kind            String               // TEXT | DOCUMENT | IMAGE | TEMPLATE
  payload         Json                 // texto, o {mediaId, filename, caption}, o {template, vars}
  bubbleIndex     Int      @default(0) // orden dentro de una respuesta multi-burbuja
  scheduledAt     DateTime             // cuándo puede salir (implementa los delays aleatorios)
  status          String   @default("PENDING")  // PENDING | SENDING | SENT | FAILED | CANCELLED
  attempts        Int      @default(0)
  lastError       String?
  waMessageId     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([status, scheduledAt])
  @@index([conversationKey, bubbleIndex])
}
```

---

## 3. Arquitectura de servicios

```
apps/api/src/whatsapp/
  whatsapp.controller.ts     Endpoints HTTP (settings, webhook, envío manual)
  whatsapp.client.ts         Wrapper puro de Graph API. Sin lógica de negocio.
  whatsapp-inbound.ts        Webhook → persistir → disparar el bot
  whatsapp-outbound.ts       Cola de salida: barreras, delays, reintentos
  whatsapp-window.ts         Cálculo y verificación de la ventana de 24h
```

Y una extracción necesaria en el módulo existente:

**`apps/api/src/chatbot-engine.ts`** — hoy toda la lógica de decisión vive dentro del método
`respond()` del controller `ChatbotController`. Hay que extraerla a un servicio invocable desde
código, sin pasar por HTTP, porque ahora la dispara el webhook. **El comportamiento no cambia en
absoluto**: es una extracción mecánica. El endpoint `POST /chatbot/respond` queda como una cáscara
delgada que llama al servicio.

### 3.1 `whatsapp.client.ts`

Wrapper delgado sobre `https://graph.facebook.com/{apiVersion}/{phoneNumberId}`:

| Método | Endpoint |
|---|---|
| `sendText(to, body)` | `POST /messages` `{type:"text"}` |
| `sendDocument(to, mediaId, filename, caption?)` | `POST /messages` `{type:"document"}` |
| `sendImage(to, mediaId, caption?)` | `POST /messages` `{type:"image"}` |
| `sendTemplate(to, name, lang, components)` | `POST /messages` `{type:"template"}` |
| `uploadMedia(buffer, mimeType, filename)` | `POST /media` → `media_id` |
| `downloadMedia(mediaId)` | `GET /{mediaId}` → URL → descarga autenticada |
| `markAsRead(waMessageId)` | `POST /messages` `{status:"read"}` |

Reglas: timeout de 15 s en toda llamada; el token se descifra en el momento del uso y **nunca** se
loguea; los errores de Meta se traducen a excepciones Nest con el mensaje de `error.message` de la
respuesta y el `error.code` preservado para diagnóstico.

### 3.2 `whatsapp-inbound.ts` — el reemplazo del loop de escaneo

```
POST /whatsapp/webhook
 1. Validar firma HMAC-SHA256 (X-Hub-Signature-256) con timingSafeEqual sobre el rawBody
 2. Responder 200 INMEDIATAMENTE  ← Meta reintenta si tardás; el procesamiento va en background
 3. Por cada entry[].changes[].value:
    a) messages[] → procesar entrante
    b) statuses[] → actualizar estado de entrega
```

**Procesamiento de un entrante:**

```
1. chatKey = "tel:" + wa_id                        (siempre; el prefijo name: ya no existe)
2. Upsert de ChatbotConversation:
     - waContactName desde contacts[].profile.name
     - lastInboundText, lastInboundAt
     - windowExpiresAt = now + 24h                 ← reinicio de la ventana
     - unreadCount += 1
3. Insertar ChatbotMessageLog INBOUND con
     inboundFingerprint = message.id (Meta)        ← dedupe por índice único; P2002 = ignorar
     channel = CLOUD_API
4. Filtro ignoredAutoMessages                      ← se conserva de la extensión
5. Disparar el motor del chatbot (§3.4)
```

**Mapeo de tipos:** `text` → `TEXT`; `audio`/`voice` → `AUDIO` (el motor ya escala los audios);
`image`/`document`/`video`/`sticker` → se persisten con su `mediaId` y un texto marcador
`[tipo_no_soportado: X]`; `referral` presente → se guarda en `decisionMetadata` (reemplaza la
heurística de tarjeta de anuncio).

**Procesamiento de `statuses[]`:** buscar el log por `waMessageId` y actualizar
`deliveredAt` / `readAt` / `failedAt` + `waErrorCode`, moviendo `status` a `DELIVERED` / `READ` /
`SEND_FAILED`. Si el mensaje fallido llevaba un adjunto, **escalar la conversación** — se conserva
el invariante nº 7 de la extensión.

### 3.3 `whatsapp-outbound.ts` — la cola

Reemplaza al loop del navegador. Corre en `apps/worker` (o como intervalo del proceso API si es más
simple de operar), tomando los `PENDING` con `scheduledAt <= now`.

**Las barreras de seguridad se conservan íntegras.** Antes de CADA envío individual —no una vez por
respuesta— revalida:

1. `chatbotSettings.enabled` (kill-switch)
2. `conversation.escalatedAt === null`
3. modo efectivo sigue siendo `AUTO` (para envíos automáticos)
4. **la ventana de 24 h sigue abierta** (barrera nueva)
5. no está activo el modo simulación

Cualquier fallo escribe `SEND_FAILED` con motivo explícito y cancela las burbujas pendientes de esa
misma respuesta. **Nunca falla en silencio.**

**Los delays se traducen a `scheduledAt`:** la demora previa (`random(0, autoDelayMaxSeconds)`,
tope 120 s) y la demora entre burbujas (`random(betweenDelayMinSeconds, betweenDelayMaxSeconds)`,
acotada a [0,30] y [min,60]) se calculan al encolar. El worker no duerme: simplemente no toma nada
antes de su `scheduledAt`.

**Reintentos:** hasta 3 intentos con backoff exponencial, **solo** ante errores de red o HTTP 5xx.
Un rechazo de Meta (4xx) no se reintenta jamás — reintentarlo solo repite el error y arriesga
duplicados.

**Tope de concurrencia:** máximo 20 conversaciones en vuelo (se conserva el límite del lote de la
extensión, que existía para que un pico no dispare cientos de mensajes).

### 3.4 Puente con el motor del chatbot

```
webhook → persiste inbound → ChatbotEngine.respond({
    chatKey,
    message, messageType,
    messageFingerprint: message.id,
    recentMessages: leídos de ChatbotMessageLog (NO del DOM)
  })
  ↓
  action = AUTO_REPLY  → encolar burbujas + adjuntos en WhatsappOutboundQueue
  action = SUGGESTED   → queda en el CRM esperando aprobación humana
  action = ESCALATED   → notificación + marca en el CRM
  action = DUPLICATE / OFF / DISABLED / OUTSIDE_HOURS → no hacer nada
```

`recentMessages` se arma leyendo los últimos `maxRecentSnippets` logs conversacionales de la
conversación, ordenados cronológicamente, con los audios representados como
`"[Mensaje de audio sin transcripción]"`. Es **más fiable que el DOM**, que solo tenía lo renderizado.

---

## 4. Endpoints

| Método | Ruta | Auth | Qué hace |
|---|---|---|---|
| `GET` | `/whatsapp/settings` | sesión | Config con los secretos enmascarados |
| `PUT` | `/whatsapp/settings` | sesión | Guarda config; cifra token y app secret |
| `POST` | `/whatsapp/settings/test` | sesión | Verifica credenciales contra Meta |
| `GET` | `/whatsapp/webhook` | **pública** | Verificación `hub.challenge` de Meta |
| `POST` | `/whatsapp/webhook` | **pública + firma HMAC** | Recepción de eventos |
| `GET` | `/whatsapp/conversations` | sesión | Bandeja del CRM: filtros, orden, paginación |
| `GET` | `/whatsapp/conversations/:chatKey/messages` | sesión | Historial paginado |
| `POST` | `/whatsapp/conversations/:chatKey/send` | sesión | Envío manual desde el CRM |
| `POST` | `/whatsapp/conversations/:chatKey/read` | sesión | Marca leído; `unreadCount = 0` |
| `POST` | `/whatsapp/conversations/:chatKey/assign` | sesión | Asigna a un vendedor |

Las dos rutas del webhook son `@Public()`; su autenticación **es** la firma HMAC. Sin `appSecret`
configurado, el webhook rechaza todo: nunca se acepta un evento sin verificar.

---

## 5. Seguridad

1. **Firma HMAC obligatoria** en cada POST del webhook, con `timingSafeEqual` sobre el `rawBody`
   crudo (no el body parseado — cualquier reserialización invalida la firma).
2. **Secretos cifrados en reposo** con `encryptSecret` / `decryptSecret` de `@tgs/config`.
   Enmascarados al leerse. Jamás en logs.
3. **Idempotencia** por `message.id` de Meta, respaldada por el índice único de la base. Meta
   reintenta los webhooks: sin esto, un reintento genera una respuesta duplicada.
4. **Responder 200 rápido.** Si el procesamiento tarda, Meta reintenta y llegan duplicados.
5. **Rate limits de Meta:** 80 mensajes/segundo por número. La cola respeta un tope conservador muy
   por debajo.

---

## 6. Estado de implementación

| Bloque | Contenido | Estado |
|---|---|---|
| 1 | Rutas reales en `apps/web` + shell del CRM sin sidebar | Hecho |
| 2 | Modelo de datos, migraciones, `whatsapp-client`, webhook y motor extraído | Hecho |
| 3 | UI del CRM: bandeja, conversación, envío manual, estados de entrega | Hecho |
| 4 | Cola de salida, respuestas automáticas, adjuntos y aprobación de sugerencias | Hecho |
| 5 | Plantillas: ABM, sync con Meta, recontactos fuera de ventana | Hecho, sin probar contra Meta |
| 6 | Borrado de `apps/extension` | Pendiente: recién con el circuito verificado en producción |

## 7. Puesta en marcha

No hacen falta variables de entorno nuevas: las credenciales se cargan desde la UI y se
guardan cifradas en la base con `SETTINGS_ENC_KEY`.

1. **Configuración → WhatsApp**: cargar Phone Number ID, Business Account ID, access token
   permanente y app secret. Guardar: se genera el verify token del webhook.
2. **Verificar credenciales** con el botón: consulta a Meta sin mandarle nada a ningún cliente.
3. **En Meta for Developers**: pegar la Callback URL y el verify token que muestra la pantalla,
   y suscribir el campo `messages`. Es el único campo necesario: las confirmaciones de
   entrega y lectura llegan dentro del mismo campo, en `statuses[]` (no existe un campo
   `message_status` aparte). Además de la suscripción a nivel app hay que suscribir la app
   al WABA (`POST /{waba_id}/subscribed_apps`), si no Meta no manda ningún evento.
   El checklist de la bandeja marca este paso como hecho recién cuando llega el primer
   POST firmado (`lastWebhookAt`); hasta entonces se puede seguir en los logs con los
   eventos `whatsapp_webhook_verify`, `whatsapp_webhook_received` y
   `whatsapp_webhook_rejected`.
4. **Habilitar** la integración con el switch.
5. **Plantillas**: darlas de alta en Meta, esperar la aprobación y sincronizarlas desde
   el CRM → Plantillas.

### Notas operativas

- El drenador de la cola corre dentro del proceso de la API y toma trabajo con
  `FOR UPDATE SKIP LOCKED`: es seguro con varias instancias. Las filas que quedan tomadas
  por un proceso caído vuelven a PENDING a los dos minutos.
- Las rutas del webhook están exentas del rate limit por IP: Meta manda todo desde pocas IPs
  y en ráfagas, y un 429 haría perder mensajes.
- Las conversaciones históricas con `chatKey` con prefijo `name:` (las que la extensión creó
  cuando WhatsApp Web no exponía el teléfono) quedan como historial: los mensajes nuevos
  siempre entran con clave `tel:`. No se migran automáticamente porque no hay forma confiable
  de resolver a qué número correspondía cada nombre.
