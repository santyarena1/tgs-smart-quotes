/**
 * Adaptador central de selectores DOM de WhatsApp Web.
 *
 * WhatsApp cambia su DOM sin previo aviso, así que TODA lectura de la página vive acá adentro,
 * versionada, con múltiples estrategias de fallback y un puntaje de confianza (0-100) que la UI
 * del panel usa para decidir si mostrar una advertencia. Nunca se debe silenciar un fallo de
 * detección: si nada matchea, `detectChat()` devuelve confianza 0 y un `warning` explícito.
 */

export const SELECTOR_VERSION = "2026-08-chatbot-v8-header-name-fix";

export interface SelectorSet {
  id: string;
  label: string;
  header: string;
  headerTitle: string;
  composer: string;
}

/** Estrategias en orden de preferencia. La primera que matchee un `header` gana. */
export const SELECTOR_SETS: SelectorSet[] = [
  {
    id: "conversation-testid",
    label: "cabecera de conversación data-testid",
    header: "[data-testid='conversation-header']",
    // OJO: NO usar span[title] acá: el único span[title] del header es el estado ("en línea"),
    // y querySelector con coma devuelve el primero en el DOM → tomaba "en línea" como nombre y
    // rompía waitForActiveChat ("WhatsApp no confirmó el cambio"). El nombre real está en el
    // textContent del cell-title del header.
    headerTitle: "[data-testid='conversation-info-header-chat-title']",
    composer:
      "[data-testid='conversation-compose-box-input'], footer [contenteditable='true']",
  },
  {
    id: "fallback-main",
    label: "cabecera dentro de #main",
    header: "#main header",
    headerTitle: "[data-testid='conversation-info-header-chat-title'], h1, h2",
    composer: "#main div[contenteditable='true'][role='textbox']",
  },
];
export interface ChatDetection {
  name: string;
  phone: string;
  /** 0-100: qué tan confiable es la detección actual. */
  confidence: number;
  selectorSetId: string;
  usedFallback: boolean;
  method: "header+dataId" | "dataId" | "header" | "none";
  /** Nunca se silencia: si hay un problema de detección, viene explicado acá. */
  warning: string | null;
}

const HEADER_PHONE_REGEX = /\+?\d[\d\s().-]{7,}\d/;
const DATA_ID_PHONE_REGEX = /(\d{6,15})@c\.us/;

/** El formato `@c.us` es legado: se conserva como fallback, pero los `data-id` actuales suelen ser hashes opacos. */
function extractPhoneFromDataId(): string | null {
  // Nunca buscar en todo document: tomaría el primer teléfono del lateral y lo conservaría al cambiar de chat.
  const nodes = document.querySelectorAll("#main [data-id]");
  for (const node of nodes) {
    const raw = node.getAttribute("data-id") ?? "";
    const match = raw.match(DATA_ID_PHONE_REGEX);
    if (match?.[1]) return `+${match[1]}`;
  }
  return null;
}

function detectWithSet(set: SelectorSet, index: number): ChatDetection | null {
  const header = document.querySelector(set.header);
  if (!header) return null;

  const titleEl = header.querySelector(set.headerTitle);
  const name =
    titleEl?.getAttribute("title")?.trim() || titleEl?.textContent?.trim() || "";
  const headerText = header.textContent ?? "";
  const headerPhone = headerText.match(HEADER_PHONE_REGEX)?.[0]?.trim() ?? "";
  const dataIdPhone = extractPhoneFromDataId();

  const phone = dataIdPhone || headerPhone;
  let method: ChatDetection["method"] = "none";
  if (dataIdPhone && name) method = "header+dataId";
  else if (dataIdPhone) method = "dataId";
  else if (name || headerPhone) method = "header";

  if (!name && !phone) return null;

  let confidence = 0;
  if (name) confidence += 40;
  if (dataIdPhone) confidence += 55;
  else if (headerPhone) confidence += 35;
  confidence = Math.min(100, confidence);

  const usedFallback = index > 0;
  if (usedFallback) confidence = Math.round(confidence * 0.7);

  return {
    name,
    phone,
    confidence,
    selectorSetId: set.id,
    usedFallback,
    method,
    warning: name && !phone
      ? "No pudimos detectar el teléfono automáticamente: WhatsApp no lo expone en el chat para contactos guardados. Completalo a mano."
      : usedFallback
        ? `Se usó el selector de respaldo "${set.label}" (versión ${SELECTOR_VERSION}). Revisá los datos antes de continuar.`
        : null,
  };
}

/** Detecta el chat abierto probando cada set de selectores en orden. Nunca falla en silencio. */
export function detectChat(): ChatDetection {
  for (let i = 0; i < SELECTOR_SETS.length; i += 1) {
    const set = SELECTOR_SETS[i];
    if (!set) continue;
    const result = detectWithSet(set, i);
    if (result) return result;
  }
  return {
    name: "",
    phone: "",
    confidence: 0,
    selectorSetId: "none",
    usedFallback: true,
    method: "none",
    warning:
      `No se pudo detectar el chat con ningún selector conocido (versión ${SELECTOR_VERSION}). ` +
      "Abrí una conversación individual y completá el número/nombre a mano si vas a registrar un intento.",
  };
}

export function findComposer(): HTMLElement | null {
  for (const set of SELECTOR_SETS) {
    const el = document.querySelector(set.composer);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

export interface InsertResult {
  ok: boolean;
  error?: string;
}

export interface ChatListItem {
  chatKey: string;
  name: string;
  preview: string;
  unreadCount: number;
  hasUnread: boolean;
  lastDirection: "INCOMING" | "OUTGOING" | "UNKNOWN";
  needsReply: boolean;
  confidence: number;
  selectorSetId: string;
  warning: string | null;
}

export interface ChatListDetection {
  chats: ChatListItem[];
  confidence: number;
  selectorSetId: string;
  warning: string | null;
}

const CHAT_LIST_STRATEGIES = [
  {
    id: "testid-cell-frame",
    container: "#pane-side",
    rows: "[data-testid='cell-frame-container']",
    // El nombre real vive en span[title]. `cell-frame-title` ya NO es el nombre (WhatsApp lo cambió:
    // ahora contiene el conteo de no-leídos), así que usarlo corrompía el nombre/chatKey.
    title: "span[title]",
    preview: "[data-testid='cell-frame-secondary'], [data-testid='last-msg-status']",
    unread: "[data-testid='icon-unread-count'], [aria-label*='no leído' i], [aria-label*='unread' i]",
    // OJO: no usar last-msg-status como indicador de saliente: existe en TODAS las filas (marcaría
    // todo como OUTGOING → no procesa nada). La dirección real se resuelve DENTRO del chat abierto
    // (lastOpenMessageDirection). Acá solo dejamos íconos legacy por si vuelven.
    outgoing: "span[data-icon='msg-check'], span[data-icon='msg-dblcheck'], span[data-icon='msg-time'], span[data-icon='ic-schedule']",
    automated: "[data-icon='ic-schedule'], [data-testid*='scheduled' i], [data-testid*='automated' i], [aria-label*='programado' i], [aria-label*='scheduled' i], [aria-label*='automático' i], [aria-label*='automatic' i]",
    confidence: 95,
  },
  {
    id: "pane-side-gridcell",
    container: "#pane-side",
    rows: "[role='gridcell'], [role='listitem']",
    title: "span[title], [dir='auto']",
    preview: "span[dir='ltr'], [data-pre-plain-text]",
    unread: "[aria-label*='no leído' i], [aria-label*='unread' i], span[aria-label]",
    outgoing: "span[data-icon='msg-check'], span[data-icon='msg-dblcheck'], span[data-icon='msg-time'], span[data-icon='ic-schedule']",
    automated: "[data-icon='ic-schedule'], [data-testid*='scheduled' i], [data-testid*='automated' i], [aria-label*='programado' i], [aria-label*='scheduled' i], [aria-label*='automático' i], [aria-label*='automatic' i]",
    confidence: 70,
  },
] as const;

function rowChatKey(row: Element, name: string): string {
  const raw = row.getAttribute("data-id")
    ?? row.querySelector("[data-id]")?.getAttribute("data-id")
    ?? "";
  const phone = raw.match(DATA_ID_PHONE_REGEX)?.[1];
  if (phone) return `tel:${phone}`;
  return `name:${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR").replace(/\s+/g, " ").trim()}`;
}

/** Detecta la lista lateral y sus no leídos. Un fallo siempre devuelve confianza 0 + warning. */
export function detectChatList(ignoredAutoMessages: string[] = []): ChatListDetection {
  for (const strategy of CHAT_LIST_STRATEGIES) {
    const container = document.querySelector(strategy.container);
    if (!container) continue;
    const rows = [...container.querySelectorAll(strategy.rows)];
    const chats = rows.flatMap((row): ChatListItem[] => {
      const title = row.querySelector(strategy.title);
      const name = title?.getAttribute("title")?.trim() || title?.textContent?.trim() || "";
      if (!name) return [];
      const unreadNode = row.querySelector(strategy.unread);
      const unreadText = unreadNode?.getAttribute("aria-label") ?? unreadNode?.textContent ?? "";
      const unreadCount = Number(unreadText.match(/\d+/)?.[0] ?? (unreadNode ? 1 : 0));
      // `last-msg-status` puede ser sólo el ícono de check/reloj. Elegimos el
      // primer candidato con texto para que la lista configurable pueda comparar
      // el saludo real y no un nodo vacío.
      const preview = [...row.querySelectorAll(strategy.preview)]
        .map(node=>node.textContent?.trim()??"")
        .find(Boolean)??"";
      const lastDirection = row.querySelector(strategy.outgoing)
        ? "OUTGOING" as const
        : preview
          ? "INCOMING" as const
          : "UNKNOWN" as const;
      const automatedOutbound = lastDirection === "OUTGOING"
        && (Boolean(row.querySelector(strategy.automated))
          || matchesConfiguredAutoMessage(preview, ignoredAutoMessages));
      return [{
        chatKey: rowChatKey(row, name),
        name,
        preview,
        unreadCount,
        hasUnread: unreadCount > 0,
        lastDirection,
        needsReply: lastDirection === "INCOMING" || automatedOutbound,
        confidence: strategy.confidence,
        selectorSetId: strategy.id,
        warning: strategy.confidence < 80
          ? `Detección de lista con selector de respaldo "${strategy.id}" (${SELECTOR_VERSION}).`
          : null,
      }];
    });
    if (chats.length) {
      return {
        chats,
        confidence: strategy.confidence,
        selectorSetId: strategy.id,
        warning: strategy.confidence < 80
          ? `Se usó una estrategia de respaldo para la lista de chats (${SELECTOR_VERSION}).`
          : null,
      };
    }
  }
  return {
    chats: [],
    confidence: 0,
    selectorSetId: "none",
    warning: `No se pudo detectar la lista de chats ni sus mensajes no leídos con ningún selector conocido (versión ${SELECTOR_VERSION}). El modo automático queda detenido.`,
  };
}

/** Abre un chat detectado, simulando un click real en su fila. */
export function switchToChat(chatKey: string): InsertResult {
  for (const strategy of CHAT_LIST_STRATEGIES) {
    const container = document.querySelector(strategy.container);
    if (!container) continue;
    for (const row of container.querySelectorAll(strategy.rows)) {
      const title = row.querySelector(strategy.title);
      const name = title?.getAttribute("title")?.trim() || title?.textContent?.trim() || "";
      if (name && rowChatKey(row, name) === chatKey) {
        const target = (row.closest("[role='listitem'], [role='row']") ?? row) as HTMLElement;
        if (!target) break;
        (row as HTMLElement).style.display="";
        target.scrollIntoView({block: "nearest"});
        target.click();
        return {ok: true};
      }
    }
  }
  return {ok: false, error: `No se encontró el chat "${chatKey}" en la lista (${SELECTOR_VERSION}).`};
}

function normalizeIdentityPart(value:string):string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase("es-AR").replace(/\s+/g," ");
}

export function chatDetectionKey(detection:Pick<ChatDetection,"phone"|"name">):string {
  const digits=detection.phone.replace(/\D/g,"");
  return digits?`tel:${digits}`:detection.name?`name:${normalizeIdentityPart(detection.name)}`:"";
}

/** Espera y verifica que WhatsApp haya terminado de cambiar de conversación. */
export async function waitForActiveChat(
  expectedChatKey:string,
  timeoutMs=5000,
  expectedDisplayName?:string,
):Promise<{ok:boolean;detection:ChatDetection;error?:string}> {
  const started=Date.now();
  let last=detectChat();
  while(Date.now()-started<timeoutMs){
    last=detectChat();
    const actual=chatDetectionKey(last);
    const expectedName=expectedChatKey.startsWith("name:")?expectedChatKey.slice(5):"";
    if(
      actual===expectedChatKey
      ||(expectedName&&normalizeIdentityPart(last.name)===expectedName)
      ||(expectedDisplayName&&normalizeIdentityPart(last.name)===normalizeIdentityPart(expectedDisplayName))
    ){
      return {ok:true,detection:last};
    }
    await new Promise(resolve=>window.setTimeout(resolve,100));
  }
  return {ok:false,detection:last,error:`WhatsApp no confirmó el cambio al chat "${expectedChatKey}" (${SELECTOR_VERSION}).`};
}

/** Suscripción robusta al chat activo: WhatsApp reutiliza nodos y cambia atributos/texto. */
export function observeActiveChat(onChange:(next:ChatDetection)=>void):{stop():void} {
  let previous=chatDetectionKey(detectChat());
  let timer=0;
  const inspect=()=>{
    window.clearTimeout(timer);
    timer=window.setTimeout(()=>{
      const next=detectChat();
      const key=chatDetectionKey(next);
      if(key!==previous){
        previous=key;
        onChange(next);
      }
    },80);
  };
  const observer=new MutationObserver(inspect);
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true});
  return {stop(){observer.disconnect();window.clearTimeout(timer)}};
}

export type NativeChatStatusKey =
  | "ESCALATED"
  | "UNRESOLVED"
  | "PENDING_REQUEST"
  | "SUGGESTION"
  | "NEEDS_REPLY"
  | "RESPONDED"
  | "PROCESSING";
export type NativeChatStatus={
  chatKey:string;
  displayName?:string|null;
  status:NativeChatStatusKey;
  label:string;
};

const STATUS_META:Record<NativeChatStatusKey,{icon:string;color:string}>={
  ESCALATED:{icon:"!",color:"#e5484d"},
  UNRESOLVED:{icon:"×",color:"#ff8b90"},
  PENDING_REQUEST:{icon:"$",color:"#f5a524"},
  SUGGESTION:{icon:"✎",color:"#66c7ff"},
  NEEDS_REPLY:{icon:"↩",color:"#c792ea"},
  RESPONDED:{icon:"✓",color:"#25d366"},
  PROCESSING:{icon:"…",color:"#f5c04c"},
};
let nativeStatuses:NativeChatStatus[]=[];
let nativeFilter:NativeChatStatusKey|"ALL"="ALL";
let nativeObserver:MutationObserver|null=null;
let nativeObservedContainer:Element|null=null;
let nativeRenderQueued=false;

function ensureNativeStyles(){
  if(document.getElementById("tgs-native-chat-styles"))return;
  const style=document.createElement("style");
  style.id="tgs-native-chat-styles";
  style.textContent=`
    .tgs-native-status{display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding:1px 5px;border-radius:999px;color:#fff;font:600 10px/16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;vertical-align:middle;white-space:nowrap}
    #tgs-native-chat-filter{display:flex;gap:6px;align-items:center;padding:6px 10px;background:var(--panel-background,#111b21);border-bottom:1px solid rgba(134,150,160,.15);color:var(--primary,#e9edef);font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    #tgs-native-chat-filter select{flex:1;min-width:0;background:var(--search-container-background,#202c33);color:inherit;border:1px solid rgba(134,150,160,.3);border-radius:7px;padding:5px 7px}
  `;
  document.head.appendChild(style);
}

function nativeStatusMap(){
  const map=new Map<string,NativeChatStatus>();
  for(const status of nativeStatuses){
    map.set(status.chatKey,status);
    if(status.displayName)map.set(`name:${normalizeIdentityPart(status.displayName)}`,status);
  }
  return map;
}

function renderNativeChatStatuses(){
  nativeRenderQueued=false;
  const detection=detectChatList();
  if(!detection.chats.length)return;
  ensureNativeStyles();
  const map=nativeStatusMap();
  for(const strategy of CHAT_LIST_STRATEGIES){
    const container=document.querySelector(strategy.container);
    if(!container)continue;
    for(const row of container.querySelectorAll(strategy.rows)){
      const title=row.querySelector(strategy.title);
      const name=title?.getAttribute("title")?.trim()||title?.textContent?.trim()||"";
      if(!name)continue;
      const key=rowChatKey(row,name);
      const status=map.get(key)??map.get(`name:${normalizeIdentityPart(name)}`);
      const existingBadge=row.querySelector<HTMLElement>(".tgs-native-status");
      const fallbackNeedsReply=!row.querySelector(strategy.outgoing)&&Boolean(row.querySelector(strategy.preview)?.textContent?.trim());
      const effective=status??(fallbackNeedsReply?{chatKey:key,status:"NEEDS_REPLY" as const,label:"Pendiente respuesta"}:null);
      const host=title?.parentElement??title;
      if(effective&&host){
        const meta=STATUS_META[effective.status];
        const badge=existingBadge??document.createElement("span");
        if(!existingBadge)badge.className="tgs-native-status";
        badge.dataset.tgsStatus=effective.status;
        badge.style.background=meta.color;
        badge.title=effective.label;
        const badgeText=`${meta.icon} ${effective.label}`;
        if(badge.textContent!==badgeText)badge.textContent=badgeText;
        if(!existingBadge)host.appendChild(badge);
      }else{
        existingBadge?.remove();
      }
      const visible=nativeFilter==="ALL"||effective?.status===nativeFilter;
      (row as HTMLElement).style.display=visible?"":"none";
    }
    let filter=document.getElementById("tgs-native-chat-filter");
    const options:Array<[string,string]>=[
      ["ALL","Todos"],["NEEDS_REPLY","Pendiente respuesta"],["SUGGESTION","Sugerido"],
      ["ESCALATED","Necesita supervisión"],["UNRESOLVED","No resuelto"],["PENDING_REQUEST","Presupuesto"],["RESPONDED","Respondido"],
    ];
    if(!filter){
      filter=document.createElement("div");
      filter.id="tgs-native-chat-filter";
      const label=document.createElement("span");label.textContent="TGS";
      const select=document.createElement("select");
      for(const [value,text] of options){const option=document.createElement("option");option.value=value;option.textContent=text;select.appendChild(option)}
      select.value=nativeFilter;
      select.addEventListener("change",()=>{nativeFilter=select.value as NativeChatStatusKey|"ALL";renderNativeChatStatuses()});
      filter.append(label,select);
      container.parentElement?.insertBefore(filter,container);
    }else{
      const select=filter.querySelector("select");
      for(const [value,label] of options){
        const option=select?.querySelector<HTMLOptionElement>(`option[value="${value}"]`);
        if(option)option.textContent=label;
      }
    }
    if(!nativeObserver||nativeObservedContainer!==container){
      nativeObserver?.disconnect();
      nativeObserver=new MutationObserver(()=>{
        if(nativeRenderQueued)return;
        nativeRenderQueued=true;
        window.requestAnimationFrame(renderNativeChatStatuses);
      });
      nativeObserver.observe(container,{childList:true,subtree:true});
      nativeObservedContainer=container;
    }
    break;
  }
}

/** Inyecta/actualiza badges y filtro directamente en el lateral nativo de WhatsApp. */
export function applyNativeChatStatuses(statuses:NativeChatStatus[]):ChatListDetection {
  nativeStatuses=statuses;
  const detection=detectChatList();
  renderNativeChatStatuses();
  return detection;
}

type ComposerBridgeAction="insert"|"clear"|"insertEmpty";
interface ComposerBridgeResponse {source:"tgs-page";id:string;ok:boolean;error?:string}
let composerBridgeCounter=0;

function wait(ms:number):Promise<void>{return new Promise(resolve=>window.setTimeout(resolve,ms))}

function requestComposerBridge(action:ComposerBridgeAction,text?:string):Promise<InsertResult>{
  const id=`tgs-${Date.now()}-${++composerBridgeCounter}`;
  return new Promise(resolve=>{
    const finish=(result:InsertResult)=>{
      window.clearTimeout(timeout);
      window.removeEventListener("message",onMessage);
      resolve(result);
    };
    const onMessage=(event:MessageEvent<unknown>)=>{
      if(event.source!==window||!event.data||typeof event.data!=="object")return;
      const response=event.data as Partial<ComposerBridgeResponse>;
      if(response.source!=="tgs-page"||response.id!==id||typeof response.ok!=="boolean")return;
      finish({ok:response.ok,...(response.error?{error:response.error}:{})});
    };
    const timeout=window.setTimeout(()=>finish({ok:false,error:"El bridge de Lexical no respondió dentro de 3 segundos."}),3000);
    window.addEventListener("message",onMessage);
    window.postMessage({source:"tgs-cs",id,action,...(text===undefined?{}:{text})},"*");
  });
}

/** Inserta texto mediante Lexical. NUNCA envía: el usuario decide cuándo apretar enviar. */
export async function insertMessageIntoComposer(text:string):Promise<InsertResult>{
  const result=await requestComposerBridge("insert",text);
  if(result.ok)await wait(250);
  return result;
}

export function readComposerText():string|null {
  const composer=findComposer();
  if(!composer)return null;
  return (composer.innerText||composer.textContent||"").replace(/\u200B/g,"").trim();
}

/** Inserta únicamente si el usuario todavía no escribió nada. */
export async function insertMessageIntoEmptyComposer(text:string):Promise<InsertResult> {
  const current=readComposerText();
  if(current===null){
    return {ok:false,error:"No se encontró el cuadro de mensaje de WhatsApp."};
  }
  if(current){
    return {ok:false,error:"Ya hay un mensaje escrito. No se reemplazó ni modificó."};
  }
  const result=await requestComposerBridge("insertEmpty",text);
  if(result.ok)await wait(250);
  return result;
}

export async function clearComposer():Promise<boolean>{
  const result=await requestComposerBridge("clear");
  if(result.ok)await wait(250);
  return result.ok;
}

/** Al descartar, limpia solo si el composer todavía contiene exactamente la sugerencia. */
export async function clearComposerIfMatches(expectedText:string):Promise<boolean> {
  const composer=findComposer();
  if(!composer)return false;
  const current=(composer.innerText||composer.textContent||"").replace(/\u200B/g,"").trim();
  if(normalizeMessage(current)!==normalizeMessage(expectedText))return false;
  return clearComposer();
}

const MESSAGE_CONTAINER_SELECTORS = ["#main [role='application']", "#main .copyable-area", "#main"];
function messageContainer(): Element | null { for (const selector of MESSAGE_CONTAINER_SELECTORS) { const el=document.querySelector(selector); if(el)return el; } return null; }
function normalizeMessage(value:string):string{return value.toLowerCase().replace(/\s+/g," ").trim()}

type MessageDirection="INBOUND"|"OUTBOUND"|"UNKNOWN";
type MessageContentType="TEXT"|"AUDIO"|"OTHER";
type MessageRecord={
  node:Element;
  direction:MessageDirection;
  contentType:MessageContentType;
  text:string;
  fingerprintSeed:string;
  conversational:boolean;
  automatedOutbound:boolean;
  directionMethod:"tail"|"sender-crosscheck"|"group-neighbor"|"legacy-class"|"unknown";
};

const PRIMARY_MESSAGE_ROW_SELECTOR="#main [data-testid='msg-container']";
const LEGACY_MESSAGE_ROW_SELECTOR="#main div.message-in, #main div.message-out";

function directMessageDirection(node:Element):MessageDirection {
  if(node.querySelector("[data-testid='tail-out']"))return "OUTBOUND";
  if(node.querySelector("[data-testid='tail-in']"))return "INBOUND";
  // Fallback para variantes antiguas; nunca es la estrategia primaria.
  if(node.matches("div.message-out")||node.classList.contains("message-out"))return "OUTBOUND";
  if(node.matches("div.message-in")||node.classList.contains("message-in"))return "INBOUND";
  return "UNKNOWN";
}

function messageSender(node:Element):string|null {
  const raw=node.querySelector("[data-pre-plain-text]")?.getAttribute("data-pre-plain-text")
    ??node.getAttribute("data-pre-plain-text")
    ??"";
  const afterTimestamp=raw.replace(/^\[[^\]]+\]\s*/,"").trim();
  const sender=afterTimestamp.replace(/:\s*$/,"").trim();
  return sender||null;
}

function messageText(node:Element):string {
  const primary=node.querySelector(".selectable-text.copyable-text");
  if(primary?.textContent?.trim())return primary.textContent.trim();
  // Archivos/medios o variantes legacy pueden no tener el wrapper de texto confirmado.
  return node.textContent?.trim()??"";
}

const AUDIO_MESSAGE_SELECTORS = [
  "audio",
  "[data-testid='audio-play']",
  "[data-testid='audio-pause']",
  "[data-testid*='ptt' i]",
  "[data-icon='audio-play']",
  "[data-icon='audio-pause']",
  "[data-icon*='ptt' i]",
  "button[aria-label*='mensaje de voz' i]",
  "button[aria-label*='voice message' i]",
  "button[aria-label*='reproducir audio' i]",
  "button[aria-label*='play audio' i]",
];

function messageContentType(node:Element,text:string):MessageContentType {
  if(AUDIO_MESSAGE_SELECTORS.some((selector)=>node.querySelector(selector)))return "AUDIO";
  return text?"TEXT":"OTHER";
}

/**
 * WhatsApp Business agrega una tarjeta saliente automática al abrir conversaciones
 * provenientes de anuncios. Tiene tail-out, pero no es una respuesta del comercio:
 * no debe tapar el mensaje entrante que originó el chat ni contar como contexto enviado.
 *
 * Exigimos dirección saliente + etiqueta de plataforma + acción de detalles para no
 * confundir un mensaje normal que casualmente mencione un anuncio.
 */
function isAdOriginGreetingCard(
  node:Element,
  direction:MessageDirection,
  text:string,
):boolean {
  if(direction!=="OUTBOUND")return false;
  const normalized=normalizeMessage(text);
  const hasAdPlatform=/anuncio de (?:instagram|facebook)/i.test(normalized);
  const hasDetailsAction=/ver detalles/i.test(normalized)
    || Boolean(node.querySelector("button, [role='button'], a"));
  return hasAdPlatform&&hasDetailsAction;
}

const AUTOMATED_MESSAGE_SELECTORS = [
  "[data-icon='ic-schedule']",
  "[data-testid*='scheduled' i]",
  "[data-testid*='automated' i]",
  "[aria-label*='programado' i]",
  "[aria-label*='scheduled' i]",
  "[aria-label*='automático' i]",
  "[aria-label*='automatic' i]",
];

function normalizeAutoMessage(value:string):string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("es-AR")
    .replace(/[^\p{L}\p{N}]+/gu," ")
    .replace(/\s+/g," ")
    .trim();
}

function matchesConfiguredAutoMessage(text:string,patterns:string[]):boolean {
  const normalized=normalizeAutoMessage(text);
  if(!normalized)return false;
  return patterns.some(pattern=>{
    const candidate=normalizeAutoMessage(pattern);
    if(candidate.length<4)return false;
    if(normalized.startsWith(candidate)||candidate.startsWith(normalized))return true;
    const words=candidate.split(" ").filter(Boolean);
    if(words.length<3)return false;
    const present=words.filter(word=>normalized.includes(word)).length;
    return present/words.length>=0.85;
  });
}

function isAutomatedOutbound(
  node:Element,
  direction:MessageDirection,
  text:string,
  ignoredAutoMessages:string[],
):boolean {
  if(direction!=="OUTBOUND")return false;
  if(isAdOriginGreetingCard(node,direction,text))return true;
  if(AUTOMATED_MESSAGE_SELECTORS.some(selector=>node.matches(selector)||Boolean(node.querySelector(selector))))return true;
  return matchesConfiguredAutoMessage(text,ignoredAutoMessages);
}

function messageRows():Element[] {
  const primary=[...document.querySelectorAll(PRIMARY_MESSAGE_ROW_SELECTOR)];
  if(primary.length)return primary;
  return [...document.querySelectorAll(LEGACY_MESSAGE_ROW_SELECTOR)];
}

/** Dirección del mensaje más reciente actualmente renderizado en el chat abierto. */
export function lastOpenMessageDirection():"INBOUND"|"OUTBOUND"|null {
  const rows=messageRows();
  const lastRow=rows[rows.length-1];
  if(!lastRow)return null;
  const direction=directMessageDirection(lastRow);
  return direction==="UNKNOWN"?null:direction;
}

/**
 * Resuelve dirección una sola vez para todas las funciones consumidoras.
 * En mensajes agrupados sin tail:
 * 1) busca otro container del mismo sender con tail;
 * 2) hereda del vecino explícito solo si no hay contradicción entre anterior/siguiente;
 * 3) queda UNKNOWN antes que adivinar una dirección peligrosa.
 */
function readMessageRecords(ignoredAutoMessages:string[]=[]):MessageRecord[] {
  const rows=messageRows();
  const direct=rows.map(directMessageDirection);
  const senders=rows.map(messageSender);
  return rows.map((node,index)=>{
    let direction=direct[index]??"UNKNOWN";
    let directionMethod:MessageRecord["directionMethod"]=direction==="UNKNOWN"?"unknown":node.matches("div.message-in, div.message-out")&&!node.querySelector("[data-testid='tail-in'], [data-testid='tail-out']")?"legacy-class":"tail";
    if(direction==="UNKNOWN"&&senders[index]){
      let bestIndex=-1;
      let bestDistance=Number.POSITIVE_INFINITY;
      for(let candidate=0;candidate<rows.length;candidate+=1){
        if(direct[candidate]==="UNKNOWN"||senders[candidate]!==senders[index])continue;
        const distance=Math.abs(candidate-index);
        if(distance<bestDistance){bestIndex=candidate;bestDistance=distance}
      }
      if(bestIndex>=0){
        direction=direct[bestIndex]??"UNKNOWN";
        directionMethod="sender-crosscheck";
      }
    }
    if(direction==="UNKNOWN"){
      let previous:MessageDirection="UNKNOWN";
      let next:MessageDirection="UNKNOWN";
      for(let candidate=index-1;candidate>=0;candidate-=1){if(direct[candidate]!=="UNKNOWN"){previous=direct[candidate]??"UNKNOWN";break}}
      for(let candidate=index+1;candidate<rows.length;candidate+=1){if(direct[candidate]!=="UNKNOWN"){next=direct[candidate]??"UNKNOWN";break}}
      if(previous!=="UNKNOWN"&&(next==="UNKNOWN"||next===previous)){
        direction=previous;
        directionMethod="group-neighbor";
      }else if(previous==="UNKNOWN"&&next!=="UNKNOWN"){
        direction=next;
        directionMethod="group-neighbor";
      }
    }
    const text=messageText(node);
    const contentType=messageContentType(node,text);
    const automatedOutbound=isAutomatedOutbound(node,direction,text,ignoredAutoMessages);
    const stableId=node.getAttribute("data-id")
      ??node.querySelector("[data-id]")?.getAttribute("data-id")
      ??node.querySelector("[data-pre-plain-text]")?.getAttribute("data-pre-plain-text")
      ??node.getAttribute("data-pre-plain-text")
      ??"";
    return {
      node,
      direction,
      contentType,
      text,
      fingerprintSeed:`${stableId}|${text}`,
      conversational:!automatedOutbound,
      automatedOutbound,
      directionMethod,
    };
  });
}

function lastRecord(
  direction?:Exclude<MessageDirection,"UNKNOWN">,
  conversationalOnly=true,
  ignoredAutoMessages:string[]=[],
):MessageRecord|null {
  const records=readMessageRecords(ignoredAutoMessages).filter(
    (record)=>!conversationalOnly||record.conversational,
  );
  const filtered=direction?records.filter(record=>record.direction===direction):records;
  return filtered[filtered.length-1]??null;
}

/** Detecta salientes recientes para asistir en la confirmación de un intento. */
export function findLastOutgoingMessageText(): string | null {
  return lastRecord("OUTBOUND")?.text||null;
}

export function findLastIncomingMessageText():string|null {
  const record=lastRecord("INBOUND");
  return record?.contentType==="TEXT"&&record.text?record.text:null;
}

export function findLastIncomingMessage(
  requireLatestConversational=true,
  ignoredAutoMessages:string[]=[],
):{text:string;fingerprintSeed:string;messageType:"TEXT"|"AUDIO"}|null {
  const latest=requireLatestConversational
    ?lastRecord(undefined,true,ignoredAutoMessages)
    :lastRecord("INBOUND",true,ignoredAutoMessages);
  if(!latest||latest.direction!=="INBOUND")return null;
  if(latest.contentType==="AUDIO"){
    return {
      text:"[Mensaje de audio sin transcripción]",
      fingerprintSeed:latest.fingerprintSeed,
      messageType:"AUDIO",
    };
  }
  if(latest.contentType!=="TEXT"||!latest.text)return null;
  return {
    text:latest.text,
    fingerprintSeed:latest.fingerprintSeed,
    messageType:"TEXT",
  };
}
export function findRecentMessageSnippets(
  limit = 20,
  excludeFingerprintSeed?:string,
  ignoredAutoMessages:string[]=[],
): Array<{direction:"INBOUND"|"OUTBOUND";text:string}> {
  const safeLimit=Math.max(0,Math.floor(limit));
  if(safeLimit===0)return [];
  return readMessageRecords(ignoredAutoMessages)
    .filter((record):record is MessageRecord&{direction:"INBOUND"|"OUTBOUND"}=>
      record.conversational
      &&record.direction!=="UNKNOWN"
      &&record.fingerprintSeed!==excludeFingerprintSeed
      &&(record.contentType==="AUDIO"||Boolean(record.text)))
    .slice(-safeLimit)
    .map(record=>({
      direction:record.direction,
      text:record.contentType==="AUDIO"
        ?"[Mensaje de audio sin transcripción]"
        :record.text,
    }));
}
export type OutgoingObservation={confidence:number;text:string|null;filename:string|null;timedOut:boolean};
export function observeOutgoingMessage(chatId:string,expectedTextFragment:string,timeoutMs:number,onResult:(result:OutgoingObservation)=>void,expectedFilename?:string):{stop():void}{
  const container=messageContainer();let stopped=false;const initialRecord=lastRecord("OUTBOUND"),initialSeed=initialRecord?.fingerprintSeed??null,expected=normalizeMessage(expectedTextFragment).slice(0,180);
  const stop=()=>{if(stopped)return;stopped=true;observer?.disconnect();window.clearTimeout(timer)};
  const inspect=()=>{if(stopped)return;const active=detectChat(),activeId=active.phone||active.name;if(chatId&&activeId&&activeId!==chatId){stop();return}const record=lastRecord("OUTBOUND");if(!record||record.fingerprintSeed===initialSeed)return;const text=record.text,normalized=normalizeMessage(text),textMatches=Boolean(expected)&&normalized.includes(expected);const filename=record.node.querySelector("[title$='.pdf'], [data-testid='document-thumb']")?.getAttribute("title")??record.node.textContent?.match(/[\w ._-]+\.pdf/i)?.[0]??null;const fileMatches=Boolean(filename)&&(!expectedFilename||normalizeMessage(filename!).includes(normalizeMessage(expectedFilename).replace(/\.pdf$/,"")));const confidence=textMatches&&fileMatches?100:textMatches?70:40;if(confidence>=70){stop();onResult({confidence,text,filename,timedOut:false})}};
  const observer=container?new MutationObserver(inspect):null;if(observer&&container)observer.observe(container,{childList:true,subtree:true,characterData:true,attributes:true});const timer=window.setTimeout(()=>{if(stopped)return;const record=lastRecord("OUTBOUND"),changed=Boolean(record&&record.fingerprintSeed!==initialSeed);stop();onResult({confidence:changed?40:0,text:record?.text??null,filename:null,timedOut:true})},timeoutMs);if(!container)queueMicrotask(()=>{stop();onResult({confidence:0,text:null,filename:null,timedOut:true})});return{stop};
}

/** Confirma el próximo mensaje saliente, aunque el operador haya editado la sugerencia. */
export function observeNextOutgoingMessage(
  chatId:string,
  timeoutMs:number,
  onResult:(result:OutgoingObservation)=>void,
):{stop():void}{
  const container=messageContainer();
  const initialSeed=lastRecord("OUTBOUND")?.fingerprintSeed??null;
  let stopped=false;
  const stop=()=>{if(stopped)return;stopped=true;observer?.disconnect();window.clearTimeout(timer)};
  const inspect=()=>{
    if(stopped)return;
    const active=detectChat();
    const activeId=active.phone||active.name;
    if(chatId&&activeId&&activeId!==chatId&&!chatId.endsWith(activeId)){
      stop();
      return;
    }
    const record=lastRecord("OUTBOUND");
    if(!record||record.fingerprintSeed===initialSeed)return;
    stop();
    onResult({
      confidence:90,
      text:record.text||null,
      filename:null,
      timedOut:false,
    });
  };
  const observer=container?new MutationObserver(inspect):null;
  if(observer&&container)observer.observe(container,{childList:true,subtree:true,characterData:true,attributes:true});
  const timer=window.setTimeout(()=>{
    if(stopped)return;
    stop();
    onResult({confidence:0,text:null,filename:null,timedOut:true});
  },timeoutMs);
  if(!container)queueMicrotask(()=>{
    stop();
    onResult({confidence:0,text:null,filename:null,timedOut:true});
  });
  return {stop};
}

const SEND_BUTTON_SELECTORS = [
  "[data-testid='compose-btn-send']",
  "button[aria-label*='Enviar' i]",
  "button[aria-label*='Send' i]",
  "span[data-icon='send']",
];
let automaticSimulationGuard=false;

/** Barrera global de sesión: ninguna primitiva automática puede pulsar Enviar durante una prueba. */
export function setAutomaticSimulationGuard(enabled:boolean):void {
  automaticSimulationGuard=enabled;
  console.debug("[tgs-bot] send primitive simulation guard",{enabled});
}

function findSendButton(): HTMLElement | null {
  for (const selector of SEND_BUTTON_SELECTORS) {
    const found = document.querySelector(selector);
    if (found instanceof HTMLElement) return found.closest("button") ?? found;
  }
  return null;
}

/**
 * Única vía de autoenvío. Inserta, pulsa enviar y confirma por mutación saliente.
 * Un timeout o cambio de chat se informa como fallo; nunca se presume que se envió.
 */
export async function sendMessageAutomatically(
  chatId: string,
  text: string,
  timeoutMs = 15000,
): Promise<OutgoingObservation & {ok:boolean; error?:string}> {
  if(automaticSimulationGuard){
    console.debug("[tgs-bot] automatic send refused",{reason:"simulation-guard",chatId});
    return {ok:false,confidence:0,text:null,filename:null,timedOut:false,error:"MODO PRUEBA: la primitiva rechazó el envío automático."};
  }
  const active = detectChat();
  const activeId = active.phone || active.name;
  if (!activeId || (chatId && activeId !== chatId && !chatId.endsWith(activeId))) {
    return {ok:false, confidence:0, text:null, filename:null, timedOut:false, error:"El chat activo no coincide con el destino; se canceló el envío."};
  }
  const inserted = await insertMessageIntoComposer(text);
  if (!inserted.ok) return {ok:false, confidence:0, text:null, filename:null, timedOut:false, error:inserted.error};
  const button = findSendButton();
  if (!button) return {ok:false, confidence:0, text:null, filename:null, timedOut:false, error:`No se encontró el botón Enviar (${SELECTOR_VERSION}).`};
  return new Promise((resolve) => {
    const observation = observeOutgoingMessage(activeId, text.slice(0, 180), timeoutMs, (result) => {
      resolve({
        ...result,
        ok: result.confidence >= 70 && !result.timedOut,
        ...(result.confidence >= 70 && !result.timedOut ? {} : {error: "WhatsApp no confirmó el mensaje saliente dentro del plazo."}),
      });
    });
    try {
      if(automaticSimulationGuard){
        observation.stop();
        resolve({ok:false,confidence:0,text:null,filename:null,timedOut:false,error:"MODO PRUEBA: envío cancelado antes del click."});
        return;
      }
      button.click();
    } catch (error) {
      observation.stop();
      resolve({ok:false, confidence:0, text:null, filename:null, timedOut:false, error:`Falló el click de envío: ${String(error)}`});
    }
  });
}
export async function attachFileToComposer(file:File):Promise<boolean>{try{const attachSelectors=["[data-testid='clip']","button[aria-label*='Adjuntar' i]","button[title*='Adjuntar' i]","span[data-icon='plus-rounded']","span[data-icon='clip']"];let trigger:HTMLElement|null=null;for(const selector of attachSelectors){const found=document.querySelector(selector);if(found instanceof HTMLElement){trigger=found.closest("button")??found;break}}if(!trigger)return false;trigger.click();await wait(250);const inputs=[...document.querySelectorAll("input[type='file']")].filter((node):node is HTMLInputElement=>node instanceof HTMLInputElement);const isImage=file.type.startsWith("image/");const input=inputs.find(node=>{const accept=(node.accept||"").toLowerCase();return isImage?accept.includes("image")||accept.includes("*"):accept.includes("pdf")||accept.includes("*")||(!accept.includes("image")&&!accept.includes("video"))});if(!input)return false;const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event("change",{bubbles:true}));return input.files?.length===1}catch{return false}}

/** Adjunta, confirma el preview, pulsa Enviar y exige observar un nuevo saliente. */
export async function sendAttachedFileAutomatically(
  chatId:string,
  file:File,
  timeoutMs=15000,
):Promise<OutgoingObservation&{ok:boolean;error?:string}> {
  if(automaticSimulationGuard){
    console.debug("[tgs-bot] automatic attachment refused",{reason:"simulation-guard",chatId,filename:file.name});
    return {ok:false,confidence:0,text:null,filename:file.name,timedOut:false,error:"MODO PRUEBA: la primitiva rechazó el envío automático del adjunto."};
  }
  const active=detectChat();
  const activeId=active.phone||active.name;
  if(!activeId||(chatId&&activeId!==chatId&&!chatId.endsWith(activeId))){
    return {ok:false,confidence:0,text:null,filename:null,timedOut:false,error:"El chat activo cambió antes de adjuntar el archivo."};
  }
  if(!await attachFileToComposer(file)){
    return {ok:false,confidence:0,text:null,filename:null,timedOut:false,error:"WhatsApp no aceptó el archivo adjunto."};
  }
  await wait(700);
  if(automaticSimulationGuard){
    console.debug("[tgs-bot] automatic attachment send refused",{reason:"simulation-enabled-during-preview",chatId,filename:file.name});
    return {ok:false,confidence:0,text:null,filename:file.name,timedOut:false,error:"MODO PRUEBA: envío del adjunto cancelado antes del click."};
  }
  const button=findSendButton();
  if(!button)return {ok:false,confidence:0,text:null,filename:null,timedOut:false,error:`No se encontró Enviar en el preview del adjunto (${SELECTOR_VERSION}).`};
  return new Promise(resolve=>{
    const observation=observeNextOutgoingMessage(activeId,timeoutMs,result=>resolve({
      ...result,
      filename:file.name,
      ok:result.confidence>=70&&!result.timedOut,
      ...(result.confidence>=70&&!result.timedOut?{}:{error:"WhatsApp no confirmó el envío del adjunto."}),
    }));
    try{
      if(automaticSimulationGuard){
        observation.stop();
        resolve({ok:false,confidence:0,text:null,filename:file.name,timedOut:false,error:"MODO PRUEBA: envío del adjunto cancelado antes del click."});
        return;
      }
      button.click();
    }catch(error){
      observation.stop();
      resolve({ok:false,confidence:0,text:null,filename:file.name,timedOut:false,error:`Falló el click de envío del adjunto: ${String(error)}`});
    }
  });
}
