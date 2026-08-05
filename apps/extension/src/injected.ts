const COMPOSER_SEL = "#main div[contenteditable='true'][role='textbox']";
const CAPTION_SELECTORS=[
  "[data-testid='media-caption-input-container'] div[contenteditable='true']",
  "[role='dialog'] div[contenteditable='true'][role='textbox']",
  "div[contenteditable='true'][aria-label*='comentario' i]",
  "div[contenteditable='true'][aria-label*='caption' i]",
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
type PageAction = "insert" | "clear" | "insertEmpty" | "insertCaption";
interface ContentRequest { source: "tgs-cs"; id: string; action: PageAction; text?: string }

function tgsComposer(): LexicalComposer | null {
  return document.querySelector<LexicalComposer>(COMPOSER_SEL);
}

function tgsCaptionComposer():LexicalComposer|null{
  for(const selector of CAPTION_SELECTORS){
    const nodes=[...document.querySelectorAll<LexicalComposer>(selector)];
    const visible=nodes.find(node=>node.offsetParent!==null&&node.__lexicalEditor);
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

function isContentRequest(value: unknown): value is ContentRequest {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ContentRequest>;
  return message.source === "tgs-cs"
    && typeof message.id === "string"
    && (message.action === "insert" || message.action === "clear" || message.action === "insertEmpty" || message.action === "insertCaption");
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window || !isContentRequest(event.data)) return;
  const { id, action, text } = event.data;
  try {
    let ok = false;
    if (action === "clear") ok = tgsClearComposer();
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
