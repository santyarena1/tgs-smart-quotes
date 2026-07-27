/**
 * Adaptador central de selectores DOM de WhatsApp Web.
 *
 * WhatsApp cambia su DOM sin previo aviso, así que TODA lectura de la página vive acá adentro,
 * versionada, con múltiples estrategias de fallback y un puntaje de confianza (0-100) que la UI
 * del panel usa para decidir si mostrar una advertencia. Nunca se debe silenciar un fallo de
 * detección: si nada matchea, `detectChat()` devuelve confianza 0 y un `warning` explícito.
 */

export const SELECTOR_VERSION = "2026-07-block7";

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
    headerTitle:
      "[data-testid='conversation-info-header-chat-title'], span[title]",
    composer:
      "[data-testid='conversation-compose-box-input'], footer [contenteditable='true']",
  },
  {
    id: "fallback-main",
    label: "cabecera dentro de #main",
    header: "#main header",
    headerTitle: "h1, h2, span[title]",
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
  const nodes = document.querySelectorAll("[data-id]");
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

/** Inserta texto en el composer de WhatsApp. NUNCA envía: el usuario decide cuándo apretar enviar. */
export function insertMessageIntoComposer(text: string): InsertResult {
  const composer = findComposer();
  if (!composer) {
    return {
      ok: false,
      error:
        "No se encontró el cuadro de mensaje de WhatsApp. Abrí un chat y volvé a intentar (ver dom-selectors.ts).",
    };
  }
  composer.focus();
  const inserted = document.execCommand("insertText", false, text);
  composer.dispatchEvent(
    new InputEvent("input", { bubbles: true, inputType: "insertText" }),
  );
  if (!inserted) {
    return { ok: false, error: "El navegador rechazó insertar el texto (execCommand falló)." };
  }
  return { ok: true };
}

/** Detecta salientes recientes para asistir en la confirmación de un intento (nunca autoenvía). */
export function findLastOutgoingMessageText(): string | null {
  const nodes = document.querySelectorAll("div.message-out, [data-testid='msg-container']");
  const last = nodes[nodes.length - 1];
  return last?.textContent?.trim() || null;
}

const MESSAGE_CONTAINER_SELECTORS = ["#main [role='application']", "#main .copyable-area", "#main"];
function messageContainer(): Element | null { for (const selector of MESSAGE_CONTAINER_SELECTORS) { const el=document.querySelector(selector); if(el)return el; } return null; }
function normalizeMessage(value:string):string{return value.toLowerCase().replace(/\s+/g," ").trim()}
function lastMessage(selector:string):Element|null{const nodes=document.querySelectorAll(selector);return nodes[nodes.length-1]??null}
export function findLastIncomingMessageText():string|null{return lastMessage("div.message-in, [data-testid='msg-container'] [data-icon='msg-dblcheck']")?.textContent?.trim()||lastMessage("div.message-in")?.textContent?.trim()||null}
export type OutgoingObservation={confidence:number;text:string|null;filename:string|null;timedOut:boolean};
export function observeOutgoingMessage(chatId:string,expectedTextFragment:string,timeoutMs:number,onResult:(result:OutgoingObservation)=>void,expectedFilename?:string):{stop():void}{
  const container=messageContainer();let stopped=false;const initial=findLastOutgoingMessageText(),expected=normalizeMessage(expectedTextFragment).slice(0,180);
  const stop=()=>{if(stopped)return;stopped=true;observer?.disconnect();window.clearTimeout(timer)};
  const inspect=()=>{if(stopped)return;const active=detectChat(),activeId=active.phone||active.name;if(chatId&&activeId&&activeId!==chatId){stop();return}const node=lastMessage("div.message-out")??lastMessage("[data-testid='msg-container']"),text=findLastOutgoingMessageText();if(!text||text===initial)return;const normalized=normalizeMessage(text),textMatches=Boolean(expected)&&normalized.includes(expected);const filename=node?.querySelector("[title$='.pdf'], [data-testid='document-thumb']")?.getAttribute("title")??node?.textContent?.match(/[\w ._-]+\.pdf/i)?.[0]??null;const fileMatches=Boolean(filename)&&(!expectedFilename||normalizeMessage(filename!).includes(normalizeMessage(expectedFilename).replace(/\.pdf$/,"")));const confidence=textMatches&&fileMatches?100:textMatches?70:40;if(confidence>=70){stop();onResult({confidence,text,filename,timedOut:false})}};
  const observer=container?new MutationObserver(inspect):null;if(observer&&container)observer.observe(container,{childList:true,subtree:true,characterData:true});const timer=window.setTimeout(()=>{if(stopped)return;const text=findLastOutgoingMessageText();stop();onResult({confidence:text&&text!==initial?40:0,text,filename:null,timedOut:true})},timeoutMs);if(!container)queueMicrotask(()=>{stop();onResult({confidence:0,text:null,filename:null,timedOut:true})});return{stop};
}
function wait(ms:number){return new Promise(resolve=>window.setTimeout(resolve,ms))}
export async function attachFileToComposer(file:File):Promise<boolean>{try{const attachSelectors=["[data-testid='clip']","button[aria-label*='Adjuntar' i]","button[title*='Adjuntar' i]","span[data-icon='plus-rounded']","span[data-icon='clip']"];let trigger:HTMLElement|null=null;for(const selector of attachSelectors){const found=document.querySelector(selector);if(found instanceof HTMLElement){trigger=found.closest("button")??found;break}}if(!trigger)return false;trigger.click();await wait(250);const inputs=[...document.querySelectorAll("input[type='file']")].filter((node):node is HTMLInputElement=>node instanceof HTMLInputElement);const input=inputs.find(node=>{const accept=(node.accept||"").toLowerCase();return accept.includes("pdf")||accept.includes("*")||(!accept.includes("image")&&!accept.includes("video"))});if(!input)return false;const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event("change",{bubbles:true}));return input.files?.length===1}catch{return false}}
