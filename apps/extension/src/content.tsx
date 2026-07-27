import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { attachFileToComposer, detectChat, findLastIncomingMessageText, insertMessageIntoComposer, observeOutgoingMessage, type ChatDetection } from "./dom-selectors";
import {
  changeQuoteState,
  createQuickRequest,
  createQuoteVersion,
  createSendAttempt,
  errorMessage,
  generatePdf,
  getQuote,
  getTimeline,
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

/** Panel de detección + estado del chat, con confianza 0-100 y advertencia nunca silenciada. */
function ChatDetectionCard({detection,onRetry,phone,name,onPhoneChange,onNameChange}:{detection:ChatDetection;onRetry:()=>void;phone:string;name:string;onPhoneChange:(v:string)=>void;onNameChange:(v:string)=>void}) {
  const [expanded,setExpanded]=useState(false);
  const statusIcon=detection.confidence>=70?"🟢":detection.confidence>=40?"🟡":"🔴";
  const realFailure=Boolean(detection.warning)&&detection.confidence===0;
  return <div className="tgs-list-item">
    <div className="tgs-row between">
      <div className="tgs-row"><span aria-label="Estado de detección">{statusIcon}</span><b>{name||"Sin detectar"}</b><span className="tgs-muted">·</span><span className="tgs-muted">{phone||"Sin teléfono"}</span>{realFailure?<span title="No se pudo detectar el chat">⚠</span>:null}</div>
      <button className="tgs-btn ghost sm" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?"Cerrar":"⚙ Editar"}</button>
    </div>
    {expanded?<div className="tgs-stack">
      <div className="tgs-row"><ConfidenceBar value={detection.confidence}/><span className="tgs-muted">{detection.confidence}%</span></div>
      {detection.warning?<Alert tone={detection.name&&!detection.phone?"info":detection.confidence===0?"bad":"warn"}>{detection.warning} <button className="tgs-btn ghost sm" onClick={onRetry}>Reintentar detección</button></Alert>:null}
      <div className="tgs-row"><Field label="Nombre detectado"><input className="tgs-input" value={name} onChange={e=>onNameChange(e.target.value)} placeholder="Sin detectar"/></Field><Field label="Teléfono detectado"><input className="tgs-input" value={phone} onChange={e=>onPhoneChange(e.target.value)} placeholder="Sin detectar"/></Field></div>
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

function VersionEditModal({initialMessage,onCancel,onConfirm,busy}:{initialMessage:string;onCancel:()=>void;onConfirm:(message:string,note:string)=>void;busy:boolean}){const[message,setMessage]=useState(initialMessage),[note,setNote]=useState("");return <ModalShell title="Crear nueva versión" subtitle="La versión enviada permanece congelada" onClose={onCancel} footer={<><button className="tgs-btn ghost" onClick={onCancel} disabled={busy}>Cancelar</button><button className="tgs-btn" disabled={busy||!note.trim()} onClick={()=>onConfirm(message,note.trim())}>{busy?"Creando…":"Crear nueva versión"}</button></>}><div className="tgs-stack"><Alert tone="warn">Para editar el mensaje se creará una versión nueva en borrador con los mismos ítems.</Alert><Field label="Mensaje nuevo"><textarea className="tgs-input" value={message} onChange={e=>setMessage(e.target.value)}/></Field><Field label="Motivo de la nueva versión"><input className="tgs-input" value={note} onChange={e=>setNote(e.target.value)}/></Field></div></ModalShell>}
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
  const locked = version?.state === "ENVIADO";

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
      const inserted = insertMessageIntoComposer(message);
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
      setNotice("Nueva versión creada en borrador con el mensaje actualizado.");
      await reload();
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
      <button className="tgs-btn" style={{ width: "100%", marginTop: 8 }} onClick={() => setQuickEditOpen(true)}>Editar presupuesto</button>

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
function ReadyRequestsSection({phone,customerId,onSelect}:{phone:string;customerId?:string|null;onSelect:(familyId:string)=>void}) {
  const [requests,setRequests]=useState<QuoteRequest[]|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const phoneKey=normalizeChatPhone(phone);
  async function load(){setLoading(true);setError(null);try{const all=await listRequests();setRequests(all.filter(request=>request.state==="LISTA"&&((Boolean(customerId)&&request.customerId===customerId)||(Boolean(phoneKey)&&normalizeChatPhone(request.detectedPhone)===phoneKey))))}catch(err){setError(errorMessage(err))}finally{setLoading(false)}}
  useEffect(()=>{void load()},[phoneKey,customerId]);
  const actionable=(requests??[]).filter(request=>Boolean(request.families?.[0]));
  return <div className="tgs-stack">
    <button className="tgs-btn ghost sm" disabled={loading} onClick={()=>void load()}>Actualizar solicitudes listas</button>
    {error?<Alert tone="bad">{error}</Alert>:null}
    {loading?<Skeleton rows={3}/>:null}
    {!loading&&!error&&actionable.length===0?<EmptyState icon="✓" text="No hay solicitudes listas con presupuesto para este chat."/>:null}
    <div className="tgs-list">{actionable.map(request=>{const family=request.families![0]!;return <div key={request.id} className="tgs-list-item" role="button" tabIndex={0} onClick={()=>onSelect(family.id)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect(family.id)}}}><div className="tgs-row between"><div><b>{request.title}</b><div className="tgs-muted">{request.customer?.name??request.detectedPhone??"Sin contacto"} · {family.visibleNumber}</div></div><span className="tgs-muted">Abrir para enviar →</span></div></div>})}</div>
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
function HistoryTab({quote}:{quote:Quote|null}){const[timeline,setTimeline]=useState<QuoteTimeline|null>(null),[filter,setFilter]=useState("TODOS"),[loading,setLoading]=useState(false),[error,setError]=useState<string|null>(null);useEffect(()=>{if(!quote){setTimeline(null);return}setLoading(true);void getTimeline(quote.id).then(setTimeline).catch(e=>setError(errorMessage(e))).finally(()=>setLoading(false))},[quote?.id]);const types=["TODOS",...new Set((timeline?.events??[]).map(event=>event.type))];return <div>{!quote?<Alert tone="info">Seleccioná un presupuesto para ver su historial.</Alert>:null}{loading?<Skeleton rows={6}/>:null}{error?<Alert tone="bad">{error}</Alert>:null}{timeline?<><Field label="Filtrar eventos"><select className="tgs-input" value={filter} onChange={e=>setFilter(e.target.value)}>{types.map(type=><option key={type}>{type}</option>)}</select></Field><div className="tgs-list">{timeline.events.filter(event=>filter==="TODOS"||event.type===filter).length===0?<EmptyState icon="◷" text="No hay eventos para este filtro."/>:timeline.events.filter(event=>filter==="TODOS"||event.type===filter).slice().reverse().map(event=><div className="tgs-timeline-item" key={event.id}><b>{event.type.replaceAll("_"," ")}</b><div className="tgs-muted">{formatDateTime(event.createdAt)}</div></div>)}</div></>:null}</div>}
function chatIdentity(phone:string,name:string):string { const digits=phone.replace(/\D/g,""); if(digits)return `tel:${digits}`; const normalizedName=name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase("es-AR").replace(/\s+/g," "); return normalizedName?`name:${normalizedName}`:""; }
export function Panel() {
  useEffect(() => {
    injectPanelStyles();
  }, []);

  const [open, setOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"chat"|"quote"|"history">("chat");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [detection, setDetection] = useState<ChatDetection>(() => detectChat());
  const [phoneOverride, setPhoneOverride] = useState(detection.phone);
  const [nameOverride, setNameOverride] = useState(detection.name);

  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [recentQuotes, setRecentQuotes] = useState<Quote[]>([]);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
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
  const matchedCustomer = useMemo(() => customers.find(customer => { const value=(customer.normalizedPhone || customer.phone || "").replace(/\D/g, "").replace(/^549?/, "").replace(/^0/, ""); return Boolean(phoneKey) && value.endsWith(phoneKey); }) ?? null, [customers, phoneKey]);
  const checkConnection = useCallback(async () => {
    setConnectionBusy(true);
    try {
      setConnection(await probeExtensionConnection());
    } catch (err) {
      setConnection({
        ok: false,
        extensionVersion: "?",
        apiBase: "http://localhost:3001/api",
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
    const observer = new MutationObserver(() => {
      const next = detectChat();
      setDetection((prev) =>
        prev.phone === next.phone && prev.name === next.name ? prev : next,
      );
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const previousKey = activeChatKeyRef.current;
    const nextKey = chatIdentity(detection.phone, detection.name);
    setPhoneOverride(detection.phone);
    setNameOverride(detection.name);
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
    <div className={`tgs-panel${open ? "" : " collapsed"}`}>
      <div className="tgs-header" onClick={() => open || setOpen(true)}>
        <span className="tgs-title" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
          TGS {unreadCount > 0 && !open ? <span className="tgs-badge-dot">{unreadCount}</span> : null}
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

          <Tabs tabs={[{id:"chat",label:"Chat"},{id:"quote",label:"Presupuesto"},{id:"history",label:"Historial"}]} active={activeTab} onChange={setActiveTab}/>
          <div className="tgs-tab-panel">
            {activeTab === "chat" ? <>
              <Section title="Solicitudes listas para enviar" defaultOpen><ReadyRequestsSection phone={phoneOverride} customerId={matchedCustomer?.id} onSelect={id=>void selectQuote(id)}/></Section>
              <ChatDetectionCard detection={detection} onRetry={() => setDetection(detectChat())} phone={phoneOverride} name={nameOverride} onPhoneChange={setPhoneOverride} onNameChange={setNameOverride}/>
              <Section title="Cliente del chat" defaultOpen>
                {customerLoading ? <Skeleton rows={3}/> : matchedCustomer ? <div className="tgs-list-item selected"><b>{matchedCustomer.name}</b><div className="tgs-muted">{matchedCustomer.phone ?? "Sin teléfono"} · DNI {matchedCustomer.dni ?? "—"}</div><button className="tgs-btn ghost sm" onClick={()=>setActiveTab("quote")}>Ver presupuestos de este cliente</button></div> : <><Alert tone="info">No hay un cliente vinculado a este teléfono.</Alert><button className="tgs-btn" onClick={()=>setCustomerModalOpen(true)}>Vincular o crear cliente</button></>}
              </Section>
              <Section title="Crear solicitud rápida"><QuickRequestSection phone={phoneOverride} name={nameOverride} onCreated={()=>void 0}/></Section>
              <Section title="Notificaciones del chat"><div className="tgs-list">{notifications.filter(n=>!phoneOverride||n.chatPhone?.replace(/\D/g,"").endsWith(phoneKey)).map(n=><div className="tgs-list-item" key={n.id}><b>{n.title}</b><div className="tgs-muted">{n.body}</div></div>)}</div></Section>
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
            {activeTab === "history" ? <HistoryTab quote={quote}/> : null}
          </div>
          {customerModalOpen ? <CustomerModal phone={phoneOverride} quote={quote} requestId={quote?.requestId} onClose={()=>setCustomerModalOpen(false)} onLinked={()=>{void loadCustomers();if(quote)void reloadQuote(quote.id)}}/> : null}
          <p className="tgs-muted" style={{marginTop:10}}>El envío final siempre queda bajo control del vendedor.</p>
        </div>
      ) : null}
    </div>
  );
}

const root = document.createElement("div");
root.id = "tgs-panel-root";
document.body.appendChild(root);
createRoot(root).render(<Panel />);
