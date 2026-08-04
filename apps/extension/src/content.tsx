import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { applyNativeChatStatuses, attachFileToComposer, clearComposerIfMatches, detectChat, detectChatList, findLastIncomingMessage, findLastIncomingMessageText, findRecentMessageSnippets, insertMessageIntoComposer, insertMessageIntoEmptyComposer, lastOpenMessageDirection, observeActiveChat, observeNextOutgoingMessage, observeOutgoingMessage, readComposerText, sendAttachedFileAutomatically, sendMessageAutomatically, setAutomaticSimulationGuard, switchToChat, waitForActiveChat, type ChatDetection, type NativeChatStatus } from "./dom-selectors";
import {
  changeQuoteState,
  createQuickRequest,
  createQuoteVersion,
  createSendAttempt,
  errorMessage,
  generatePdf,
  getQuote,
  getTimeline,
  getLatestSentQuote,
  generateVersionPdf,
  versionPdfDownloadPath,
  listCollections,
  listNotifications,
  listRequests,
  markNotification,
  pdfDownloadPath,
  reactivateQuote,
  resolveSendAttempt,
  searchQuotes,
  suggestResponse,
  downloadFile,
  fetchBlob,
  openAuthenticated,
  createQuoteReply,
  listCustomers,
  classifyIntent,
  probeExtensionConnection,
  getChatbotSettings,
  setChatbotEnabled,
  getChatbotConversation,
  updateChatbotConversation,
  listChatbotConversations,
  respondChatbot,
  listChatbotLogs,
  actOnChatbotLog,
  createRequestFromChatbotSuggestion,
  getRecontactCandidates,
  generateRecontact,
  markRecontactSent,
  getChatbotContext,
  createCustomer,
  createCustomerQuick,
  updateRequest,
  type ExtensionConnection,
} from "./lib/api";
import { formatArs, formatDateTime } from "./lib/format";
import type {
  Collection,
  NotificationRow,
  PdfKind,
  Quote,
  QuoteRequest,
  QuoteState,
  QuoteTimeline,
  SendAttemptStatus,
  Customer,
  ReplyIntent,
  ChatbotSettings,
  ChatbotConversation,
  ChatbotLog,
  ChatbotMode,
  ChatbotChatContext,
  LatestSentQuote,
  ChatbotResolvedAttachment,
} from "./lib/types";
import { Alert, ConfidenceBar, ConfirmModal, EmptyState, Field, ModalShell, Pill, Section, Skeleton, Tabs, Tone, injectPanelStyles } from "./panel/ui";
import { CustomerModal, QuickEditModal } from "./panel/modals";

const STATE_LABEL: Record<QuoteState, string> = {
  BORRADOR: "Borrador",
  ENVIADO: "Enviado",
  ACEPTADO: "Aceptado",
  RECHAZADO: "Rechazado",
  REEMPLAZADO: "Reemplazado",
  NO_CONCRETADO: "No concretado",
};

const STATE_TONE: Record<QuoteState, Tone> = {
  BORRADOR: "warn",
  ENVIADO: "info",
  ACEPTADO: "ok",
  RECHAZADO: "bad",
  REEMPLAZADO: "neutral",
  NO_CONCRETADO: "neutral",
};

function defaultMessage(quote: Quote): string {
  const total = formatArs(quote.version?.totalSaleCents);
  return `Hola! Te comparto el presupuesto ${quote.visibleNumber} por un total de ${total}. Cualquier consulta quedo a disposición.`;
}

function nameIsOnlyThePhone(name:string,phone:string):boolean {
  if(!name||!phone||!/^[+\d\s().-]+$/.test(name.trim()))return false;
  const nameDigits=name.replace(/\D/g,"");
  const phoneDigits=phone.replace(/\D/g,"");
  return nameDigits.length>=7
    &&(nameDigits===phoneDigits
      ||phoneDigits.endsWith(nameDigits)
      ||nameDigits.endsWith(phoneDigits));
}

/** Panel de detección + estado del chat, con confianza 0-100 y advertencia nunca silenciada. */
function ChatDetectionCard({detection,onRetry,phone,name,onPhoneChange,onNameChange}:{detection:ChatDetection;onRetry:()=>void;phone:string;name:string;onPhoneChange:(v:string)=>void;onNameChange:(v:string)=>void}) {
  const [expanded,setExpanded]=useState(false);
  const statusIcon=detection.confidence>=70?"🟢":detection.confidence>=40?"🟡":"🔴";
  const realFailure=Boolean(detection.warning)&&detection.confidence===0;
  const detectedNameUnavailable=nameIsOnlyThePhone(detection.name,detection.phone);
  const nameIsPhone=nameIsOnlyThePhone(name,phone);
  const visibleName=nameIsPhone||(!name&&detectedNameUnavailable)
    ?"Contacto sin nombre visible"
    :name||"Sin detectar";
  return <div className="tgs-list-item">
    <div className="tgs-row between">
      <div className="tgs-row"><span aria-label="Estado de detección">{statusIcon}</span><b>{visibleName}</b><span className="tgs-muted">·</span><span className="tgs-muted">{phone||"Sin teléfono"}</span>{realFailure?<span title="No se pudo detectar el chat">⚠</span>:null}</div>
      <button className="tgs-btn ghost sm" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?"Cerrar":"⚙ Editar"}</button>
    </div>
    {expanded?<div className="tgs-stack">
      <div className="tgs-row"><ConfidenceBar value={detection.confidence}/><span className="tgs-muted">{detection.confidence}%</span></div>
      {detection.warning?<Alert tone={detection.name&&!detection.phone?"info":detection.confidence===0?"bad":"warn"}>{detection.warning} <button className="tgs-btn ghost sm" onClick={onRetry}>Reintentar detección</button></Alert>:null}
      {detectedNameUnavailable&&!name?<Alert tone="info">WhatsApp no muestra el nombre del contacto en esta vista. Podés escribirlo manualmente abajo si lo conocés.</Alert>:null}
      <div className="tgs-row"><Field label="Nombre para usar"><input className="tgs-input" value={nameIsPhone?"":name} onChange={e=>onNameChange(e.target.value)} placeholder="Completalo si WhatsApp sólo muestra el teléfono"/></Field><Field label="Teléfono detectado"><input className="tgs-input" value={phone} onChange={e=>onPhoneChange(e.target.value)} placeholder="Sin detectar"/></Field></div>
      <div className="tgs-muted">Método: {detection.method} · set: {detection.selectorSetId}. Podés corregir los datos a mano.</div>
    </div>:null}
  </div>;
}
function relativeTime(value:string){const minutes=Math.max(0,Math.round((Date.now()-new Date(value).getTime())/60000));if(minutes<1)return "ahora";if(minutes<60)return `hace ${minutes} min`;const hours=Math.round(minutes/60);if(hours<24)return `hace ${hours} h`;return `hace ${Math.round(hours/24)} d`}
function NotificationsBell({notifications,open,onToggle,onMark,error,loading}:{notifications:NotificationRow[];open:boolean;onToggle:()=>void;onMark:(id:string,body:{read?:boolean;acted?:boolean})=>void;error:string|null;loading:boolean}){const unread=notifications.filter(n=>!n.readAt).length;const icon=(type:string)=>type.includes("ERROR")?"⚠":type.includes("ACEPT")?"✓":"●";return <div style={{position:"relative"}}><button className="tgs-btn ghost sm" onClick={onToggle} aria-label="Notificaciones">🔔{unread?<span className="tgs-badge-dot">{unread}</span>:null}</button>{open?<aside className="tgs-notifications"><div className="tgs-notifications-header">Notificaciones</div><div className="tgs-notifications-body">{error?<Alert tone="bad">{error}</Alert>:loading?<Skeleton rows={4}/>:notifications.length?<>{notifications.map(n=><div className="tgs-notification" key={n.id} onClick={()=>onMark(n.id,{read:true})}><Pill tone={n.readAt?"neutral":"info"}>{icon(n.type)}</Pill><div><b>{n.title}</b><div className="tgs-muted">{n.body}</div><div className="tgs-muted">{relativeTime(n.createdAt)}</div></div></div>)}</>:<EmptyState icon="🔔" text="No hay notificaciones nuevas."/>}</div>{unread?<div className="tgs-notifications-footer"><button className="tgs-btn ghost sm" onClick={()=>notifications.filter(n=>!n.readAt).forEach(n=>onMark(n.id,{read:true}))}>Marcar todas como leídas</button></div>:null}</aside>:null}</div>}
function QuoteSummaryCard({ quote }: { quote: Quote }) {
  const v = quote.version;
  return (
    <div className="tgs-list-item selected">
      <div className="tgs-row" style={{ justifyContent: "space-between" }}>
        <span className="tgs-strong">{quote.visibleNumber}</span>
        {v ? <Pill tone={STATE_TONE[v.state]}>{STATE_LABEL[v.state]}</Pill> : null}
      </div>
      <div>{quote.internalName}</div>
      <div className="tgs-muted">{quote.customer?.name ?? "Sin cliente"}</div>
      <div className="tgs-strong">{formatArs(v?.totalSaleCents)}</div>
      <div className="tgs-muted">Versión {v?.version ?? quote.activeVersion}</div>
    </div>
  );
}

function VersionEditModal({initialMessage,onCancel,onConfirm,busy}:{initialMessage:string;onCancel:()=>void;onConfirm:(message:string,note:string)=>void;busy:boolean}){const[message,setMessage]=useState(initialMessage),[note,setNote]=useState("");return <ModalShell title="Crear nueva versión" subtitle="La versión anterior permanece congelada" onClose={onCancel} footer={<><button className="tgs-btn ghost" onClick={onCancel} disabled={busy}>Cancelar</button><button className="tgs-btn" disabled={busy} onClick={()=>onConfirm(message,note.trim())}>{busy?"Creando…":"Crear nueva versión"}</button></>}><div className="tgs-stack"><Alert tone="warn">Se creará una versión nueva en borrador con los mismos ítems.</Alert><Field label="Mensaje nuevo"><textarea className="tgs-input" value={message} onChange={e=>setMessage(e.target.value)}/></Field><Field label="Nombre de este cambio (opcional)"><input className="tgs-input" value={note} onChange={e=>setNote(e.target.value)} placeholder="Ej: Ajuste de precio por cliente"/></Field></div></ModalShell>}
function VersionHistory({quote,onReload}:{quote:Quote;onReload:(id:string)=>Promise<void>}) {
  const [preview,setPreview]=useState<Quote["versions"][number]|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  async function restore(){
    if(!preview)return;
    const suggested=`Restaurada desde V${preview.version}`;
    const reason=window.prompt("Nombre de esta restauración (opcional)",suggested);
    if(reason===null)return;
    setBusy(true);setError(null);
    try{
      await createQuoteVersion(quote.id,reason.trim()||suggested,preview.version);
      setPreview(null);
      await onReload(quote.id);
    }catch(e){setError(errorMessage(e))}finally{setBusy(false)}
  }
  async function download(version:number){
    setBusy(true);setError(null);
    try{
      await generateVersionPdf(quote.id,version);
      await downloadFile(versionPdfDownloadPath(quote.id,version),`${quote.visibleNumber}-V${version}-SIMPLE.pdf`);
    }catch(e){setError(errorMessage(e))}finally{setBusy(false)}
  }
  return <Section title="Versiones e historial">
    {error?<Alert tone="bad">{error}</Alert>:null}
    <div className="tgs-list">
      {quote.versions.map(v=><div className="tgs-list-item" key={v.id}>
        <div className="tgs-row between"><Pill tone={STATE_TONE[v.state]}>V{v.version} · {STATE_LABEL[v.state]}</Pill>{v.version===quote.activeVersion?<span className="tgs-muted">Última</span>:null}</div>
        <b>{v.reason||"Sin nombre de cambio"}</b>
        <div className="tgs-muted">{v.createdAt?formatDateTime(v.createdAt):"Sin fecha"} · {v.creator?.displayName||v.creator?.username||"Sin creador"}</div>
        <div className="tgs-row"><button className="tgs-btn ghost sm" onClick={()=>setPreview(v)}>Ver componentes</button><button className="tgs-btn ghost sm" disabled={busy} onClick={()=>void download(v.version)}>Descargar PDF</button><button className="tgs-btn ghost sm" onClick={()=>setPreview(v)}>Recrear</button></div>
      </div>)}
    </div>
    {preview?<ModalShell title={`Preview · Versión ${preview.version}`} subtitle={preview.reason||"Sin nombre de cambio"} onClose={()=>setPreview(null)} footer={<><button className="tgs-btn ghost" onClick={()=>setPreview(null)}>Cerrar</button><button className="tgs-btn" disabled={busy} onClick={()=>void restore()}>{busy?"Restaurando…":"Restaurar versión"}</button></>}>
      <div className="tgs-list">{preview.items.map((item,index)=><div className="tgs-list-item" key={item.id??index}><div className="tgs-row between"><span>{item.frozenName??item.name}</span><b>{formatArs(item.subtotalCents)}</b></div><div className="tgs-muted">{item.quantity} × {formatArs(item.frozenSalePriceCents??item.salePriceCents)}</div></div>)}</div>
      <div className="tgs-row between"><b>Total</b><b>{formatArs(preview.totalSaleCents)}</b></div>
    </ModalShell>:null}
  </Section>;
}
/** Panel de acciones de un presupuesto seleccionado: PDF, mensaje, intentos, estado, timeline, IA. */
function QuoteDetail({
  quote,
  detection,
  phoneOverride,
  nameOverride,
  onReload,
}: {
  quote: Quote;
  detection: ChatDetection;
  phoneOverride: string;
  nameOverride: string;
  onReload: (id: string) => Promise<void>;
}) {
  const version = quote.version;
  const locked = Boolean(version && version.state !== "BORRADOR");

  const [message, setMessage] = useState(version?.sentMessage || defaultMessage(quote));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pdfKindChoice, setPdfKindChoice] = useState<PdfKind>("SIMPLE");
  const [pdfBusy, setPdfBusy] = useState<Partial<Record<PdfKind, boolean>>>({});
  const [pdfReady, setPdfReady] = useState<Partial<Record<PdfKind, boolean>>>({});

  const [internalNote, setInternalNote] = useState("");
  const [versionModalOpen, setVersionModalOpen] = useState(false);

  const [timeline, setTimeline] = useState<QuoteTimeline | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [aiBusy, setAiBusy] = useState(false);
  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const [pdfFallback, setPdfFallback] = useState<PdfKind | null>(null);
  const [sendReview, setSendReview] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "state"; state: QuoteState } | { type: "reactivate" } | { type: "ai"; text: string } | null>(null);
  const [confirmReason, setConfirmReason] = useState("");
  const [replyResult, setReplyResult] = useState<{ text: string; intent: ReplyIntent; confidence: number } | null>(null);

  useEffect(() => {
    setMessage(version?.sentMessage || defaultMessage(quote));
    setPdfReady({});
  }, [quote.id, version?.id]);

  const loadTimeline = useCallback(async () => {
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      setTimeline(await getTimeline(quote.id));
    } catch (err) {
      setTimelineError(errorMessage(err));
    } finally {
      setTimelineLoading(false);
    }
  }, [quote.id]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  async function reload() {
    await onReload(quote.id);
    await loadTimeline();
  }

  async function handlePreparePdf(kind: PdfKind) {
    setPdfBusy((p) => ({ ...p, [kind]: true }));
    setError(null);
    setNotice(null);
    try {
      const result = await generatePdf(quote.id, kind);
      setPdfReady((p) => ({ ...p, [kind]: true }));
      setNotice(
        result.immutable
          ? `PDF ${kind} histórico (versión enviada, inmutable).`
          : result.reused
            ? `PDF ${kind} reutilizado (sin cambios).`
            : `PDF ${kind} generado.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPdfBusy((p) => ({ ...p, [kind]: false }));
    }
  }

  async function handleDownloadPdf(kind: PdfKind) {
    setError(null);
    try {
      await downloadFile(
        pdfDownloadPath(quote.id, kind),
        `${quote.visibleNumber}-${kind}.pdf`,
      );
      setNotice(`Descarga de PDF ${kind} iniciada.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handlePrepareAndAttach(kind: PdfKind) {
    if (!message.trim()) { setError("El mensaje no puede estar vacío."); return; }
    setBusy(true); setError(null); setNotice(null); setPdfFallback(null); setSendReview(null);
    try {
      if (!pdfReady[kind]) await handlePreparePdf(kind);
      const inserted = await insertMessageIntoComposer(message);
      if (!inserted.ok) throw new Error(inserted.error ?? "No se pudo insertar el mensaje.");
      const filename = `${quote.visibleNumber}-V${version?.version ?? quote.activeVersion}-${kind}.pdf`;
      const blob = await fetchBlob(pdfDownloadPath(quote.id, kind));
      const attached = await attachFileToComposer(new File([blob], filename, { type: "application/pdf" }));
      if (!attached) { setPdfFallback(kind); return; }
      setNotice("PDF adjuntado. Revisá el mensaje antes de enviar.");
      const attempt = await createSendAttempt(quote.id, { chatPhone: phoneOverride || null, chatName: nameOverride || null, message, pdfKind: kind, pdfName: filename, confidence: detection.confidence, internalNote: internalNote.trim() || null });
      observeOutgoingMessage(phoneOverride || nameOverride, message.slice(0, 180), 45000, (result) => {
        void (async () => {
          if (result.confidence >= 70) {
            await resolveSendAttempt(quote.id, attempt.id, { status: "CONFIRMADO_AUTO", confidence: result.confidence });
            setNotice("Envío detectado y confirmado automáticamente. Tocá las opciones del intento si fue un error.");
          } else {
            if (result.confidence > 0) await resolveSendAttempt(quote.id, attempt.id, { status: "AMBIGUO", confidence: result.confidence, createDelivery: false });
            setSendReview("No pudimos confirmar automáticamente el envío. ¿Se envió correctamente?");
          }
          await reload();
        })().catch(err => setError(errorMessage(err)));
      }, filename);
      await loadTimeline();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function handleCreateSendAttempt() {
    if (!message.trim()) {
      setError("El mensaje no puede estar vacío para registrar un intento.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createSendAttempt(quote.id, {
        chatPhone: phoneOverride || null,
        chatName: nameOverride || null,
        message,
        pdfKind: pdfReady[pdfKindChoice] ? pdfKindChoice : null,
        confidence: detection.confidence,
        internalNote: internalNote.trim() || null,
      });
      setNotice("Intento de envío registrado (PENDIENTE). No se envió nada automáticamente.");
      setInternalNote("");
      await loadTimeline();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResolveAttempt(attemptId: string, status: SendAttemptStatus) {
    setBusy(true);
    setError(null);
    try {
      await resolveSendAttempt(quote.id, attemptId, { status });
      setNotice(`Intento resuelto como ${status}.`);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function handleChangeState(state: QuoteState) { setConfirmReason(""); setConfirmAction({ type: "state", state }); }

  function handleReactivate() { setConfirmReason(""); setConfirmAction({ type: "reactivate" }); }

  async function handleVersionConfirm(newMessage: string, note: string) {
    setBusy(true);
    setError(null);
    try {
      await createQuoteVersion(quote.id, note);
      setMessage(newMessage);
      setVersionModalOpen(false);
      await reload();
      setQuickEditOpen(true);
      setNotice("Nueva versión creada en borrador. Ya podés editarla; la anterior sigue intacta.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAiSuggest() {
    setAiBusy(true);
    setError(null);
    setNotice(null);
    try {
      const suggestion = await suggestResponse(quote.id);
      if (!message.trim() || message === defaultMessage(quote)) setMessage(suggestion.result.text);
      else setConfirmAction({ type: "ai", text: suggestion.result.text });
      setNotice(
        suggestion.metadata.usedAi
          ? "Sugerencia de IA aplicada. Revisala antes de enviar."
          : "IA deshabilitada: se aplicó una sugerencia heurística de respaldo. Revisala.",
      );
    } catch (err) {
      setNotice("No se pudo sugerir con IA; completá el mensaje manualmente.");
    } finally {
      setAiBusy(false);
    }
  }

  async function executeConfirmedAction() {
    if (!confirmAction) return;
    setBusy(true); setError(null);
    try {
      if (confirmAction.type === "state") { await changeQuoteState(quote.id, confirmAction.state, confirmReason.trim() || null); setNotice(`Estado actualizado a ${STATE_LABEL[confirmAction.state]}.`); await reload(); }
      if (confirmAction.type === "reactivate") { await reactivateQuote(quote.id, confirmReason.trim()); setNotice("Presupuesto reactivado en una nueva versión borrador."); await reload(); }
      if (confirmAction.type === "ai") { setMessage(confirmAction.text); setNotice("Sugerencia aplicada. Revisala antes de enviar."); }
      setConfirmAction(null); setConfirmReason("");
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  function classifyReply(text: string): { intent: ReplyIntent; confidence: number } {
    const value=text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    if (/\b(dale|acepto|si|confirmo|hagamoslo)\b/.test(value)) return { intent:"ACEPTA", confidence:85 };
    if (/\b(no|caro|otro lado|rechazo)\b/.test(value)) return { intent:"RECHAZA", confidence:80 };
    if (/\b(bajar|cambiar|otra|podes|podrias)\b/.test(value)) return { intent:"PIDE_CAMBIO", confidence:75 };
    if (/\?|consulta|pregunta|como|cuando/.test(value)) return { intent:"CONSULTA", confidence:70 };
    return { intent:"AMBIGUA", confidence:40 };
  }
  async function analyzeReply() {
    const text=findLastIncomingMessageText(); if(!text){setError("No se encontró un mensaje entrante en el chat activo.");return}
    let result=classifyReply(text);
    if(result.intent==="AMBIGUA") { try { const ai=await classifyIntent(quote.id,text); result={intent:ai.result.intent,confidence:ai.result.confidence}; } catch { /* IA opcional: conserva resultado determinístico */ } }
    setReplyResult({text,...result});
    try { await createQuoteReply(quote.id,{chatPhone:phoneOverride||null,text,intent:result.intent,confidence:result.confidence,source:"HEURISTICA"}); }
    catch(err){setError(errorMessage(err))}
  }
  async function applyReplyState(state: "ACEPTADO"|"RECHAZADO"|null) {
    if(!replyResult)return;setBusy(true);try{await createQuoteReply(quote.id,{chatPhone:phoneOverride||null,text:replyResult.text,intent:replyResult.intent,confidence:replyResult.confidence,source:"HEURISTICA_CONFIRMADA",applyState:state});setNotice(state?`Respuesta confirmada; estado ${state}.`:"Respuesta registrada como consulta sin cambiar estado.");setReplyResult(null);await reload()}catch(err){setError(errorMessage(err))}finally{setBusy(false)}
  }
  const canReactivate = version?.state === "NO_CONCRETADO" || version?.state === "RECHAZADO";

  return (
    <div>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      <QuoteSummaryCard quote={quote} />
      <button className="tgs-btn" style={{ width: "100%", marginTop: 8 }} onClick={() => locked ? setVersionModalOpen(true) : setQuickEditOpen(true)}>Editar presupuesto</button>
      <VersionHistory quote={quote} onReload={onReload} />

      <Section title="Mensaje y PDF" defaultOpen>
        <div className="tgs-row">
          <Field label="PDF a preparar">
            <select
              className="tgs-input"
              value={pdfKindChoice}
              onChange={(e) => setPdfKindChoice(e.target.value as PdfKind)}
            >
              <option value="SIMPLE">Simple</option>
              <option value="DETALLADO">Detallado</option>
            </select>
          </Field>
        </div>
        <div className="tgs-row">
          <button
            className="tgs-btn ghost sm"
            disabled={Boolean(pdfBusy[pdfKindChoice])}
            onClick={() => void handlePreparePdf(pdfKindChoice)}
          >
            {pdfBusy[pdfKindChoice] ? "Preparando…" : "Preparar PDF"}
          </button>
          <button
            className="tgs-btn ghost sm"
            disabled={!pdfReady[pdfKindChoice]}
            onClick={() => void handleDownloadPdf(pdfKindChoice)}
          >
            Descargar PDF
          </button>
        </div>

        <Field label={locked ? "Mensaje (versión enviada, solo lectura)" : "Mensaje editable"}>
          <textarea
            className="tgs-input"
            rows={4}
            value={message}
            disabled={locked}
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>
        {locked ? (
          <button className="tgs-btn warn sm" onClick={() => setVersionModalOpen(true)}>
            Editar mensaje (crea nueva versión)
          </button>
        ) : null}
        <div className="tgs-row">
          <button className="tgs-btn sm" disabled={busy} onClick={() => void handlePrepareAndAttach(pdfKindChoice)}>{busy ? "Preparando…" : "Preparar mensaje y PDF"}</button>
          <button className="tgs-btn ghost sm" disabled={aiBusy} onClick={() => void handleAiSuggest()}>
            {aiBusy ? "Sugiriendo…" : "Sugerir con IA"}
          </button>
        </div>
        {pdfFallback ? <Alert tone="warn">No pudimos adjuntar el PDF automáticamente (cambio de interfaz de WhatsApp). Descargalo y adjuntalo manualmente.<div className="tgs-row" style={{marginTop:6}}><button className="tgs-btn ghost sm" onClick={()=>void handleDownloadPdf(pdfFallback)}>Descargar PDF</button><button className="tgs-btn ghost sm" onClick={()=>void openAuthenticated(pdfDownloadPath(quote.id,pdfFallback))}>Abrir PDF</button></div></Alert> : null}
        {sendReview ? <Alert tone="warn">{sendReview}</Alert> : null}        <p className="tgs-muted">
          El envío final siempre queda bajo control del vendedor: esta extensión nunca aprieta
          "enviar".
        </p>
      </Section>

      <Section title="Registrar / resolver intento de envío">
        <Field label="Nota interna (opcional)">
          <input
            className="tgs-input"
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
          />
        </Field>
        <button className="tgs-btn sm" disabled={busy} onClick={() => void handleCreateSendAttempt()}>
          Registrar intento de envío
        </button>

        {timelineLoading ? <Skeleton rows={4} /> : null}
        {timelineError ? <Alert tone="bad">{timelineError}</Alert> : null}
        {timeline && timeline.attempts.length > 0 ? (
          <div className="tgs-list">
            {timeline.attempts
              .slice()
              .reverse()
              .map((a) => (
                <div key={a.id} className="tgs-list-item">
                  <div className="tgs-row" style={{ justifyContent: "space-between" }}>
                    <Pill
                      tone={
                        a.status === "PENDIENTE"
                          ? "warn"
                          : a.status.startsWith("CONFIRMADO")
                            ? "ok"
                            : a.status === "AMBIGUO"
                              ? "bad"
                              : "neutral"
                      }
                    >
                      {a.status}
                    </Pill>
                    <span className="tgs-muted">{formatDateTime(a.createdAt)}</span>
                  </div>
                  <div className="tgs-muted">{a.chatName || a.chatPhone || "Chat sin datos"}</div>
                  {true ? (
                    <div className="tgs-row" style={{ marginTop: 4 }}>
                      <button
                        className="tgs-btn sm"
                        disabled={busy}
                        onClick={() => void handleResolveAttempt(a.id, "CONFIRMADO_MANUAL")}
                      >
                        Confirmar
                      </button>
                      <button
                        className="tgs-btn neutral sm"
                        disabled={busy}
                        onClick={() => void handleResolveAttempt(a.id, "NO_ENVIADO")}
                      >
                        No enviado
                      </button>
                      <button
                        className="tgs-btn warn sm"
                        disabled={busy}
                        onClick={() => void handleResolveAttempt(a.id, "AMBIGUO")}
                      >
                        Ambiguo
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        ) : null}
      </Section>

      {version?.state === "ENVIADO" ? <Section title="Respuesta del cliente" defaultOpen><button className="tgs-btn ghost" onClick={()=>void analyzeReply()}>Analizar última respuesta</button>{replyResult?<Alert tone="info">Intent detectado: <b>{replyResult.intent}</b> ({replyResult.confidence}%).<div className="tgs-row" style={{marginTop:6}}><button className="tgs-btn" disabled={busy} onClick={()=>void applyReplyState("ACEPTADO")}>Marcar como Aceptado</button><button className="tgs-btn danger" disabled={busy} onClick={()=>void applyReplyState("RECHAZADO")}>Marcar como Rechazado</button><button className="tgs-btn ghost" disabled={busy} onClick={()=>void applyReplyState(null)}>Fue una consulta, no cambiar estado</button></div></Alert>:null}</Section>:null}
      <Section title="Estado del presupuesto">
        <div className="tgs-row">
          <button className="tgs-btn sm" disabled={busy} onClick={() => handleChangeState("ACEPTADO")}>
            Aceptado
          </button>
          <button className="tgs-btn danger sm" disabled={busy} onClick={() => handleChangeState("RECHAZADO")}>
            Rechazado
          </button>
        </div>
        <div className="tgs-row">
          <button className="tgs-btn warn sm" disabled={busy} onClick={() => handleChangeState("REEMPLAZADO")}>
            Reemplazado
          </button>
          <button
            className="tgs-btn neutral sm"
            disabled={busy}
            onClick={() => handleChangeState("NO_CONCRETADO")}
          >
            No concretado
          </button>
          {canReactivate ? (
            <button className="tgs-btn warn sm" disabled={busy} onClick={handleReactivate}>
              Reactivar
            </button>
          ) : null}
        </div>
      </Section>

      {quickEditOpen ? <QuickEditModal quote={quote} onClose={()=>setQuickEditOpen(false)} onSaved={reload} /> : null}
      {confirmAction ? <ConfirmModal title={confirmAction.type === "state" ? `Cambiar a ${STATE_LABEL[confirmAction.state]}` : confirmAction.type === "reactivate" ? "Reactivar presupuesto" : "Aplicar sugerencia"} tone={confirmAction.type === "state" && confirmAction.state === "RECHAZADO" ? "danger" : confirmAction.type === "state" && confirmAction.state === "ACEPTADO" ? "ok" : "warn"} confirmLabel="Confirmar" busy={busy} inputLabel={confirmAction.type === "reactivate" ? "Motivo de reactivación" : undefined} inputValue={confirmReason} onInputChange={setConfirmReason} onCancel={()=>setConfirmAction(null)} onConfirm={()=>void executeConfirmedAction()}>{confirmAction.type === "ai" ? "Se reemplazará el texto actual por la sugerencia." : "Esta acción modifica el estado del presupuesto y quedará auditada."}</ConfirmModal> : null}      {versionModalOpen ? (
        <VersionEditModal
          initialMessage={message}
          busy={busy}
          onCancel={() => setVersionModalOpen(false)}
          onConfirm={(m, n) => void handleVersionConfirm(m, n)}
        />
      ) : null}
    </div>
  );
}

function SearchQuotesSection({
  phone,
  onSelect,
  customerId,
}: {
  phone: string;
  onSelect: (id: string) => void;
  customerId?: string | null;
}) {
  const [q, setQ] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [results, setResults] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await searchQuotes({ q: q.trim() || undefined, phone: searchPhone.trim() || undefined, customerId: customerId || undefined });
      setResults(res.items);
      setSearched(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Field label="Texto (número, nombre, cliente, ítem)">
        <input className="tgs-input" value={q} onChange={(e) => setQ(e.target.value)} />
      </Field>
      <div className="tgs-row">
        <Field label="Teléfono">
          <input
            className="tgs-input"
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
          />
        </Field>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button className="tgs-btn ghost sm" onClick={() => setSearchPhone(phone)} disabled={!phone}>
            Usar tel. del chat
          </button>
        </div>
      </div>
      <button className="tgs-btn sm" disabled={loading} onClick={() => void run()}>
        {loading ? "Buscando…" : "Buscar presupuesto"}
      </button>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      {loading ? <Skeleton rows={4} /> : null}
      {searched && !loading && !error ? (
        results.length === 0 ? (
          <EmptyState icon="⌕" text="No encontramos presupuestos con esos filtros." />
        ) : (
          <div className="tgs-list">
            {results.map((r) => (
              <div key={r.id} className="tgs-list-item" onClick={() => onSelect(r.id)}>
                <div className="tgs-row" style={{ justifyContent: "space-between" }}>
                  <span className="tgs-strong">{r.visibleNumber}</span>
                  {r.version ? <Pill tone={STATE_TONE[r.version.state]}>{STATE_LABEL[r.version.state]}</Pill> : null}
                </div>
                <div className="tgs-muted">{r.internalName}</div>
                <div className="tgs-muted">{r.customer?.name ?? "Sin cliente"}</div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function CollectionsSection({ onSelect }: { onSelect: (id: string) => void }) {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const all = await listCollections();
      setCollections(all.filter((c) => c.visibleInExtension && !c.archived));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <button className="tgs-btn ghost sm" disabled={loading} onClick={() => void load()}>
        Actualizar colecciones
      </button>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      {loading ? <Skeleton rows={4} /> : null}
      {collections && collections.length === 0 && !error ? (
        <EmptyState icon="▦" text="No hay colecciones visibles para la extensión." />
      ) : null}
      <div className="tgs-list">
        {(collections ?? []).map((c) => (
          <div key={c.id}>
            <div
              className="tgs-list-item"
              onClick={() => setExpanded(expanded === c.id ? null : c.id)}
            >
              <span className="tgs-strong">{c.name}</span>{" "}
              <span className="tgs-muted">({c.quotes?.length ?? 0})</span>
            </div>
            {expanded === c.id ? (
              <div className="tgs-list" style={{ marginLeft: 8, marginTop: 4 }}>
                {(c.quotes ?? []).map((cq) => (
                  <div
                    key={cq.familyId}
                    className="tgs-list-item"
                    onClick={() => onSelect(cq.familyId)}
                  >
                    <span className="tgs-strong">{cq.family?.visibleNumber ?? cq.familyId}</span>
                    <div className="tgs-muted">{cq.family?.internalName}</div>
                  </div>
                ))}
                {(c.quotes ?? []).length === 0 ? (
                  <EmptyState icon="📄" text="Esta colección todavía no tiene presupuestos." />
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeChatPhone(value:string|null|undefined):string{return(value??"").replace(/\D/g,"").replace(/^549?/,"").replace(/^0/,"")}
function ReadyRequestsSection({
  phone,
  customerId,
  onSelect,
  includeHistory=false,
}:{
  phone:string;
  customerId?:string|null;
  onSelect:(familyId:string)=>void;
  includeHistory?:boolean;
}) {
  const [requests,setRequests]=useState<QuoteRequest[]|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const phoneKey=normalizeChatPhone(phone);
  async function load(){
    setLoading(true);
    setError(null);
    try{
      const all=await listRequests();
      setRequests(all.filter(request=>
        ((Boolean(customerId)&&request.customerId===customerId)
          ||(Boolean(phoneKey)&&normalizeChatPhone(request.detectedPhone)===phoneKey))
        &&(request.state==="LISTA"
          ||(includeHistory&&(request.state==="ENVIADA"||request.state==="CERRADA"))),
      ));
    }catch(err){
      setError(errorMessage(err));
    }finally{
      setLoading(false);
    }
  }
  useEffect(()=>{void load()},[phoneKey,customerId,includeHistory]);
  const actionable=(requests??[]).filter(
    request=>request.state==="LISTA"&&Boolean(request.families?.[0]),
  );
  const history=(requests??[]).filter(
    request=>request.state==="ENVIADA"||request.state==="CERRADA",
  );
  return <div className="tgs-stack">
    <button className="tgs-btn ghost sm" disabled={loading} onClick={()=>void load()}>
      Actualizar solicitudes
    </button>
    {error?<Alert tone="bad">{error}</Alert>:null}
    {loading?<Skeleton rows={3}/>:null}
    {!loading&&!error&&actionable.length===0?<EmptyState icon="✓" text="No hay solicitudes listas con presupuesto para este chat."/>:null}
    <div className="tgs-list">{actionable.map(request=>{const family=request.families![0]!;return <div key={request.id} className="tgs-list-item" role="button" tabIndex={0} onClick={()=>onSelect(family.id)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect(family.id)}}}><div className="tgs-row between"><div><b>{request.title}</b><div className="tgs-muted">{request.customer?.name??request.detectedPhone??"Sin contacto"} · {family.visibleNumber}</div></div><span className="tgs-muted">Abrir para enviar →</span></div></div>})}</div>
    {includeHistory&&history.length>0?<>
      <span className="tgs-field-label">Enviadas o cerradas anteriormente</span>
      <div className="tgs-list">
        {history.map(request=>{
          const family=request.families?.[0];
          const content=<div className="tgs-row between">
            <div>
              <b>{request.title}</b>
              <div className="tgs-muted">
                {request.customer?.name??request.detectedPhone??"Sin contacto"}
                {family?` · ${family.visibleNumber}`:""}
              </div>
            </div>
            <Pill tone={request.state==="ENVIADA"?"info":"neutral"}>
              {request.state==="ENVIADA"?"Enviada":"Cerrada"}
            </Pill>
          </div>;
          return family
            ?<div key={request.id} className="tgs-list-item" role="button" tabIndex={0} onClick={()=>onSelect(family.id)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect(family.id)}}}>{content}</div>
            :<div key={request.id} className="tgs-list-item">{content}</div>;
        })}
      </div>
    </>:null}
  </div>;
}
function QuickRequestSection({
  phone,
  name,
  onCreated,
}: {
  phone: string;
  name: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [originalText, setOriginalText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!title && name) setTitle(`Consulta de ${name}`);
  }, [name]);

  async function submit() {
    if (!title.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createQuickRequest({
        title: title.trim(),
        originalText: originalText.trim(),
        detectedPhone: phone || null,
      });
      setNotice("Solicitud creada en estado PENDIENTE.");
      setOriginalText("");
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Field label="Título">
        <input className="tgs-input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Texto original del chat (opcional)">
        <textarea
          className="tgs-input"
          rows={3}
          value={originalText}
          onChange={(e) => setOriginalText(e.target.value)}
        />
      </Field>
      <p className="tgs-muted">Teléfono detectado que se guardará: {phone || "sin detectar"}</p>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}
      <button className="tgs-btn sm" disabled={busy} onClick={() => void submit()}>
        {busy ? "Creando…" : "Crear solicitud rápida"}
      </button>
    </div>
  );
}

function QuoteSwitcher({quote,recent,onSelect,onClear}:{quote:Quote;recent:Quote[];onSelect:(id:string)=>void;onClear:()=>void}){const[expanded,setExpanded]=useState(false),[query,setQuery]=useState(""),[results,setResults]=useState<Quote[]>([]),[collections,setCollections]=useState<Collection[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);useEffect(()=>{void listCollections().then(all=>setCollections(all.filter(c=>c.visibleInExtension&&!c.archived).sort((a,b)=>Number(b.favorite)-Number(a.favorite)))).catch(e=>setError(errorMessage(e)))},[]);useEffect(()=>{if(!expanded||!query.trim()){setResults([]);return}const timer=window.setTimeout(()=>{setLoading(true);void searchQuotes({q:query.trim()}).then(r=>setResults(r.items.slice(0,5))).catch(e=>setError(errorMessage(e))).finally(()=>setLoading(false))},250);return()=>window.clearTimeout(timer)},[expanded,query]);const collectionQuotes=(c:Collection)=>(c.quotes??[]).slice(0,5);return <div className="tgs-quote-switcher"><div className="tgs-row between"><div className="tgs-row"><b>📄 {quote.visibleNumber} · V{quote.version?.version??quote.activeVersion}</b>{quote.version?<Pill tone={STATE_TONE[quote.version.state]}>{STATE_LABEL[quote.version.state]}</Pill>:null}</div><button className="tgs-btn ghost sm" onClick={()=>setExpanded(v=>!v)}>Cambiar presupuesto</button></div>{expanded?<div className="tgs-stack"><Field label="Buscar otro presupuesto"><input autoFocus className="tgs-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Número, cliente, producto…"/></Field>{error?<Alert tone="bad">{error}</Alert>:null}{loading?<Skeleton rows={3}/>:results.length?<div className="tgs-list">{results.map(r=><div className="tgs-list-item" key={r.id} onClick={()=>onSelect(r.id)}><div className="tgs-row between"><b>{r.visibleNumber}</b><span className="tgs-muted">{r.internalName}</span></div></div>)}</div>:query?<EmptyState icon="⌕" text="No encontramos presupuestos."/>:null}<div><span className="tgs-field-label">Colecciones rápidas</span><div className="tgs-chip-row">{collections.slice(0,5).map(c=><button className="tgs-chip" key={c.id} onClick={()=>{const first=collectionQuotes(c)[0];if(first)onSelect(first.familyId)}}>{c.favorite?"★ ":""}{c.name}</button>)}{collections.length>5?<button className="tgs-chip" onClick={onClear}>Ver todas</button>:null}</div></div>{recent.length?<div><span className="tgs-field-label">Vistos en esta sesión</span><div className="tgs-chip-row">{recent.filter(r=>r.id!==quote.id).slice(0,5).map(r=><button className="tgs-chip" key={r.id} onClick={()=>onSelect(r.id)}>{r.visibleNumber}</button>)}</div></div>:null}<button className="tgs-btn ghost sm" onClick={onClear}>Volver a búsqueda y colecciones</button></div>:null}</div>}
function HistoryTab({quote,onReload}:{quote:Quote|null;onReload:(id:string)=>Promise<void>}){const[timeline,setTimeline]=useState<QuoteTimeline|null>(null),[filter,setFilter]=useState("TODOS"),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);useEffect(()=>{if(!quote){setTimeline(null);return}setLoading(true);void getTimeline(quote.id).then(setTimeline).catch(e=>setError(errorMessage(e))).finally(()=>setLoading(false))},[quote?.id]);const types=["TODOS",...new Set((timeline?.events??[]).map(event=>event.type))];async function restore(version:number){if(!quote||!window.confirm("¿Restaurar el presupuesto a este punto?"))return;setLoading(true);try{await createQuoteVersion(quote.id,`Restaurada desde V${version}`,version);await onReload(quote.id);setTimeline(await getTimeline(quote.id))}catch(e){setError(errorMessage(e))}finally{setLoading(false)}}return <div>{!quote?<Alert tone="info">Seleccioná un presupuesto para ver su historial.</Alert>:null}{loading?<Skeleton rows={6}/>:null}{error?<Alert tone="bad">{error}</Alert>:null}{timeline?<><Field label="Filtrar eventos"><select className="tgs-input" value={filter} onChange={e=>setFilter(e.target.value)}>{types.map(type=><option key={type}>{type}</option>)}</select></Field><div className="tgs-list">{timeline.events.filter(event=>filter==="TODOS"||event.type===filter).length===0?<EmptyState icon="◷" text="No hay eventos para este filtro."/>:timeline.events.filter(event=>filter==="TODOS"||event.type===filter).slice().reverse().map(event=><div className="tgs-timeline-item" role={event.versionNumber?"button":undefined} key={event.id} onClick={()=>event.versionNumber&&void restore(event.versionNumber)}><b>{event.description??event.type.replaceAll("_"," ")}</b>{event.descriptions?.slice(1).map(text=><div key={text}>{text}</div>)}<div className="tgs-muted">{formatDateTime(event.createdAt)}{event.creator?` · ${event.creator.displayName||event.creator.username}`:""}</div></div>)}</div></>:null}</div>}
function chatIdentity(phone:string,name:string):string { const digits=phone.replace(/\D/g,""); if(digits)return `tel:${digits}`; const normalizedName=name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase("es-AR").replace(/\s+/g," "); return normalizedName?`name:${normalizedName}`:""; }
function sameChatIdentity(expected:string,phone:string,name:string):boolean {
  const actual=chatIdentity(phone,name);
  if(actual===expected)return true;
  if(expected.startsWith("tel:")&&actual.startsWith("tel:")){
    const expectedDigits=expected.slice(4);
    const actualDigits=actual.slice(4);
    return expectedDigits.length>=8&&actualDigits.length>=8
      &&(expectedDigits.endsWith(actualDigits)||actualDigits.endsWith(expectedDigits));
  }
  return false;
}
function botDebug(event:string,details:Record<string,unknown>={}):void {
  console.debug(`[tgs-bot] ${event}`,details);
}

function fingerprint(value:string):string {
  let hash=2166136261;
  for(let index=0;index<value.length;index+=1){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619)}
  return `wa-${(hash>>>0).toString(16).padStart(8,"0")}-${value.length}`;
}
type CurrentChatSuggestion={
  chatKey:string;
  text:string;
  logId:string;
  notificationId:string|null;
  inboundFingerprint:string|null;
  inserted:boolean;
  composerBlocked:boolean;
  attachments:ChatbotResolvedAttachment[];
};

type ChatbotRuntime = {
  settings: ChatbotSettings|null;
  conversation: ChatbotConversation|null;
  logs: ChatbotLog[];
  context:ChatbotChatContext|null;
  warning: string|null;
  manualStatus:string|null;
  suggestionError:string|null;
  currentSuggestion:CurrentChatSuggestion|null;
  autoSuggestions:boolean;
  simulationMode:boolean;
  autoRunning:boolean;
  suggestionBusy:boolean;
  busy: boolean;
  refresh:()=>Promise<void>;
  ensureEnabled:()=>Promise<void>;
  toggle:(enabled:boolean)=>Promise<void>;
  setMode:(mode:ChatbotMode|null)=>Promise<void>;
  clearEscalation:()=>Promise<void>;
  setAutoSuggestions:(enabled:boolean)=>void;
  setSimulationMode:(enabled:boolean)=>void;
  setAutoRunning:(enabled:boolean)=>void;
  insertCurrentSuggestion:(text?:string)=>Promise<void>;
  dismissCurrentSuggestion:(text?:string)=>Promise<void>;
  attachSuggestionFile:(attachment:ChatbotResolvedAttachment,kind:"image"|"quote")=>Promise<void>;
  createRequest:(notification:NotificationRow)=>Promise<void>;
  suggestNow:()=>Promise<void>;
  refreshContext:()=>Promise<void>;
};

const AUTO_SUGGEST_SESSION_KEY="tgs:auto-suggestions";
const AUTO_SIMULATION_SESSION_KEY="tgs:auto-simulation";
const AUTO_RUNNING_SESSION_KEY="tgs:auto-running";
function initialAutoSuggestions():boolean {
  try{return sessionStorage.getItem(AUTO_SUGGEST_SESSION_KEY)!=="off"}catch{return true}
}
function initialSimulationMode():boolean {
  try{return sessionStorage.getItem(AUTO_SIMULATION_SESSION_KEY)==="on"}catch{return false}
}
function initialAutoRunning():boolean {
  try{return sessionStorage.getItem(AUTO_RUNNING_SESSION_KEY)==="on"}catch{return false}
}

function useChatbotRuntime(
  phone:string,
  name:string,
  notifications:NotificationRow[],
  reloadNotifications:()=>Promise<void>,
):ChatbotRuntime {
  const [settings,setSettings]=useState<ChatbotSettings|null>(null);
  const [conversation,setConversation]=useState<ChatbotConversation|null>(null);
  const [logs,setLogs]=useState<ChatbotLog[]>([]);
  const [context,setContext]=useState<ChatbotChatContext|null>(null);
  const [warning,setWarning]=useState<string|null>(null);
  const [manualStatus,setManualStatus]=useState<string|null>(null);
  const [suggestionError,setSuggestionError]=useState<string|null>(null);
  const [currentSuggestion,setCurrentSuggestion]=useState<ChatbotRuntime["currentSuggestion"]>(null);
  const [autoSuggestions,setAutoSuggestionsState]=useState(initialAutoSuggestions);
  const [simulationMode,setSimulationModeState]=useState(initialSimulationMode);
  const [autoRunning,setAutoRunningState]=useState(initialAutoRunning);
  const [suggestionBusy,setSuggestionBusy]=useState(false);
  const [busy,setBusy]=useState(false);
  const runningRef=useRef(false);
  const queueRef=useRef(new Map<string,{chatKey:string;name:string;preview:string;attempts:number}>());
  const processingRef=useRef<string|null>(null);
  const suggestedFingerprintsRef=useRef(new Set<string>());
  const simulatedChatsRef=useRef(new Map<string,string>());
  const processedRecontactsRef=useRef(new Set<string>());
  const humanSendObservationRef=useRef<{stop():void}|null>(null);
  const currentSuggestionRef=useRef<CurrentChatSuggestion|null>(null);
  const settingsRef=useRef<ChatbotSettings|null>(null);
  const simulationModeRef=useRef(simulationMode);
  const autoRunningRef=useRef(autoRunning);
  const simulationRunIdRef=useRef(`run-${Date.now().toString(36)}`);
  const displayNameRef=useRef(name);
  const autoSuggestRunRef=useRef(0);
  const currentKey=chatIdentity(phone,name);
  const ignoredAutoMessagesKey=JSON.stringify(settings?.ignoredAutoMessages??[]);

  useEffect(()=>{currentSuggestionRef.current=currentSuggestion},[currentSuggestion]);
  useEffect(()=>{settingsRef.current=settings},[settings]);
  useEffect(()=>{displayNameRef.current=name},[name]);

  const setAutoSuggestions=(enabled:boolean)=>{
    setAutoSuggestionsState(enabled);
    try{sessionStorage.setItem(AUTO_SUGGEST_SESSION_KEY,enabled?"on":"off")}catch{/* sesión sin storage: conserva estado en memoria */}
  };
  const setSimulationMode=(enabled:boolean)=>{
    if(enabled){
      simulatedChatsRef.current.clear();
      simulationRunIdRef.current=`run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    }
    queueRef.current.clear();
    simulationModeRef.current=enabled;
    setSimulationModeState(enabled);
    setAutomaticSimulationGuard(enabled);
    try{sessionStorage.setItem(AUTO_SIMULATION_SESSION_KEY,enabled?"on":"off")}catch{/* estado de sesión en memoria */}
  };
  const setAutoRunning=(enabled:boolean)=>{
    autoRunningRef.current=enabled;
    setAutoRunningState(enabled);
    if(!enabled){queueRef.current.clear();processingRef.current=null}
    try{sessionStorage.setItem(AUTO_RUNNING_SESSION_KEY,enabled?"on":"off")}catch{/* estado de sesión en memoria */}
  };
  useEffect(()=>{
    simulationModeRef.current=simulationMode;
    setAutomaticSimulationGuard(simulationMode);
    return()=>setAutomaticSimulationGuard(false);
  },[simulationMode]);
  useEffect(()=>{autoRunningRef.current=autoRunning},[autoRunning]);

  const refresh=useCallback(async()=>{
    setConversation(null);
    setLogs([]);
    setContext(null);
    try{
      const nextSettings=await getChatbotSettings();
      setSettings(nextSettings);
      if(currentKey){
        const [nextConversation,nextLogs,nextContext]=await Promise.all([
          getChatbotConversation(currentKey),
          listChatbotLogs(currentKey,30),
          getChatbotContext(currentKey,phone||null),
        ]);
        setConversation(nextConversation);
        setLogs(nextLogs);
        setContext(nextContext);
      }else{
        setConversation(null);
        setLogs([]);
      }
    }catch(error){setWarning(errorMessage(error))}
  },[currentKey,phone]);

  useEffect(()=>{void refresh()},[refresh]);

  useEffect(()=>{
    humanSendObservationRef.current?.stop();
    humanSendObservationRef.current=null;
    autoSuggestRunRef.current+=1;
    setSuggestionBusy(false);
    setCurrentSuggestion(null);
    setManualStatus(null);
    setSuggestionError(null);
    return()=>{
      humanSendObservationRef.current?.stop();
      humanSendObservationRef.current=null;
    };
  },[currentKey]);

  useEffect(()=>{
    if(!currentKey)return;
    const pending=notifications
      .filter(item=>item.type==="CHATBOT_SUGGESTION"&&!item.actedAt&&item.chatPhone===currentKey)
      .sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())[0];
    if(!pending?.draft)return;
    const logId=String(pending.metadata?.chatbotLogId??pending.entityId??"");
    if(!logId)return;
    setCurrentSuggestion(previous=>({
      chatKey:currentKey,
      text:previous?.logId===logId?previous.text:pending.draft!,
      logId,
      notificationId:pending.id,
      inboundFingerprint:typeof pending.metadata?.inboundFingerprint==="string"
        ?pending.metadata.inboundFingerprint
        :null,
      inserted:previous?.logId===logId?previous.inserted:false,
      composerBlocked:previous?.logId===logId?previous.composerBlocked:false,
      attachments:previous?.logId===logId?previous.attachments:[],
    }));
  },[currentKey,notifications]);

  const processChat=useCallback(async(
    chatKey:string,
    displayName:string,
    switched:boolean,
    nextSettings:ChatbotSettings,
    suggestionMode=false,
    onPhase?:(message:string)=>void,
    forceRegenerate=false,
    requireLatestIncoming=!suggestionMode,
    simulation=false,
  )=>{
    if(switched){
      const switchedResult=switchToChat(chatKey);
      if(!switchedResult.ok)throw new Error(switchedResult.error);
      const confirmed=await waitForActiveChat(chatKey,6000,displayName);
      if(!confirmed.ok)throw new Error(confirmed.error);
    }
    if(lastOpenMessageDirection()==="OUTBOUND"){
      queueRef.current.delete(chatKey);
      onPhase?.("Chat omitido: el último mensaje es nuestro.");
      botDebug("chat skipped: last message outbound",{chatKey});
      return;
    }
    onPhase?.("Leyendo el último mensaje entrante…");
    const incoming=findLastIncomingMessage(
      requireLatestIncoming,
      nextSettings.ignoredAutoMessages,
    );
    if(!incoming)throw new Error(`No se pudo leer el último mensaje entrante de ${displayName||chatKey}.`);
    onPhase?.("Consultando al chatbot…");
    const result=await respondChatbot({
      chatKey,
      displayName,
      detectedPhone:detectChat().phone||null,
      message:incoming.text,
      messageType:incoming.messageType,
      messageFingerprint:fingerprint(`${chatKey}|${incoming.fingerprintSeed}${simulation?`|simulation:${simulationRunIdRef.current}`:forceRegenerate?`|manual:${Date.now()}`:""}`),
      manualSuggestion:suggestionMode,
      simulation,
      recentMessages:findRecentMessageSnippets(
        nextSettings.maxRecentSnippets,
        incoming.fingerprintSeed,
        nextSettings.ignoredAutoMessages,
      ),
    });
    onPhase?.(`Respuesta recibida: ${result.action}.`);
    if(result.action==="SUGGESTED"||result.action==="ESCALATED"||result.request)await reloadNotifications();
    if((result.action!=="AUTO_REPLY"&&result.action!=="SIMULATED")||!result.logId)return result;

    const maxDelay=Math.max(0,Math.min(120,result.autoDelayMaxSeconds??0));
    const delayMs=Math.floor(Math.random()*(maxDelay*1000+1));
    if(delayMs>0){
      onPhase?.(`Esperando ${Math.ceil(delayMs/1000)} s antes del envío automático…`);
      botDebug("auto delay started",{chatKey,delayMs,logId:result.logId});
      await new Promise(resolve=>window.setTimeout(resolve,delayMs));
    }
    if(result.action==="SIMULATED"){
      // Solo se marca "Borrador listo" si de verdad quedó un borrador en el composer.
      let simulationDraftInserted=false;
      if(result.reply){
        const inserted=await insertMessageIntoEmptyComposer(result.reply);
        simulationDraftInserted=inserted.ok;
        botDebug(inserted.ok?"simulation draft inserted":"simulation draft skipped",{
          chatKey,
          reason:inserted.ok?undefined:inserted.error,
          logId:result.logId,
          wouldAttach:result.attachments??[],
        });
        onPhase?.(inserted.ok
          ?"Simulación lista: borrador insertado, no enviado."
          :`Simulación lista y no enviada. ${inserted.error}`);
        // Darle tiempo a WhatsApp para registrar el borrador antes de que el recorrido
        // cambie al siguiente chat (si no, el draft se pierde al switchear).
        if(inserted.ok)await new Promise(resolve=>window.setTimeout(resolve,700));
      }else{
        onPhase?.(`Simulación: escalaría el chat${result.wouldEscalate?.reason?` (${result.wouldEscalate.reason})`:""}.`);
      }
      const activeAfterSimulation=detectChat();
      if(sameChatIdentity(chatKey,activeAfterSimulation.phone,activeAfterSimulation.name)){
        setLogs(await listChatbotLogs(chatKey,30));
      }
      return {...result,simulationDraftInserted};
    }

    // Barrera cliente inmediatamente anterior al click, también después de la demora.
    const authoritative=await getChatbotSettings();
    const authoritativeConversation=await getChatbotConversation(chatKey);
    setSettings(authoritative);
    const authoritativeMode=authoritativeConversation.modeOverride??authoritative.defaultMode;
    if(!authoritative.enabled||authoritativeMode!=="AUTO"||authoritativeConversation.escalatedAt){
      const reason=!authoritative.enabled
        ?"Las respuestas del bot se desactivaron antes del envío."
        :authoritativeConversation.escalatedAt
          ?"El chat fue escalado durante la espera."
          :"El chat dejó de estar en modo Automático durante la espera.";
      await actOnChatbotLog(result.logId,{action:"SEND_FAILED",error:reason});
      onPhase?.(reason);
      botDebug("auto send skipped",{chatKey,reason,logId:result.logId});
      return result;
    }
    const active=detectChat();
    const activeId=active.phone||active.name;
    if(!result.reply){
      await actOnChatbotLog(result.logId,{action:"SEND_FAILED",error:"La respuesta automática llegó sin texto enviable."});
      return result;
    }
    const reply=result.reply;
    const sent=await sendMessageAutomatically(activeId,reply,authoritative.sendConfirmationTimeoutMs);
    await actOnChatbotLog(result.logId,sent.ok
      ?{action:"SENT",text:reply}
      :{action:"SEND_FAILED",text:reply,error:sent.error??"Envío no confirmado"});
    if(!sent.ok)setWarning(sent.error??"WhatsApp no confirmó el autoenvío.");
    if(sent.ok){
      attachmentLoop: for(const attachment of result.attachments??[]){
        const targets:Array<{label:string;file:File}>=[];
        try{
          if(attachment.image){
            const blob=await fetchBlob(attachment.image.url);
            targets.push({label:`imagen ${attachment.image.filename}`,file:new File([blob],attachment.image.filename,{type:blob.type||"image/jpeg"})});
          }
          if(attachment.quote){
            await generateVersionPdf(attachment.quote.familyId,attachment.quote.version);
            const blob=await fetchBlob(versionPdfDownloadPath(attachment.quote.familyId,attachment.quote.version));
            targets.push({label:`presupuesto ${attachment.quote.visibleNumber} V${attachment.quote.version}`,file:new File([blob],attachment.quote.filename,{type:"application/pdf"})});
          }
          for(const target of targets){
            const [latestSettings,latestConversation]=await Promise.all([
              getChatbotSettings(),
              getChatbotConversation(chatKey),
            ]);
            const latestMode=latestConversation.modeOverride??latestSettings.defaultMode;
            if(!latestSettings.enabled||latestMode!=="AUTO"||latestConversation.escalatedAt){
              botDebug("attachment skipped",{chatKey,reason:"authorization-changed",attachment:target.label});
              break attachmentLoop;
            }
            const delivered=await sendAttachedFileAutomatically(activeId,target.file,authoritative.sendConfirmationTimeoutMs);
            await actOnChatbotLog(result.logId,{
              action:delivered.ok?"ATTACHMENT_SENT":"ATTACHMENT_FAILED",
              attachment:target.label,
              error:delivered.ok?undefined:delivered.error??"Envío no confirmado",
            });
            if(!delivered.ok){
              setWarning(`No se pudo enviar ${target.label}. El chat quedó pausado para revisión humana.`);
              break attachmentLoop;
            }
          }
        }catch(error){
          await actOnChatbotLog(result.logId,{action:"ATTACHMENT_FAILED",attachment:`regla ${attachment.ruleId}`,error:errorMessage(error)});
          setWarning(`Falló un adjunto automático. El chat quedó pausado: ${errorMessage(error)}`);
          break attachmentLoop;
        }
      }
    }
    return result;
  },[reloadNotifications]);

  const trackHumanSend=useCallback((suggestion:CurrentChatSuggestion)=>{
    humanSendObservationRef.current?.stop();
    humanSendObservationRef.current=observeNextOutgoingMessage(
      suggestion.chatKey,
      30*60*1000,
      result=>{
        humanSendObservationRef.current=null;
        if(result.timedOut||result.confidence<70)return;
        void (async()=>{
          try{
            await actOnChatbotLog(suggestion.logId,{
              action:"HUMAN_SENT",
              text:result.text??suggestion.text,
            });
            setManualStatus("Mensaje enviado y aprobación registrada.");
            setCurrentSuggestion(current=>current?.logId===suggestion.logId?null:current);
            await reloadNotifications();
            await refresh();
          }catch(error){
            setSuggestionError(`El mensaje se envió, pero no pudimos actualizar el registro: ${errorMessage(error)}`);
          }
        })();
      },
    );
  },[refresh,reloadNotifications]);

  const insertSuggestion=useCallback(async(suggestion:CurrentChatSuggestion,text=suggestion.text)=>{
    setSuggestionError(null);
    const active=detectChat();
    const activeKey=chatIdentity(active.phone,active.name);
    botDebug("insert attempted",{
      suggestionChatKey:suggestion.chatKey,
      activeChatKey:activeKey,
      activePhone:active.phone,
      activeName:active.name,
    });
    if(!sameChatIdentity(suggestion.chatKey,active.phone,active.name)){
      botDebug("insert skipped",{
        reason:"chat-identity-mismatch",
        suggestionChatKey:suggestion.chatKey,
        activeChatKey:activeKey,
      });
      throw new Error("La sugerencia pertenece a otro chat. Volvé a abrirlo para insertarla.");
    }
    const composerText=readComposerText();
    if(composerText===null){
      botDebug("insert skipped",{reason:"composer-not-found",activeChatKey:activeKey});
      throw new Error("No encontramos el cuadro de mensaje de WhatsApp.");
    }
    const normalized=(value:string)=>value.replace(/\s+/g," ").trim();
    if(composerText&&normalized(composerText)!==normalized(text)){
      botDebug("insert skipped",{
        reason:"composer-not-empty",
        activeChatKey:activeKey,
        composerLength:composerText.length,
      });
      setCurrentSuggestion(current=>current?.logId===suggestion.logId
        ?{...current,text,composerBlocked:true,inserted:false}
        :current);
      setManualStatus("Ya hay un mensaje escrito. Conservamos tu texto y dejamos la sugerencia lista para insertar.");
      return;
    }
    if(!composerText){
      const inserted=await insertMessageIntoEmptyComposer(text);
      if(!inserted.ok){
        botDebug("insert skipped",{reason:"dom-insertion-failed",activeChatKey:activeKey,error:inserted.error});
        throw new Error(inserted.error);
      }
    }
    const next={...suggestion,text,inserted:true,composerBlocked:false};
    setCurrentSuggestion(next);
    setManualStatus("Sugerencia colocada en WhatsApp. Revisala y tocá Enviar cuando quieras.");
    botDebug("inserted",{activeChatKey:activeKey,logId:suggestion.logId,textLength:text.length});
    trackHumanSend(next);
  },[trackHumanSend]);

  const insertCurrentSuggestion=async(text?:string)=>{
    if(!currentSuggestion)return;
    setSuggestionBusy(true);
    try{await insertSuggestion(currentSuggestion,text??currentSuggestion.text)}
    catch(error){setSuggestionError(errorMessage(error))}
    finally{setSuggestionBusy(false)}
  };

  const dismissCurrentSuggestion=async(text?:string)=>{
    if(!currentSuggestion)return;
    setSuggestionBusy(true);
    setSuggestionError(null);
    try{
      humanSendObservationRef.current?.stop();
      humanSendObservationRef.current=null;
      await clearComposerIfMatches(text??currentSuggestion.text);
      await actOnChatbotLog(currentSuggestion.logId,{
        action:"DISMISSED",
        text:text??currentSuggestion.text,
      });
      setCurrentSuggestion(null);
      setManualStatus("Sugerencia descartada.");
      await reloadNotifications();
      await refresh();
    }catch(error){setSuggestionError(errorMessage(error))}
    finally{setSuggestionBusy(false)}
  };

  const processChatRef=useRef(processChat);
  const insertSuggestionRef=useRef(insertSuggestion);
  useEffect(()=>{processChatRef.current=processChat},[processChat]);
  useEffect(()=>{insertSuggestionRef.current=insertSuggestion},[insertSuggestion]);

  useEffect(()=>{
    const settingsSnapshot=settingsRef.current;
    if(
      !autoSuggestions
      ||simulationMode
      ||!settingsSnapshot?.enabled
      ||conversation?.effectiveMode!=="SUGGEST"
      ||conversation.escalatedAt
      ||!currentKey
    )return;
    const runId=++autoSuggestRunRef.current;
    let cancelled=false;
    const timer=window.setTimeout(()=>{
      void (async()=>{
        const active=detectChat();
        if(cancelled||!sameChatIdentity(currentKey,active.phone,active.name)){
          botDebug("generation skipped",{
            reason:cancelled?"effect-cancelled":"chat-identity-mismatch",
            expectedChatKey:currentKey,
            activeChatKey:chatIdentity(active.phone,active.name),
            runId,
          });
          if(autoSuggestRunRef.current===runId)setManualStatus("El chat cambió antes de generar. Abrilo nuevamente para sugerir.");
          return;
        }
        const latestSettings=settingsRef.current;
        if(!latestSettings?.enabled){
          botDebug("generation skipped",{reason:"bot-disabled",chatKey:currentKey,runId});
          return;
        }
        const incoming=findLastIncomingMessage(true,latestSettings.ignoredAutoMessages);
        if(!incoming){
          botDebug("generation skipped",{reason:"no-real-inbound-message",chatKey:currentKey,runId});
          return;
        }
        const inboundFingerprint=fingerprint(`${currentKey}|${incoming.fingerprintSeed}`);
        const availableSuggestion=currentSuggestionRef.current;
        const reusable=availableSuggestion?.inboundFingerprint===inboundFingerprint
          ?availableSuggestion
          :null;
        if(suggestedFingerprintsRef.current.has(inboundFingerprint)){
          if(reusable){
            botDebug("generation reused",{chatKey:currentKey,inboundFingerprint,runId,logId:reusable.logId});
            setSuggestionBusy(true);
            setSuggestionError(null);
            setManualStatus("Insertando la sugerencia ya generada…");
            try{await insertSuggestionRef.current(reusable)}
            catch(error){setSuggestionError(errorMessage(error))}
            finally{if(autoSuggestRunRef.current===runId)setSuggestionBusy(false)}
            return;
          }
          botDebug("generation skipped",{reason:"fingerprint-already-processed-without-pending-suggestion",chatKey:currentKey,inboundFingerprint,runId});
          return;
        }
        suggestedFingerprintsRef.current.add(inboundFingerprint);
        botDebug("generation started",{chatKey:currentKey,inboundFingerprint,runId});
        setSuggestionBusy(true);
        setSuggestionError(null);
        setManualStatus("Generando sugerencia…");
        try{
          if(reusable){
            await insertSuggestionRef.current(reusable);
            return;
          }
          const result=await processChatRef.current(
            currentKey,
            displayNameRef.current,
            false,
            latestSettings,
            true,
            setManualStatus,
            false,
            true,
          );
          botDebug("generation finished",{
            chatKey:currentKey,
            action:result?.action??null,
            hasReply:Boolean(result?.reply),
            runId,
            cancelled,
            activeRunId:autoSuggestRunRef.current,
          });
          if(cancelled||autoSuggestRunRef.current!==runId){
            // El resultado queda persistido como notificación, pero jamás se
            // muestra ni se inserta en el chat que quedó activo después.
            if(autoSuggestRunRef.current===runId){
              setManualStatus("La sugerencia quedó guardada, pero el chat cambió antes de insertarla.");
            }
            botDebug("insert skipped",{
              reason:"generation-run-cancelled",
              chatKey:currentKey,
              runId,
              activeRunId:autoSuggestRunRef.current,
            });
            return;
          }
          if(
            (result?.action==="SUGGESTED"||result?.action==="DUPLICATE")
            &&result.reply
            &&result.logId
          ){
            const suggestion:CurrentChatSuggestion={
              chatKey:currentKey,
              text:result.reply,
              logId:result.logId,
              notificationId:result.notificationId??null,
              inboundFingerprint,
              inserted:false,
              composerBlocked:false,
              attachments:result.attachments??[],
            };
            setCurrentSuggestion(suggestion);
            await insertSuggestionRef.current(suggestion);
          }else if(result?.action==="ESCALATED"){
            setManualStatus("Este chat necesita atención humana.");
          }else if(result?.action==="DUPLICATE"){
            setManualStatus("Este mensaje ya fue revisado.");
          }
        }catch(error){
          botDebug("generation failed",{chatKey:currentKey,runId,error:errorMessage(error)});
          suggestedFingerprintsRef.current.delete(inboundFingerprint);
          if(autoSuggestRunRef.current===runId)setSuggestionError(errorMessage(error));
        }finally{
          if(autoSuggestRunRef.current===runId)setSuggestionBusy(false);
        }
      })();
    },1300);
    return()=>{
      cancelled=true;
      window.clearTimeout(timer);
      if(autoSuggestRunRef.current===runId)setSuggestionBusy(false);
    };
  },[
    autoSuggestions,
    simulationMode,
    conversation?.effectiveMode,
    conversation?.escalatedAt,
    currentKey,
    settings?.enabled,
    ignoredAutoMessagesKey,
    settings?.maxRecentSnippets,
  ]);

  useEffect(()=>{
    let stopped=false;
    let timer=0;
    let nextDelay=8000;
    const tick=async()=>{
      if(stopped||runningRef.current)return;
      runningRef.current=true;
      try{
        const nextSettings=await getChatbotSettings();
        nextDelay=Math.max(3000,nextSettings.scanIntervalSeconds*1000);
        setSettings(nextSettings);
        if(!nextSettings.enabled){queueRef.current.clear();processingRef.current=null;setWarning(null);applyNativeChatStatuses([]);return}
        if(!autoRunningRef.current){queueRef.current.clear();processingRef.current=null;return}

        const conversations=await listChatbotConversations();
        const overrides=new Map(conversations.map(item=>[item.chatKey,item]));
        const list=detectChatList(nextSettings.ignoredAutoMessages);
        if(list.confidence===0){setWarning(list.warning);return}
        if(list.warning)setWarning(list.warning);else setWarning(null);

        const buildNativeStatuses=(chats:typeof list.chats,rows:ChatbotConversation[])=>{
          const statuses:NativeChatStatus[]=[];
          for(const chat of chats){
            if(chat.needsReply){
              statuses.push({chatKey:chat.chatKey,displayName:chat.name,status:"NEEDS_REPLY",label:"Pendiente respuesta"});
            }
          }
          for(const item of rows){
            if(item.nativeStatus)statuses.push({
              chatKey:item.chatKey,
              displayName:item.displayName,
              status:item.nativeStatus.status,
              label:item.nativeStatus.label,
            });
          }
          // Rastro visible: los chats que ya recibieron un borrador en el recorrido de prueba
          // quedan marcados con ✎ "Borrador listo" hasta que llegue un mensaje nuevo.
          for(const [simKey] of simulatedChatsRef.current){
            const simChat=chats.find(c=>c.chatKey===simKey);
            statuses.push({chatKey:simKey,displayName:simChat?.name??null,status:"SUGGESTION",label:"Borrador listo"});
          }
          return statuses;
        };
        const native=buildNativeStatuses(list.chats,conversations);
        applyNativeChatStatuses(native);

        // Procesar si el último mensaje es del cliente (INCOMING). Si WhatsApp no expone la
        // dirección (UNKNOWN — su DOM la oculta en la lista), caer al heurístico no-leído/pendiente
        // para no dejar de procesar. Nunca procesar si el último mensaje es NUESTRO (OUTGOING).
        const isScanCandidate=(item:typeof list.chats[number])=>
          item.lastDirection==="INCOMING"
          ||(item.lastDirection!=="OUTGOING"&&(item.hasUnread||item.needsReply));
        for(const chat of list.chats.filter(isScanCandidate)){
          const known=overrides.get(chat.chatKey);
          const effective=known?.modeOverride??nextSettings.defaultMode;
          const simulationActive=simulationModeRef.current;
          const alreadySimulated=simulationActive
            &&simulatedChatsRef.current.get(chat.chatKey)===chat.preview
            &&!chat.hasUnread;
          const conversationClosed=Boolean(known?.escalatedAt)||known?.modeOverride==="OFF";
          if(autoRunningRef.current&&!alreadySimulated&&!conversationClosed&&(simulationActive||effective==="AUTO")&&!queueRef.current.has(chat.chatKey)){
            queueRef.current.set(chat.chatKey,{chatKey:chat.chatKey,name:chat.name,preview:chat.preview,attempts:0});
          }
        }

        // SUGGEST es exclusivamente manual desde el botón; el loop nunca genera sugerencias pasivas.
        const active=detectChat();
        const activeKey=chatIdentity(active.phone,active.name);
        let currentActiveKey=activeKey;
        const batch=[...queueRef.current.values()].slice(0,20);
        const failures:string[]=[];
        for(const pending of batch){
          if(stopped)break;
          if(!autoRunningRef.current){queueRef.current.clear();processingRef.current=null;break}
          const pendingChat=list.chats.find(chat=>chat.chatKey===pending.chatKey);
          const pendingConversation=overrides.get(pending.chatKey);
          if(pendingChat?.lastDirection==="OUTGOING"||pendingConversation?.escalatedAt||pendingConversation?.modeOverride==="OFF"){
            queueRef.current.delete(pending.chatKey);
            continue;
          }
          // Revalidar por iteración: si el usuario apagó el automático/simulación a mitad del
          // lote, no seguir recorriendo chats ya encolados (salvo los que sean AUTO explícito).
          const pendingMode=pendingConversation?.modeOverride??nextSettings.defaultMode;
          if(!simulationModeRef.current&&pendingMode!=="AUTO"){queueRef.current.delete(pending.chatKey);continue;}
          processingRef.current=pending.chatKey;
          applyNativeChatStatuses([
            ...native.filter(item=>item.chatKey!==pending.chatKey),
            {chatKey:pending.chatKey,displayName:pending.name,status:"PROCESSING",label:"Procesando"},
          ]);
          try{
            const simulationActive=simulationModeRef.current;
            const outcome=await processChat(pending.chatKey,pending.name,pending.chatKey!==currentActiveKey,nextSettings,false,undefined,false,true,simulationActive);
            // Marcar "Borrador listo" solo si processChat confirmó que insertó el borrador;
            // si se salteó (último mensaje nuestro) o escaló, limpiar cualquier marca previa.
            if(simulationActive){
              if((outcome as {simulationDraftInserted?:boolean}|undefined)?.simulationDraftInserted)simulatedChatsRef.current.set(pending.chatKey,pending.preview);
              else simulatedChatsRef.current.delete(pending.chatKey);
            }
            currentActiveKey=pending.chatKey;
            queueRef.current.delete(pending.chatKey);
          }catch(error){
            queueRef.current.delete(pending.chatKey);
            failures.push(`${pending.name}: ${errorMessage(error)}`);
          }finally{
            processingRef.current=null;
            applyNativeChatStatuses(native);
          }
        }

        // Pase escalonado e independiente de la cola: como máximo un recontacto por tick.
        if(autoRunningRef.current&&nextSettings.recontactEnabled&&!stopped){
          try{
            const candidates=await getRecontactCandidates();
            const candidate=candidates.find(item=>!processedRecontactsRef.current.has(item.chatKey));
            if(candidate){
              // Un fallo tampoco debe provocar reintentos automáticos repetidos durante esta sesión.
              processedRecontactsRef.current.add(candidate.chatKey);
              const conversation=overrides.get(candidate.chatKey);
              const mode=conversation?.modeOverride??nextSettings.defaultMode;
              const simulationActive=simulationModeRef.current;
              if(simulationActive||mode!=="OFF"){
                const switched=switchToChat(candidate.chatKey);
                if(!switched.ok)throw new Error(switched.error);
                const confirmed=await waitForActiveChat(candidate.chatKey,6000,candidate.displayName??undefined);
                if(!confirmed.ok)throw new Error(confirmed.error);
                const generated=await generateRecontact({
                  chatKey:candidate.chatKey,
                  displayName:candidate.displayName??undefined,
                  recentMessages:findRecentMessageSnippets(
                    nextSettings.maxRecentSnippets,
                    undefined,
                    nextSettings.ignoredAutoMessages,
                  ),
                });
                if(generated.reply&&generated.logId){
                  if(simulationActive||mode==="SUGGEST"){
                    const inserted=await insertMessageIntoComposer(generated.reply);
                    if(!inserted.ok)throw new Error(inserted.error);
                    botDebug(simulationActive?"recontact simulation draft inserted":"recontact suggestion inserted",{
                      chatKey:candidate.chatKey,
                      logId:generated.logId,
                    });
                  }else if(mode==="AUTO"){
                    // Revalidación autoritativa inmediatamente anterior al autoenvío.
                    const [authoritative,authoritativeConversation]=await Promise.all([
                      getChatbotSettings(),
                      getChatbotConversation(candidate.chatKey),
                    ]);
                    setSettings(authoritative);
                    const authoritativeMode=authoritativeConversation.modeOverride??authoritative.defaultMode;
                    const activeChat=detectChat();
                    const activeId=activeChat.phone||activeChat.name;
                    if(
                      !autoRunningRef.current
                      ||simulationModeRef.current
                      ||!authoritative.enabled
                      ||!authoritative.recontactEnabled
                      ||authoritativeMode!=="AUTO"
                      ||authoritativeConversation.escalatedAt
                      ||!sameChatIdentity(candidate.chatKey,activeChat.phone,activeChat.name)
                    ){
                      const reason="El recontacto dejó de estar autorizado antes del envío.";
                      await actOnChatbotLog(generated.logId,{action:"SEND_FAILED",text:generated.reply,error:reason});
                      botDebug("recontact auto send skipped",{chatKey:candidate.chatKey,reason,logId:generated.logId});
                    }else{
                      const sent=await sendMessageAutomatically(activeId,generated.reply,authoritative.sendConfirmationTimeoutMs);
                      await actOnChatbotLog(generated.logId,sent.ok
                        ?{action:"SENT",text:generated.reply}
                        :{action:"SEND_FAILED",text:generated.reply,error:sent.error??"Envío no confirmado"});
                      if(sent.ok)await markRecontactSent(candidate.chatKey);
                      else failures.push(`${candidate.displayName??candidate.chatKey}: ${sent.error??"WhatsApp no confirmó el recontacto."}`);
                    }
                  }
                }
              }
            }
          }catch(error){
            failures.push(`Recontacto: ${errorMessage(error)}`);
          }
        }
        const refreshedConversations=await listChatbotConversations();
        const refreshedList=detectChatList(nextSettings.ignoredAutoMessages);
        applyNativeChatStatuses(buildNativeStatuses(
          refreshedList.confidence>0?refreshedList.chats:list.chats,
          refreshedConversations,
        ));
        if(failures.length)setWarning(`Algunos chats no pudieron procesarse: ${failures.join(" · ")}`);
      }catch(error){setWarning(errorMessage(error))}
      finally{
        runningRef.current=false;
        if(!stopped)timer=window.setTimeout(()=>void tick(),nextDelay);
      }
    };
    void tick();
    return()=>{stopped=true;window.clearTimeout(timer)};
  },[processChat]);

  const ensureEnabled=useCallback(async()=>{
    const current=await getChatbotSettings();
    setSettings(current.enabled?current:await setChatbotEnabled(true));
  },[]);
  const toggle=async(enabled:boolean)=>{setBusy(true);try{setSettings(await setChatbotEnabled(enabled));setWarning(null)}catch(error){setWarning(errorMessage(error))}finally{setBusy(false)}};
  const setMode=async(mode:ChatbotMode|null)=>{if(!currentKey)return;setBusy(true);try{await updateChatbotConversation(currentKey,{displayName:name||null,modeOverride:mode});await refresh()}catch(error){setWarning(errorMessage(error))}finally{setBusy(false)}};
  const clearEscalation=async()=>{if(!currentKey)return;setBusy(true);try{await updateChatbotConversation(currentKey,{clearEscalation:true});await refresh()}catch(error){setWarning(errorMessage(error))}finally{setBusy(false)}};
  const createRequest=async(notification:NotificationRow)=>{
    const logId=String(notification.metadata?.chatbotLogId??notification.entityId??"");
    if(!logId)throw new Error("La sugerencia no tiene un registro asociado.");
    setBusy(true);
    try{
      const result=await createRequestFromChatbotSuggestion(logId);
      setWarning(result.created?`Solicitud creada: ${result.title}`:`El chat ya tenía la solicitud pendiente: ${result.title}`);
      await Promise.all([reloadNotifications(),refresh()]);
    }catch(error){setWarning(errorMessage(error))}
    finally{setBusy(false)}
  };
  const suggestNow=async()=>{
    setSuggestionBusy(true);setSuggestionError(null);setManualStatus("Generando sugerencia…");
    try{
      if(!currentKey)throw new Error("No hay una identidad de chat activa. Cerrá y volvé a abrir la conversación.");
      const nextSettings=await getChatbotSettings();
      setSettings(nextSettings);
      if(!nextSettings.enabled)throw new Error("Las respuestas del bot están apagadas. Activálas para generar sugerencias.");
      const result=await processChat(
        currentKey,
        name,
        false,
        nextSettings,
        true,
        setManualStatus,
        true,
        false,
      );
      await refresh();
      if(result?.action==="SUGGESTED"&&result.reply&&result.logId){
        const suggestion:CurrentChatSuggestion={
          chatKey:currentKey,
          text:result.reply,
          logId:result.logId,
          notificationId:result.notificationId??null,
          inboundFingerprint:null,
          inserted:false,
          composerBlocked:false,
          attachments:result.attachments??[],
        };
        setCurrentSuggestion(suggestion);
        await insertSuggestion(suggestion);
      }
      else if(result?.action==="ESCALATED")setManualStatus("La conversación requiere intervención humana y quedó escalada.");
      else setManualStatus(`El chatbot terminó con estado ${result?.action??"sin respuesta"}.`);
    }
    catch(error){setSuggestionError(errorMessage(error))}
    finally{setSuggestionBusy(false)}
  };
  const attachSuggestionFile=async(attachment:ChatbotResolvedAttachment,kind:"image"|"quote")=>{
    setSuggestionBusy(true);setSuggestionError(null);
    try{
      let file:File;
      if(kind==="image"&&attachment.image){
        const blob=await fetchBlob(attachment.image.url);
        file=new File([blob],attachment.image.filename,{type:blob.type||"image/jpeg"});
      }else if(kind==="quote"&&attachment.quote){
        await generateVersionPdf(attachment.quote.familyId,attachment.quote.version);
        const blob=await fetchBlob(versionPdfDownloadPath(attachment.quote.familyId,attachment.quote.version));
        file=new File([blob],attachment.quote.filename,{type:"application/pdf"});
      }else throw new Error("El adjunto configurado ya no está disponible.");
      if(!await attachFileToComposer(file))throw new Error("WhatsApp no pudo abrir el adjunto.");
      setManualStatus(`${file.name} quedó adjunto. Revisalo y tocá Enviar en WhatsApp.`);
    }catch(error){setSuggestionError(errorMessage(error))}
    finally{setSuggestionBusy(false)}
  };
  return{
    settings,
    conversation,
    logs,
    context,
    warning,
    manualStatus,
    suggestionError,
    currentSuggestion,
    autoSuggestions,
    simulationMode,
    autoRunning,
    suggestionBusy,
    busy,
    refresh,
    ensureEnabled,
    toggle,
    setMode,
    clearEscalation,
    setAutoSuggestions,
    setSimulationMode,
    setAutoRunning,
    insertCurrentSuggestion,
    dismissCurrentSuggestion,
    attachSuggestionFile,
    createRequest,
    suggestNow,
    refreshContext:refresh,
  };
}

function ChatbotCustomerContext({runtime,phone,detectedName}:{runtime:ChatbotRuntime;phone:string;detectedName:string}) {
  const [completeOpen,setCompleteOpen]=useState(false);
  const [name,setName]=useState(detectedName);
  const [editablePhone,setEditablePhone]=useState(phone);
  const [notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{setCompleteOpen(false);setName(detectedName);setEditablePhone(phone);setNotes("");setError(null)},[phone,detectedName]);
  const context=runtime.context;
  const linkToPending=async(customer:Customer)=>{
    const request=context?.requests.find(item=>item.id===context.activeRequestId)
      ??context?.requests.find(item=>item.state==="PENDIENTE");
    if(request&&!request.customerId)await updateRequest(request.id,{customerId:customer.id});
  };
  const createQuick=async()=>{
    if(!phone){setError("WhatsApp no expuso un teléfono válido para este chat.");return}
    setBusy(true);setError(null);
    try{const customer=await createCustomerQuick(phone);await linkToPending(customer);await runtime.refreshContext()}
    catch(err){setError(errorMessage(err))}
    finally{setBusy(false)}
  };
  const createComplete=async()=>{
    if(!name.trim()){setError("Ingresá un nombre para el cliente.");return}
    setBusy(true);setError(null);
    try{
      const customer=await createCustomer({name:name.trim(),phone:editablePhone.trim()||null,dni:null,notes:notes.trim()||null});
      await linkToPending(customer);
      setCompleteOpen(false);
      await runtime.refreshContext();
    }catch(err){setError(errorMessage(err))}
    finally{setBusy(false)}
  };
  return <Section title="Cliente y solicitudes" defaultOpen>
    {!context?<Skeleton rows={3}/>:<>
      {context.customer
        ?<Alert tone="ok">Cliente: <b>{context.customer.name}</b> (existente) · {context.customer.phone??"sin teléfono"}</Alert>
        :<Alert tone="info">Sin cliente asociado para este teléfono.</Alert>}
      {context.requests.length
        ?<div className="tgs-list">{context.requests.slice(0,5).map(request=><div className="tgs-list-item" key={request.id}><div className="tgs-row between"><b>{request.title}</b><Pill tone={request.state==="PENDIENTE"?"warn":"info"}>{request.state.replaceAll("_"," ")}</Pill></div><div className="tgs-muted">Solicitud {request.id}</div></div>)}</div>
        :<div className="tgs-muted">Sin solicitudes previas detectadas para este teléfono.</div>}
      {!context.customer?<div className="tgs-row wrap">
        <button className="tgs-btn sm" disabled={busy||!phone} onClick={()=>void createQuick()}>Crear rápido</button>
        <button className="tgs-btn ghost sm" disabled={busy} onClick={()=>setCompleteOpen(value=>!value)}>Crear completo</button>
      </div>:null}
      {completeOpen?<div className="tgs-stack">
        <Field label="Nombre"><input className="tgs-input" value={name} onChange={event=>setName(event.target.value)}/></Field>
        <Field label="Teléfono"><input className="tgs-input" value={editablePhone} onChange={event=>setEditablePhone(event.target.value)}/></Field>
        <Field label="Observación"><textarea className="tgs-input" value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Qué pidió, preferencias o cualquier dato útil"/></Field>
        <div className="tgs-row"><button className="tgs-btn sm" disabled={busy} onClick={()=>void createComplete()}>{busy?"Guardando…":"Guardar cliente"}</button><button className="tgs-btn ghost sm" onClick={()=>setCompleteOpen(false)}>Cancelar</button></div>
      </div>:null}
      {error?<Alert tone="bad">{error}</Alert>:null}
    </>}
  </Section>;
}

function ChatbotTab({runtime,notifications,currentKey,phone,name}:{runtime:ChatbotRuntime;notifications:NotificationRow[];currentKey:string;phone:string;name:string}) {
  const [draft,setDraft]=useState("");
  useEffect(()=>{
    setDraft(runtime.currentSuggestion?.text??"");
  },[currentKey,runtime.currentSuggestion?.logId]);
  const currentNotification=notifications.find(item=>
    item.type==="CHATBOT_SUGGESTION"
    &&!item.actedAt
    &&item.chatPhone===currentKey
    &&(
      item.id===runtime.currentSuggestion?.notificationId
      ||String(item.metadata?.chatbotLogId??item.entityId??"")===runtime.currentSuggestion?.logId
    ),
  );
  const suggestionState=runtime.suggestionBusy
    ?"Generando sugerencia…"
    :runtime.currentSuggestion?.inserted
      ?"Lista en el mensaje de WhatsApp"
      :runtime.currentSuggestion?.composerBlocked
        ?"Lista para insertar · tu mensaje actual se conservó"
        :runtime.currentSuggestion
          ?"Sugerencia lista"
          :runtime.conversation?.effectiveMode==="SUGGEST"
            ?"Esperando un mensaje del cliente"
            :"Disponible cuando el chat está en Solo sugerir";
  return <div className="tgs-stack">
    <div className="tgs-list-item selected">
      <div className="tgs-row between">
        <div>
          <div className="tgs-row">
            <span className={`tgs-auto-dot${runtime.autoRunning?" active":""}`} aria-hidden="true"/>
            <b>{runtime.autoRunning?"Automático activo":"Automático detenido"}</b>
          </div>
          <div className="tgs-muted">{runtime.autoRunning?"El bot está revisando los chats según su configuración.":"No se procesan ni se envían respuestas automáticas."}</div>
        </div>
        <button
          className={`tgs-btn ${runtime.autoRunning?"danger":""}`}
          disabled={runtime.busy||!runtime.settings}
          onClick={()=>runtime.setAutoRunning(!runtime.autoRunning)}
        >
          {runtime.autoRunning?"Detener automático":"Iniciar automático"}
        </button>
      </div>
    </div>
    {runtime.simulationMode?<Alert tone="warn"><b>MODO PRUEBA:</b> el bot recorre los chats y prepara borradores, pero no envía mensajes ni adjuntos.{!runtime.settings?.enabled?" Para iniciar el recorrido, activá “Respuestas del bot”; la barrera de prueba seguirá bloqueando todos los envíos.":""}</Alert>:null}
    <div className="tgs-list-item selected tgs-stack">
      <div className="tgs-row between">
        <div>
          <b>Sugerencia para este chat</b>
          <div className="tgs-muted">{suggestionState}</div>
        </div>
        <button className="tgs-btn sm" disabled={runtime.suggestionBusy||runtime.busy||Boolean(runtime.conversation?.escalatedAt)||!currentKey} onClick={()=>void runtime.suggestNow()}>
          {runtime.suggestionBusy?"Generando…":"Sugerir ahora"}
        </button>
      </div>
      <label className="tgs-row">
        <input
          type="checkbox"
          checked={runtime.autoSuggestions}
          onChange={event=>runtime.setAutoSuggestions(event.target.checked)}
        />
        <span>Sugerencias automáticas al abrir un chat</span>
      </label>
      <div className="tgs-muted">Al abrir un chat, revisa si el cliente sigue esperando una respuesta real. Ignora los saludos automáticos de Meta y nunca envía la sugerencia sola.</div>
      <label className="tgs-row">
        <input
          type="checkbox"
          checked={runtime.simulationMode}
          onChange={event=>runtime.setSimulationMode(event.target.checked)}
        />
        <span><b>Automático de prueba</b> — recorre todos los chats y prepara respuestas, pero NO envía nada</span>
      </label>
      {runtime.manualStatus?<Alert tone="info">{runtime.manualStatus}</Alert>:null}
      {runtime.suggestionError?<Alert tone="bad">{runtime.suggestionError} <button className="tgs-btn ghost sm" disabled={runtime.suggestionBusy} onClick={()=>void runtime.suggestNow()}>Reintentar</button></Alert>:null}
      {runtime.warning?<Alert tone="warn">{runtime.warning}</Alert>:null}
      {runtime.currentSuggestion?<>
        <textarea
          className="tgs-input"
          rows={4}
          value={draft}
          onChange={event=>setDraft(event.target.value)}
          readOnly={runtime.currentSuggestion.inserted}
          aria-label="Texto sugerido"
        />
        {currentNotification?.metadata?.shouldCreateRequest?<Alert tone="info">Parece un pedido de presupuesto. Podés crear la solicitud antes o después de responder.</Alert>:null}
        <div className="tgs-row wrap">
          <button className="tgs-btn sm" disabled={runtime.suggestionBusy||runtime.currentSuggestion.inserted||!draft.trim()} onClick={()=>void runtime.insertCurrentSuggestion(draft.trim())}>
            {runtime.currentSuggestion.inserted?"Ya insertada":"Insertar en el mensaje"}
          </button>
          <button className="tgs-btn ghost sm" disabled={runtime.suggestionBusy} onClick={()=>void runtime.dismissCurrentSuggestion(draft)}>
            Descartar
          </button>
          {currentNotification?.metadata?.shouldCreateRequest&&!currentNotification.metadata?.requestId?<button className="tgs-btn warn sm" disabled={runtime.busy} onClick={()=>void runtime.createRequest(currentNotification)}>Crear solicitud</button>:null}
          {currentNotification?.metadata?.requestId?<Pill tone="ok">Solicitud {String(currentNotification.metadata.requestId)}</Pill>:null}
        </div>
        {runtime.currentSuggestion.attachments.length?<div className="tgs-stack">
          <span className="tgs-field-label">Adjuntos preparados por la regla</span>
          <div className="tgs-row wrap">
            {runtime.currentSuggestion.attachments.flatMap(attachment=>[
              attachment.image?<button key={`${attachment.ruleId}-image`} className="tgs-btn ghost sm" disabled={runtime.suggestionBusy} onClick={()=>void runtime.attachSuggestionFile(attachment,"image")}>Adjuntar imagen</button>:null,
              attachment.quote?<button key={`${attachment.ruleId}-quote`} className="tgs-btn ghost sm" disabled={runtime.suggestionBusy} onClick={()=>void runtime.attachSuggestionFile(attachment,"quote")}>Adjuntar presupuesto {attachment.quote.visibleNumber} V{attachment.quote.version}</button>:null,
            ])}
          </div>
          <div className="tgs-muted">En Solo sugerir, ningún archivo se envía automáticamente.</div>
        </div>:null}
        {runtime.currentSuggestion.inserted?<div className="tgs-muted">Podés editarla directamente en WhatsApp. El envío se registra cuando tocás el botón Enviar.</div>:null}
      </>:null}
    </div>
    <Section title="Modo del chat actual" defaultOpen>
      {!currentKey?<Alert tone="warn">Abrí un chat para configurar su modo.</Alert>:<>
        <Field label="Comportamiento">
          <select className="tgs-input" disabled={runtime.busy} value={runtime.conversation?.modeOverride??"INHERIT"} onChange={e=>void runtime.setMode(e.target.value==="INHERIT"?null:e.target.value as ChatbotMode)}>
            <option value="INHERIT">Heredar global ({runtime.settings?.defaultMode??"…" })</option>
            <option value="AUTO">Automático</option><option value="SUGGEST">Solo sugerir</option><option value="OFF">Apagado</option>
          </select>
        </Field>
        {runtime.conversation?.escalatedAt?<Alert tone="warn">Pausado para intervención humana: {runtime.conversation.escalationReason??"sin detalle"} <button className="tgs-btn ghost sm" onClick={()=>void runtime.clearEscalation()}>Retomar bot</button></Alert>:null}
        {runtime.conversation?.activeRequestId?<Alert tone="ok">Solicitud vinculada: {runtime.conversation.activeRequestId}</Alert>:null}
      </>}
    </Section>
    <ChatbotCustomerContext runtime={runtime} phone={phone} detectedName={name}/>
    <Section title="Actividad reciente">
      <div className="tgs-list">{runtime.logs.length?runtime.logs.map(log=><div className="tgs-list-item" key={log.id}>
        <div className="tgs-row between"><div className="tgs-row">{log.direction==="OUTBOUND"&&log.decisionMetadata?.simulated?<Pill tone="warn">PRUEBA</Pill>:null}<Pill tone={log.status==="SENT"?"ok":log.status.includes("FAIL")?"bad":log.status==="ESCALATED"?"warn":"neutral"}>{log.direction==="OUTBOUND"&&log.decisionMetadata?.simulated?"No enviado":log.status}</Pill></div><span className="tgs-muted">{relativeTime(log.createdAt)}</span></div>
        <div>{log.direction==="INBOUND"?"Cliente":"Negocio"}: {log.text||"(sin respuesta al cliente)"}</div>
        <div className="tgs-muted">{log.mode??"—"} · {log.actor}{log.decisionMetadata?.reusedResponse?` · respuesta reutilizada (${String((log.decisionMetadata.reusedResponse as Record<string,unknown>).similarity??"?")}%, 0 tokens)`:null}</div>
        {log.direction==="OUTBOUND"&&log.decisionMetadata?.simulated?<div className="tgs-muted">{(()=>{
          const outcome=log.decisionMetadata?.simulationOutcome as Record<string,unknown>|undefined;
          if(outcome?.wouldEscalate)return `Escalaría: ${String(outcome.escalationReason??"revisión humana")}`;
          const attachments=Array.isArray(outcome?.wouldAttach)?outcome.wouldAttach as Array<Record<string,unknown>>:[];
          const labels=attachments.flatMap(item=>{
            const image=item.image as Record<string,unknown>|undefined;
            const quote=item.quote as Record<string,unknown>|undefined;
            return [
              image?String(image.filename??"imagen"):null,
              quote?`${String(quote.visibleNumber??"presupuesto")} V${String(quote.version??"?")}`:null,
            ].filter((value):value is string=>Boolean(value));
          });
          return labels.length?`Adjuntaría: ${labels.join(", ")}.`:"Simulación — no enviado.";
        })()}</div>:null}
      </div>):<EmptyState icon="◷" text="Todavía no hay actividad para este chat."/>}</div>
    </Section>
  </div>;
}

export function Panel() {
  useEffect(() => {
    injectPanelStyles();
  }, []);

  const [open, setOpen] = useState(true);
  const panelRef=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState<{left:number;top:number}|null>(()=>{
    try{const saved=localStorage.getItem("tgs-panel-position");return saved?JSON.parse(saved):null}catch{return null}
  });
  const dragRef=useRef<{dx:number;dy:number}|null>(null);
  const [activeTab, setActiveTab] = useState<"chat"|"quote"|"history"|"chatbot">("chat");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [detection, setDetection] = useState<ChatDetection>(() => detectChat());
  const [phoneOverride, setPhoneOverride] = useState(detection.phone);
  const [nameOverride, setNameOverride] = useState(
    nameIsOnlyThePhone(detection.name,detection.phone)?"":detection.name,
  );

  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [recentQuotes, setRecentQuotes] = useState<Quote[]>([]);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [latestSent,setLatestSent]=useState<LatestSentQuote|null>(null);
  const chatSelectionsRef = useRef(new Map<string, { selectedQuoteId: string | null }>());
  const activeChatKeyRef = useRef(chatIdentity(detection.phone, detection.name));

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [notifLoading, setNotifLoading] = useState(true);

  const [connection, setConnection] = useState<ExtensionConnection | null>(null);
  const [connectionBusy, setConnectionBusy] = useState(false);

  const loadCustomers = useCallback(async () => { setCustomerLoading(true); try { setCustomers(await listCustomers()); } catch { setCustomers([]); } finally { setCustomerLoading(false); } }, []);
  useEffect(() => { void loadCustomers(); }, [loadCustomers]);
  const phoneKey = phoneOverride.replace(/\D/g, "").replace(/^549?/, "").replace(/^0/, "");
  useEffect(()=>{
    if(!phoneOverride){setLatestSent(null);return}
    void getLatestSentQuote(phoneOverride).then(setLatestSent).catch(()=>setLatestSent(null));
  },[phoneOverride,quote?.version?.state]);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(open&&panelRef.current&&!panelRef.current.contains(event.target as Node))setOpen(false)};
    const move=(event:PointerEvent)=>{if(!dragRef.current)return;const width=panelRef.current?.offsetWidth??380,height=panelRef.current?.offsetHeight??56;setPosition({left:Math.max(8,Math.min(window.innerWidth-width-8,event.clientX-dragRef.current.dx)),top:Math.max(8,Math.min(window.innerHeight-height-8,event.clientY-dragRef.current.dy))})};
    const up=()=>{dragRef.current=null;setPosition(current=>{if(current)localStorage.setItem("tgs-panel-position",JSON.stringify(current));return current})};
    document.addEventListener("pointerdown",outside);document.addEventListener("pointermove",move);document.addEventListener("pointerup",up);
    return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up)}
  },[open]);
  const matchedCustomer = useMemo(() => customers.find(customer => { const value=(customer.normalizedPhone || customer.phone || "").replace(/\D/g, "").replace(/^549?/, "").replace(/^0/, ""); return Boolean(phoneKey) && value.endsWith(phoneKey); }) ?? null, [customers, phoneKey]);
  const checkConnection = useCallback(async () => {
    setConnectionBusy(true);
    try {
      setConnection(await probeExtensionConnection());
    } catch (err) {
      setConnection({
        ok: false,
        extensionVersion: "?",
        apiBase: (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:3001/api",
        healthOk: false,
        sessionOk: false,
        error: errorMessage(err),
      });
    } finally {
      setConnectionBusy(false);
    }
  }, []);

  useEffect(() => {
    void checkConnection();
    const interval = window.setInterval(() => void checkConnection(), 45000);
    return () => window.clearInterval(interval);
  }, [checkConnection]);

  useEffect(() => {
    const subscription=observeActiveChat((next)=>setDetection(next));
    return () => subscription.stop();
  }, []);

  useEffect(() => {
    const previousKey = activeChatKeyRef.current;
    const nextKey = chatIdentity(detection.phone, detection.name);
    setPhoneOverride(detection.phone);
    setNameOverride(
      nameIsOnlyThePhone(detection.name,detection.phone)?"":detection.name,
    );
    if (previousKey === nextKey) return;

    if (previousKey) chatSelectionsRef.current.set(previousKey, { selectedQuoteId });
    activeChatKeyRef.current = nextKey;
    setQuoteError(null);

    const cachedQuoteId = nextKey ? chatSelectionsRef.current.get(nextKey)?.selectedQuoteId ?? null : null;
    if (!cachedQuoteId) {
      setSelectedQuoteId(null);
      setQuote(null);
      setQuoteLoading(false);
      return;
    }

    setSelectedQuoteId(cachedQuoteId);
    setQuote(null);
    setQuoteLoading(true);
    void getQuote(cachedQuoteId)
      .then((restored) => {
        if (activeChatKeyRef.current !== nextKey) return;
        setQuote(restored);
        setRecentQuotes((current) => [restored, ...current.filter((item) => item.id !== restored.id)].slice(0, 5));
      })
      .catch((error) => {
        if (activeChatKeyRef.current !== nextKey) return;
        setQuoteError(errorMessage(error));
        setSelectedQuoteId(null);
        chatSelectionsRef.current.set(nextKey, { selectedQuoteId: null });
      })
      .finally(() => {
        if (activeChatKeyRef.current === nextKey) setQuoteLoading(false);
      });
  }, [detection.phone, detection.name]);

  const loadNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      setNotifications(await listNotifications());
      setNotifError(null);
    } catch (err) {
      setNotifError(errorMessage(err));
    } finally {
      setNotifLoading(false);
    }
  }, []);

  const chatbotRuntime=useChatbotRuntime(phoneOverride,nameOverride,notifications,loadNotifications);

  useEffect(()=>{
    if(!connection?.ok)return;
    void chatbotRuntime.ensureEnabled().catch(error=>console.warn("[tgs-bot] no se pudo asegurar que el bot esté encendido",error));
  },[connection,chatbotRuntime.ensureEnabled]);

  useEffect(() => {
    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(), 60000);
    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  async function selectQuote(id: string) {
    setSelectedQuoteId(id);
    setActiveTab("quote");
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const selected = await getQuote(id);
      setQuote(selected);
      setRecentQuotes(current => [selected, ...current.filter(item => item.id !== selected.id)].slice(0, 5));
    } catch (err) {
      setQuoteError(errorMessage(err));
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }

  async function reloadQuote(id: string) {
    try {
      const selected = await getQuote(id);
      setQuote(selected);
      setRecentQuotes(current => [selected, ...current.filter(item => item.id !== selected.id)].slice(0, 5));
    } catch (err) {
      setQuoteError(errorMessage(err));
    }
  }

  const unreadCount = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications]);

  async function handleMarkNotification(id: string, body: { read?: boolean; acted?: boolean }) {
    try {
      await markNotification(id, body);
      await loadNotifications();
    } catch (err) {
      setNotifError(errorMessage(err));
    }
  }

  const connectionTone: Tone = !connection
    ? "neutral"
    : connection.ok
      ? "ok"
      : connection.healthOk
        ? "warn"
        : "bad";
  const connectionLabel = !connection
    ? "…"
    : connection.ok
      ? "Conectado"
      : connection.healthOk
        ? "Sin sesión"
        : "API offline";

  return (
    <div ref={panelRef} className={`tgs-panel${open ? "" : " collapsed"}`} style={position?{left:position.left,top:position.top,right:"auto"}:undefined}>
      <div className="tgs-header" onClick={() => open || setOpen(true)} onPointerDown={event=>{if(!open||event.button!==0)return;const rect=panelRef.current?.getBoundingClientRect();if(rect)dragRef.current={dx:event.clientX-rect.left,dy:event.clientY-rect.top}}}>
        <span className="tgs-title" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
          TGS{chatbotRuntime.simulationMode?" · PRUEBA":chatbotRuntime.autoRunning?" · AUTO":""} {unreadCount > 0 && !open ? <span className="tgs-badge-dot">{unreadCount}</span> : null}
        </span>
        {open ? (
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <NotificationsBell
              notifications={notifications}
              open={notifOpen}
              onToggle={() => setNotifOpen((v) => !v)}
              onMark={(id, body) => void handleMarkNotification(id, body)}
              error={notifError}
              loading={notifLoading}
            />
            <button className="tgs-btn ghost sm" onClick={() => setOpen(false)}>
              ⟶
            </button>
          </div>
        ) : null}
      </div>

      {open ? (
        <div className="tgs-body">
          {chatbotRuntime.simulationMode?<Alert tone="warn"><b>MODO PRUEBA:</b> ningún mensaje ni adjunto automático puede enviarse.</Alert>:null}
          <div className="tgs-row" style={{ alignItems: "center", marginBottom: 8 }}>
            <Pill tone={connectionTone}>{connectionLabel}</Pill>
            <button
              className="tgs-btn ghost sm"
              disabled={connectionBusy}
              onClick={() => void checkConnection()}
            >
              {connectionBusy ? "…" : "Probar"}
            </button>
          </div>
          {connection?.error && !connection.ok ? (
            <Alert tone={connection.healthOk ? "warn" : "bad"}>{connection.error}</Alert>
          ) : null}
          {connection?.ok && connection.user ? (
            <p className="tgs-muted" style={{ marginTop: 0 }}>
              Sesión: {connection.user.displayName || connection.user.username}
            </p>
          ) : null}

          <Tabs tabs={[{id:"chat",label:"Chat"},{id:"quote",label:"Presupuesto"},{id:"history",label:"Historial"},{id:"chatbot",label:chatbotRuntime.suggestionBusy?"Bot · Generando…":chatbotRuntime.currentSuggestion?"Bot · Lista":"Bot"}]} active={activeTab} onChange={setActiveTab}/>
          <div className="tgs-tab-panel">
            {activeTab === "chat" ? <>
              {latestSent?<Alert tone="info"><div className="tgs-stack"><b>Presupuesto {latestSent.quote.visibleNumber} enviado el {new Date(latestSent.delivery.deliveredAt).toLocaleDateString("es-AR")} · {formatArs(latestSent.quote.version?.totalSaleCents)} · Estado: {latestSent.quote.version?STATE_LABEL[latestSent.quote.version.state]:"—"}</b><div className="tgs-row wrap"><button className="tgs-btn sm" disabled={latestSent.quote.version?.state==="ACEPTADO"} onClick={()=>void changeQuoteState(latestSent.quote.id,"ACEPTADO").then(()=>getLatestSentQuote(phoneOverride)).then(setLatestSent)}>Aceptado</button><button className="tgs-btn ghost sm" onClick={()=>{setQuote(null);setSelectedQuoteId(null);setActiveTab("quote")}}>Enviar otro presupuesto</button><button className="tgs-btn ghost sm" onClick={()=>document.querySelector<HTMLElement>("#tgs-panel-root .tgs-section")?.scrollIntoView({behavior:"smooth"})}>Pedir solicitud rápida</button><button className="tgs-btn ghost sm" onClick={()=>void selectQuote(latestSent.quote.id)}>Editar presupuesto rápido</button></div></div></Alert>:null}
              <Section title="Crear solicitud rápida" defaultOpen><QuickRequestSection phone={phoneOverride} name={nameOverride} onCreated={()=>void 0}/></Section>
              <ChatDetectionCard detection={detection} onRetry={() => setDetection(detectChat())} phone={phoneOverride} name={nameOverride} onPhoneChange={setPhoneOverride} onNameChange={setNameOverride}/>
              <Section title="Cliente del chat" defaultOpen>
                {customerLoading ? <Skeleton rows={3}/> : matchedCustomer ? <div className="tgs-list-item selected"><b>{matchedCustomer.name}</b><div className="tgs-muted">{matchedCustomer.phone ?? "Sin teléfono"} · DNI {matchedCustomer.dni ?? "—"}</div><button className="tgs-btn ghost sm" onClick={()=>setActiveTab("quote")}>Ver presupuestos de este cliente</button></div> : <><Alert tone="info">No hay un cliente vinculado a este teléfono.</Alert><button className="tgs-btn" onClick={()=>setCustomerModalOpen(true)}>Vincular o crear cliente</button></>}
              </Section>
              <Section title="Notificaciones del chat"><div className="tgs-list">{notifications.filter(n=>!phoneOverride||n.chatPhone?.replace(/\D/g,"").endsWith(phoneKey)).map(n=><div className="tgs-list-item" key={n.id}><b>{n.title}</b><div className="tgs-muted">{n.body}</div></div>)}</div></Section>
              <Section title="Solicitudes listas e historial" defaultOpen>
                <ReadyRequestsSection
                  phone={phoneOverride}
                  customerId={matchedCustomer?.id}
                  onSelect={id=>void selectQuote(id)}
                  includeHistory
                />
              </Section>
            </> : null}
            {activeTab === "quote" ? <>
              {quoteLoading ? <Skeleton rows={6}/> : null}{quoteError ? <Alert tone="bad">{quoteError}</Alert> : null}
              {quote ? <><QuoteSwitcher quote={quote} recent={recentQuotes} onSelect={id=>void selectQuote(id)} onClear={()=>{setQuote(null);setSelectedQuoteId(null)}}/><QuoteDetail quote={quote} detection={detection} phoneOverride={phoneOverride} nameOverride={nameOverride} onReload={reloadQuote}/></> : <>
                <Alert tone="info">Elegí un presupuesto para editarlo, preparar el PDF o gestionar el envío.</Alert>
                <Section title="Buscar presupuesto" defaultOpen><SearchQuotesSection phone={phoneOverride} customerId={matchedCustomer?.id} onSelect={id=>void selectQuote(id)}/></Section>
                <Section title="Solicitudes listas"><ReadyRequestsSection phone={phoneOverride} customerId={matchedCustomer?.id} onSelect={id=>void selectQuote(id)}/></Section>
                <Section title="Colecciones"><CollectionsSection onSelect={id=>void selectQuote(id)}/></Section>
              </>}
            </> : null}
            {activeTab === "history" ? <HistoryTab quote={quote} onReload={reloadQuote}/> : null}
            {activeTab === "chatbot" ? <ChatbotTab runtime={chatbotRuntime} notifications={notifications} currentKey={chatIdentity(phoneOverride,nameOverride)} phone={phoneOverride} name={nameOverride}/> : null}
          </div>
          {customerModalOpen ? <CustomerModal phone={phoneOverride} quote={quote} requestId={quote?.requestId} onClose={()=>setCustomerModalOpen(false)} onLinked={()=>{void loadCustomers();if(quote)void reloadQuote(quote.id)}}/> : null}
          <p className="tgs-muted" style={{marginTop:10}}>Los envíos automáticos sólo ocurren cuando las respuestas del bot están encendidas y el chat está en modo Automático.</p>
        </div>
      ) : null}
    </div>
  );
}

const pageScript=document.createElement("script");
pageScript.src=chrome.runtime.getURL("injected.js");
pageScript.onload=()=>pageScript.remove();
document.documentElement.appendChild(pageScript);

const root = document.createElement("div");
root.id = "tgs-panel-root";
document.body.appendChild(root);
createRoot(root).render(<Panel />);
