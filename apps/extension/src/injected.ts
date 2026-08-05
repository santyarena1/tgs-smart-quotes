const COMPOSER_SEL = "#main div[contenteditable='true'][role='textbox']";
const CAPTION_SELECTORS=[
  "div[contenteditable='true'][aria-label*='coment' i]",
  "div[contenteditable='true'][aria-placeholder*='coment' i]",
  "div[contenteditable='true'][aria-label*='caption' i]",
  "div[contenteditable='true'][aria-placeholder*='caption' i]",
  "div[contenteditable='true'][aria-label*='pie de foto' i]",
  "div[contenteditable='true'][aria-placeholder*='pie de foto' i]",
  "div[contenteditable='true']",
];
const EMPTY_STATE = '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';

interface LexicalRoot {
  selectEnd(): { insertText(text: string): void };
}

interface LexicalEditor {
  _pendingEditorState: { _nodeMap: Map<string, LexicalRoot> };
  update(callback: () => void): void;
  parseEditorState(serialized: string): unknown;
  setEditorState(state: unknown): void;
}

type LexicalComposer = HTMLElement & { __lexicalEditor?: LexicalEditor };
type PageAction = "insert" | "clear" | "insertEmpty" | "insertCaption" | "pasteFile";
interface ContentRequest { source: "tgs-cs"; id: string; action: PageAction; text?: string;name?:string;type?:string;bytes?:ArrayBuffer }

function tgsComposer(): LexicalComposer | null {
  return document.querySelector<LexicalComposer>(COMPOSER_SEL);
}

function tgsCaptionComposer():LexicalComposer|null{
  const normal=tgsComposer();
  for(const selector of CAPTION_SELECTORS){
    const nodes=[...document.querySelectorAll<LexicalComposer>(selector)].reverse();
    const visible=nodes.find(node=>node!==normal&&node.offsetParent!==null&&!node.closest("#main footer")&&node.__lexicalEditor);
    if(visible)return visible;
  }
  return null;
}

function tgsInsertText(text: string,composer=tgsComposer()): boolean {
  const editor = composer?.__lexicalEditor;
  if (!editor) return false;
  editor.update(() => {
    const root = editor._pendingEditorState._nodeMap.get("root");
    if (!root) throw new Error("No se encontró el nodo raíz de Lexical.");
    root.selectEnd().insertText(text);
  });
  return true;
}

function tgsClearComposer(): boolean {
  const editor = tgsComposer()?.__lexicalEditor;
  if (!editor) return false;
  editor.setEditorState(editor.parseEditorState(EMPTY_STATE));
  return true;
}

function tgsPasteFile(name:string,type:string,bytes:ArrayBuffer):boolean{
  const composer=document.querySelector<HTMLElement>("#main [data-testid='conversation-compose-box-input'], #main footer [contenteditable='true']")??tgsComposer();
  if(!composer)return false;
  composer.focus();
  const file=new File([bytes],name,{type});
  const transfer=new DataTransfer();
  transfer.items.add(file);
  const pasteEvent=new ClipboardEvent("paste",{bubbles:true,cancelable:true});
  Object.defineProperty(pasteEvent,"clipboardData",{value:transfer});
  composer.dispatchEvent(pasteEvent);
  return transfer.files.length===1;
}

function isContentRequest(value: unknown): value is ContentRequest {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ContentRequest>;
  return message.source === "tgs-cs"
    && typeof message.id === "string"
    && (message.action === "insert" || message.action === "clear" || message.action === "insertEmpty" || message.action === "insertCaption" || message.action === "pasteFile")
    &&(message.action!=="pasteFile"||(typeof message.name==="string"&&typeof message.type==="string"&&message.bytes instanceof ArrayBuffer));
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window || !isContentRequest(event.data)) return;
  const { id, action, text,name,type,bytes } = event.data;
  try {
    let ok = false;
    if (action === "clear") ok = tgsClearComposer();
    else if(action==="pasteFile")ok=tgsPasteFile(name!,type!,bytes!);
    else if (typeof text !== "string") throw new Error("La acción requiere texto.");
    else if(action==="insertCaption")ok=tgsInsertText(text,tgsCaptionComposer());
    else if (action === "insert") ok = tgsInsertText(text);
    else ok = tgsClearComposer() && tgsInsertText(text);

    window.postMessage({
      source: "tgs-page",
      id,
      ok,
      ...(ok ? {} : { error: "No se encontró el editor Lexical del composer de WhatsApp." }),
    }, "*");
  } catch (error) {
    window.postMessage({ source: "tgs-page", id, ok: false, error: String(error) }, "*");
  }
});
