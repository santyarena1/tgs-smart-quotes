import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  createCustomer,
  acustockProductImagePath,
  createCustomerQuick,
  createQuickRequest,
  createSendAttempt,
  errorMessage,
  fetchBlob,
  generatePdf,
  generateQuoteSendMessage,
  generateVersionPdf,
  getTimeline,
  pdfDownloadPath,
  versionPdfDownloadPath,
  queueChatbotRecontact,
  resolveSendAttempt,
  searchAcustockProducts,
  searchQuotes,
  updateChatbotSettings,
  updateRequest,
} from "../lib/api";
import type {
  AcustockProduct,
  ChatbotMode,
  ChatbotResponseEntry,
  ChatbotSettings,
  Customer,
  PdfKind,
  Quote,
  QuoteTimeline,
} from "../lib/types";
import {
  attachFileToComposer,
  findRecentMessageSnippets,
  insertMessageIntoComposer,
  observeOutgoingMessage,
} from "../dom-selectors";
import { formatArs, formatArsWhole, formatDateTime } from "../lib/format";
import {
  Alert,
  EmptyState,
  Field,
  ModalShell,
  Pill,
  Skeleton,
  Tabs,
} from "./ui";

const lines = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

export function QuickRequestModal({
  phone,
  name,
  chatKey,
  customer,
  onClose,
  onCreated,
}: {
  phone: string;
  name: string;
  chatKey: string;
  customer: Customer | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState(name ? `Consulta de ${name}` : "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (!title.trim()) return setError("El título es obligatorio.");
    setBusy(true);
    setError(null);
    try {
      let linked = customer;
      if (!linked && phone)
        linked = name
          ? await createCustomer({ name, phone, dni: null })
          : await createCustomerQuick(phone);
      const request = await createQuickRequest({
        title: title.trim(),
        originalText: text.trim(),
        detectedPhone: phone || null,
      });
      if (linked) await updateRequest(request.id, { customerId: linked.id });
      if (chatKey)
        await queueChatbotRecontact(chatKey, {
          requestId: request.id,
          displayName: name || undefined,
        });
      onCreated();
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalShell
      title="Solicitud rápida"
      subtitle="Queda vinculada al chat y agendada para seguimiento"
      onClose={onClose}
      footer={
        <>
          <button className="tgs-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="tgs-btn"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? "Creando…" : "Crear solicitud"}
          </button>
        </>
      }
    >
      <div className="tgs-stack">
        {error ? <Alert tone="bad">{error}</Alert> : null}
        <Field label="Título">
          <input
            className="tgs-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Descripción del pedido">
          <textarea
            className="tgs-input"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Qué necesita el cliente, preferencias y presupuesto…"
          />
        </Field>
        <div className="tgs-muted">
          {customer
            ? `Cliente: ${customer.name}`
            : phone
              ? "Si hace falta, se crea el cliente automáticamente."
              : "No se detectó teléfono; la solicitud se crea sin cliente."}
        </div>
      </div>
    </ModalShell>
  );
}

export function QuoteSearchModal({
  phone,
  customerId,
  onClose,
  onView,
  onEdit,
  onSend,
}: {
  phone: string;
  customerId?: string | null;
  onClose: () => void;
  onView: (quote: Quote) => void;
  onEdit: (quote: Quote) => void;
  onSend: (quote: Quote) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!q.trim()) return;
      setLoading(true);
      void searchQuotes({
        q: q.trim(),
        phone: phone || undefined,
        customerId: customerId || undefined,
      })
        .then((result) => {
          setItems(result.items);
          setSearched(true);
        })
        .catch((reason) => setError(errorMessage(reason)))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q, phone, customerId]);
  return (
    <ModalShell
      title="Buscar presupuesto"
      subtitle="Número, cliente, producto o descripción"
      wide
      onClose={onClose}
      footer={
        <button className="tgs-btn ghost" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      <div className="tgs-stack">
        <Field label="Buscar">
          <input
            autoFocus
            className="tgs-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ej. SQ-1042, monitor 4K, Gómez…"
          />
        </Field>
        {error ? <Alert tone="bad">{error}</Alert> : null}
        {loading ? (
          <Skeleton rows={5} />
        ) : items.length ? (
          <div className="tgs-list">
            {items.map((item) => (
              <QuoteSearchCard key={item.id} quote={item} onView={onView} onEdit={onEdit} onSend={onSend}/>
            ))}
          </div>
        ) : searched ? (
          <EmptyState icon="⌕" text="No encontramos presupuestos." />
        ) : (
          <EmptyState icon="⌕" text="Escribí para buscar." />
        )}
      </div>
    </ModalShell>
  );
}

function quoteAtVersion(quote:Quote,versionNumber:number):Quote{
  const version=quote.versions.find(item=>item.version===versionNumber)??quote.version;
  return{...quote,version,items:version?.items??quote.items};
}
function quoteItemsPreview(quote:Quote):string{
  const names=(quote.version?.items?.length?quote.version.items:quote.items).map(item=>item.frozenName??item.name??"").filter(Boolean);
  return names.length?`${names.slice(0,4).join(" · ")}${names.length>4?" · …":""}`:"Sin componentes cargados";
}
function QuoteSearchCard({quote,onView,onEdit,onSend}:{quote:Quote;onView:(quote:Quote)=>void;onEdit:(quote:Quote)=>void;onSend:(quote:Quote)=>void}){
  const initial=quote.version?.version??quote.activeVersion;
  const[selectedVersion,setSelectedVersion]=useState(initial);
  const selected=quoteAtVersion(quote,selectedVersion);
  return <div className="tgs-list-item tgs-stack">
    <div className="tgs-row between"><div><b>{quote.visibleNumber}</b><div>{quote.internalName}</div></div><Pill>{selected.version?.state??"—"}</Pill></div>
    <div className="tgs-row wrap">
      <Field label="Versión">
        <select className="tgs-input" value={selectedVersion} onChange={event=>setSelectedVersion(Number(event.target.value))}>
          {(quote.versions.length?quote.versions:[quote.version].filter((value):value is NonNullable<Quote["version"]>=>Boolean(value))).map(version=><option key={version.id} value={version.version}>V{version.version} · {version.state}</option>)}
        </select>
      </Field>
      <div><div className="tgs-muted">Cliente</div><span>{quote.customer?.name??"Sin cliente"}</span></div>
      <div><div className="tgs-muted">Total</div><b>{formatArs(selected.version?.totalSaleCents)}</b></div>
    </div>
    <div className="tgs-muted" title={quoteItemsPreview(selected)}>{quoteItemsPreview(selected)}</div>
    <div className="tgs-row wrap">
      <button type="button" className="tgs-btn sm" onClick={()=>onSend(selected)}>📤 Enviar V{selectedVersion}</button>
      <button type="button" className="tgs-btn ghost sm" onClick={()=>onEdit(selected)}>✏️ Editar V{selectedVersion}</button>
      <button type="button" className="tgs-btn ghost sm" onClick={()=>onView(selected)}>Ver / seleccionar</button>
    </div>
  </div>;
}

export function ProductSearchModal({
  onClose,
  onPrepare,
}: {
  onClose: () => void;
  onPrepare: (product: AcustockProduct, imageBlob?: Blob) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AcustockProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imageBlobs=useRef(new Map<string,Blob>());
  useEffect(() => {
    const query=q.trim();
    if(query.length<2){setItems([]);setLoading(false);setError(null);return}
    let cancelled=false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void searchAcustockProducts(query)
        .then((result) => {
          if(cancelled)return;
          setItems(
            result.items.slice().sort((a, b) => {
              const left = BigInt(a.salePriceCents ?? a.priceCents),
                right = BigInt(b.salePriceCents ?? b.priceCents);
              return left < right
                ? -1
                : left > right
                  ? 1
                  : a.title.localeCompare(b.title, "es-AR");
            }),
          );
        })
        .catch((reason) => {if(!cancelled)setError(errorMessage(reason))})
        .finally(() => {if(!cancelled)setLoading(false)});
    },300);
    return () => {cancelled=true;window.clearTimeout(timer)};
  }, [q]);
  async function prepare(product: AcustockProduct) {
    setPreparing(product.mpn);
    setError(null);
    try {
      await onPrepare(product,imageBlobs.current.get(product.mpn));
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPreparing(null);
    }
  }
  return (
    <ModalShell
      title="Productos AcuStock"
      subtitle="Elegí uno para dejar foto y precio preparados en WhatsApp"
      wide
      onClose={onClose}
      footer={
        <button className="tgs-btn ghost" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      <div className="tgs-stack">
        {error ? <Alert tone="bad">{error}</Alert> : null}
        <Field label="Nombre, marca o SKU/MPN">
          <input
            autoFocus
            className="tgs-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ej. monitor ASUS VG279…"
          />
        </Field>
        {q.trim().length<2 ? (
          <EmptyState icon="⌕" text="Escribí al menos dos caracteres para buscar un producto." />
        ) : loading ? (
          <Skeleton rows={6} />
        ) : items.length ? (
          <div className="tgs-product-catalog">
            {items.map((product) => (
              <button
                className="tgs-product-card"
                key={product.mpn}
                disabled={Boolean(preparing)}
                onClick={() => void prepare(product)}
              >
                <ProductThumbnail product={product} cache={imageBlobs.current}/>
                <span className="tgs-product-card-body">
                  <b>{product.title}</b>
                  <span className="tgs-muted">
                    {[product.brand, product.mpn].filter(Boolean).join(" · ")}
                  </span>
                  <strong>
                    {formatArsWhole(product.salePriceCents ?? product.priceCents)}
                  </strong>
                  {preparing === product.mpn ? (
                    <span>Preparando en WhatsApp…</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon="🛒" text="No encontramos productos disponibles." />
        )}
      </div>
    </ModalShell>
  );
}

function ProductThumbnail({product,cache}:{product:AcustockProduct;cache:Map<string,Blob>}){
  const host=useRef<HTMLSpanElement>(null);const[src,setSrc]=useState<string|null>(null);const[failed,setFailed]=useState(!product.imageUrl);
  useEffect(()=>{if(!product.imageUrl)return;let objectUrl:string|null=null,cancelled=false;const show=(blob:Blob)=>{if(cancelled)return;objectUrl=URL.createObjectURL(blob);setSrc(objectUrl)};const load=()=>{const cached=cache.get(product.mpn);if(cached){show(cached);return}void fetchBlob(acustockProductImagePath(product.mpn),{errorMessage:"No se pudo descargar la imagen del producto.",retry429:2}).then(blob=>{cache.set(product.mpn,blob);show(blob)}).catch(()=>{if(!cancelled)setFailed(true)})};const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();load()}},{rootMargin:"160px"});if(host.current)observer.observe(host.current);return()=>{cancelled=true;observer.disconnect();if(objectUrl)URL.revokeObjectURL(objectUrl)}},[product.imageUrl,product.mpn,cache]);
  return <span ref={host}>{src?<img src={src} alt=""/>:<span className="tgs-product-no-image">{failed?"Sin foto":"Cargando…"}</span>}</span>;
}

export function WebSearchModal({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (query: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function insert() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onInsert(query.trim());
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalShell
      title="Buscar en la web"
      subtitle="Dejá el enlace de resultados listo en WhatsApp"
      onClose={onClose}
      footer={
        <>
          <button className="tgs-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="tgs-btn"
            disabled={busy || !query.trim()}
            onClick={() => void insert()}
          >
            {busy ? "Preparando…" : "Insertar enlace"}
          </button>
        </>
      }
    >
      <div className="tgs-stack">
        {error ? <Alert tone="bad">{error}</Alert> : null}
        <Field label="Qué querés buscar">
          <input
            autoFocus
            className="tgs-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void insert();
            }}
            placeholder="Ej. silla nexus"
          />
        </Field>
        <div className="tgs-muted">No se envía automáticamente.</div>
      </div>
    </ModalShell>
  );
}

export function TimelineModal({
  quote,
  onClose,
  onVersion,
}: {
  quote: Quote;
  onClose: () => void;
  onVersion: (version: number) => void;
}) {
  const [data, setData] = useState<QuoteTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void getTimeline(quote.id)
      .then(setData)
      .catch((reason) => setError(errorMessage(reason)));
  }, [quote.id]);
  return (
    <ModalShell
      title={`Historial · ${quote.visibleNumber}`}
      subtitle={`Versión activa V${quote.activeVersion}`}
      wide
      onClose={onClose}
      footer={
        <button className="tgs-btn ghost" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      <div className="tgs-stack">
        {error ? <Alert tone="bad">{error}</Alert> : null}
        {!data ? (
          <Skeleton rows={7} />
        ) : (
          <div className="tgs-list">
            {data.events
              .slice()
              .reverse()
              .map((event) => (
                <button
                  key={event.id}
                  className="tgs-timeline-item"
                  disabled={!event.versionNumber}
                  onClick={() =>
                    event.versionNumber && onVersion(event.versionNumber)
                  }
                >
                  <b>{event.description ?? event.type.replaceAll("_", " ")}</b>
                  <div className="tgs-muted">
                    {formatDateTime(event.createdAt)}
                    {event.versionNumber ? ` · V${event.versionNumber}` : ""}
                  </div>
                </button>
              ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

export function SendQuoteModal({
  quote,
  chatKey,
  phone,
  name,
  confidence,
  onClose,
  onUpdated,
  onEdit,
}: {
  quote: Quote;
  chatKey:string;
  phone: string;
  name: string;
  confidence: number;
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onEdit: () => void;
}) {
  const [kind, setKind] = useState<PdfKind>("SIMPLE");
  const fallbackMessage=quote.version?.sentMessage??`Hola! Te comparto el presupuesto ${quote.visibleNumber} por un total de ${formatArs(quote.version?.totalSaleCents)}. Cualquier consulta quedo a disposición.`;
  const [message, setMessage] = useState(fallbackMessage);
  const [note, setNote] = useState("");
  const [ready, setReady] = useState<Partial<Record<PdfKind, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const[aiBusy,setAiBusy]=useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<{ attemptId: string } | null>(null);
  const observation = useRef<{ stop(): void } | null>(null);
  const keepObservationAfterClose=useRef(false);
  const messageEdited=useRef(false);
  const autoGeneratedFor=useRef("");
  const selectedVersion=quote.version?.version??quote.activeVersion;
  const historical=selectedVersion!==quote.activeVersion;
  useEffect(() => () => {if(!keepObservationAfterClose.current)observation.current?.stop()}, []);
  async function generateMessage(force=false){
    if(!chatKey)return;
    if(force)messageEdited.current=true;
    setAiBusy(true);
    if(force)setError(null);
    try{
      const recentMessages=findRecentMessageSnippets(5);
      const generated=await generateQuoteSendMessage(quote.id,{chatKey,version:selectedVersion,recentMessages});
      if(force||!messageEdited.current)setMessage(generated.text);
    }catch(reason){
      if(force)setError(`${errorMessage(reason)} Se conserva el mensaje editable por defecto.`);
      if(!message.trim())setMessage(fallbackMessage);
    }finally{setAiBusy(false)}
  }
  useEffect(()=>{const key=`${quote.id}:${selectedVersion}:${chatKey}`;if(autoGeneratedFor.current===key)return;autoGeneratedFor.current=key;void generateMessage(false)},[quote.id,selectedVersion,chatKey]);
  async function preparePdf() {
    setBusy(true);
    setError(null);
    try {
      const result = historical
        ?await generateVersionPdf(quote.id,selectedVersion,kind) as {reused?:boolean}
        :await generatePdf(quote.id, kind);
      setReady((current) => ({ ...current, [kind]: true }));
      setNotice(
        result.reused ? "PDF reutilizado y listo." : "PDF generado y listo.",
      );
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setBusy(false);
    }
  }
  async function prepareAndAttach() {
    if (!message.trim()) return setError("El mensaje no puede estar vacío.");
    setBusy(true);
    setError(null);
    setNotice(null);
    setReview(null);
    let closed=false;
    try {
      if (!ready[kind]){
        if(historical)await generateVersionPdf(quote.id,selectedVersion,kind);
        else await generatePdf(quote.id, kind);
      }
      const inserted = await insertMessageIntoComposer(message.trim());
      if (!inserted.ok)
        throw new Error(
          inserted.error ?? "No se pudo insertar el mensaje en WhatsApp.",
        );
      const filename = `${quote.visibleNumber}-V${quote.version?.version ?? quote.activeVersion}-${kind}.pdf`;
      const blob = await fetchBlob(historical?versionPdfDownloadPath(quote.id,selectedVersion,kind):pdfDownloadPath(quote.id, kind));
      if (
        !(await attachFileToComposer(
          new File([blob], filename, { type: "application/pdf" }),
        ))
      )
        throw new Error(
          "WhatsApp no pudo abrir el PDF. El mensaje quedó en el composer y no se envió.",
        );
      const attempt = await createSendAttempt(quote.id, {
        chatPhone: phone || null,
        chatName: name || null,
        message: message.trim(),
        pdfKind: kind,
        pdfName: filename,
        confidence,
        internalNote: note.trim() || null,
        version:selectedVersion,
      });
      setNotice("Mensaje y PDF listos. Revisalos y tocá Enviar en WhatsApp.");
      observation.current?.stop();
      observation.current = observeOutgoingMessage(
        phone || name,
        message.trim().slice(0, 180),
        45_000,
        (result) => {
          observation.current = null;
          void (async () => {
            if (result.confidence >= 70) {
              await resolveSendAttempt(quote.id, attempt.id, {
                status: "CONFIRMADO_AUTO",
                confidence: result.confidence,
              });
              setNotice("Envío detectado y confirmado.");
              setReview(null);
            } else {
              if (result.confidence > 0)
                await resolveSendAttempt(quote.id, attempt.id, {
                  status: "AMBIGUO",
                  confidence: result.confidence,
                  createDelivery: false,
                });
              setReview({ attemptId: attempt.id });
            }
            await onUpdated();
          })().catch((reason) => setError(errorMessage(reason)));
        },
        filename,
      );
      keepObservationAfterClose.current=true;
      closed=true;
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      if(!closed)setBusy(false);
    }
  }
  async function resolve(sent: boolean) {
    if (!review) return;
    setBusy(true);
    try {
      await resolveSendAttempt(quote.id, review.attemptId, {
        status: sent ? "CONFIRMADO_MANUAL" : "NO_ENVIADO",
        createDelivery: sent,
      });
      setReview(null);
      setNotice(
        sent
          ? "Envío confirmado manualmente."
          : "Intento marcado como no enviado.",
      );
      await onUpdated();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalShell
      title="Enviar presupuesto"
      subtitle={`${quote.visibleNumber} · V${quote.version?.version ?? quote.activeVersion}`}
      wide
      onClose={onClose}
      headerAction={
        <button type="button" className="tgs-btn ghost sm" onClick={onEdit}>
          ✏️ Editar presupuesto
        </button>
      }
      footer={
        <>
          <button className="tgs-btn ghost" onClick={onClose}>
            Cerrar
          </button>
          <button
            className="tgs-btn"
            disabled={busy||aiBusy}
            onClick={() => void prepareAndAttach()}
          >
            {busy ? "Preparando…" : "Preparar mensaje y PDF"}
          </button>
        </>
      }
    >
      <div className="tgs-stack">
        {error ? <Alert tone="bad">{error}</Alert> : null}
        {notice ? <Alert tone="ok">{notice}</Alert> : null}
        <Alert tone="info">
          Elegí la plantilla, revisá el mensaje y prepará el PDF. Nada se envía hasta que confirmes en WhatsApp.
        </Alert>
        <div className="tgs-grid-3">
          <Field label="Plantilla PDF">
            <select
              className="tgs-input"
              value={kind}
              onChange={(event) => setKind(event.target.value as PdfKind)}
            >
              <option value="SIMPLE">Simple</option>
              <option value="DETALLADO">Detallado</option>
            </select>
          </Field>
          <div className="tgs-row" style={{ alignItems: "end" }}>
            <button
              className="tgs-btn ghost"
              disabled={busy}
              onClick={() => void preparePdf()}
            >
              {ready[kind] ? "Regenerar PDF" : "Generar PDF"}
            </button>
          </div>
          <Field label="Nota interna">
            <input
              className="tgs-input"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Opcional"
            />
          </Field>
        </div>
        <Field label="Mensaje para el cliente">
          <div className="tgs-row" style={{justifyContent:"flex-end",marginBottom:6}}>
            <button type="button" className="tgs-btn ghost sm" disabled={busy||aiBusy} onClick={()=>void generateMessage(true)}>{aiBusy?"Generando…":"✨ Regenerar con IA"}</button>
          </div>
          <textarea
            className="tgs-input"
            rows={5}
            value={message}
            onChange={(event) => {messageEdited.current=true;setMessage(event.target.value)}}
          />
        </Field>
        <Alert tone="info">
          La extensión prepara el mensaje y adjunta el PDF. El botón Enviar
          siempre lo tocás vos.
        </Alert>
        {review ? (
          <Alert tone="warn">
            No pudimos confirmar el envío automáticamente.
            <div className="tgs-row" style={{ marginTop: 8 }}>
              <button
                className="tgs-btn sm"
                disabled={busy}
                onClick={() => void resolve(true)}
              >
                Sí, se envió
              </button>
              <button
                className="tgs-btn ghost sm"
                disabled={busy}
                onClick={() => void resolve(false)}
              >
                No se envió
              </button>
            </div>
          </Alert>
        ) : null}
      </div>
    </ModalShell>
  );
}

type ConfigTab =
  | "general"
  | "style"
  | "multi"
  | "products"
  | "quotes"
  | "responses"
  | "escalation"
  | "hours"
  | "recontact"
  | "advanced";
export function BotSettingsModal({
  initial,
  currentMode,
  simulationMode,
  autoRunning,
  onMode,
  onSimulation,
  onAutoRunning,
  onSaved,
  onClose,
}: {
  initial: ChatbotSettings;
  currentMode: ChatbotMode | null;
  simulationMode: boolean;
  autoRunning: boolean;
  onMode: (mode: ChatbotMode | null) => void;
  onSimulation: (value: boolean) => void;
  onAutoRunning: (value: boolean) => void;
  onSaved: (settings: ChatbotSettings) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [tab, setTab] = useState<ConfigTab>("general");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = <K extends keyof ChatbotSettings>(
    key: K,
    next: ChatbotSettings[K],
  ) => setValue((current) => ({ ...current, [key]: next }));
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { id: _id, updatedAt: _updatedAt, ...body } = value;
      const saved = await updateChatbotSettings(body);
      onSaved(saved);
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  const tabs = [
    { id: "general", label: "General" },
    { id: "style", label: "Estilo" },
    { id: "multi", label: "Multi-mensaje" },
    { id: "products", label: "Productos" },
    { id: "quotes", label: "Presupuestos" },
    { id: "responses", label: "Respuestas" },
    { id: "escalation", label: "Escalación" },
    { id: "hours", label: "Horarios" },
    { id: "recontact", label: "Recontactos" },
    { id: "advanced", label: "Avanzado" },
  ] as const;
  const checkbox = (
    checked: boolean,
    onChange: (v: boolean) => void,
    label: string,
  ) => (
    <label className="tgs-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
  return (
    <ModalShell
      title="Configuración TGS"
      subtitle="Bot, automatización y comportamiento del chat actual"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="tgs-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="tgs-btn"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Guardando…" : "Guardar configuración"}
          </button>
        </>
      }
    >
      <div className="tgs-stack">
        {error ? <Alert tone="bad">{error}</Alert> : null}
        <div className="tgs-grid-3">
          <Field label="Modo del chat">
            <select
              className="tgs-input"
              value={currentMode ?? "INHERIT"}
              onChange={(e) =>
                onMode(
                  e.target.value === "INHERIT"
                    ? null
                    : (e.target.value as ChatbotMode),
                )
              }
            >
              <option value="INHERIT">Heredar global</option>
              <option value="AUTO">Automático</option>
              <option value="SUGGEST">Solo sugerir</option>
              <option value="OFF">Apagado</option>
            </select>
          </Field>
          {checkbox(simulationMode, onSimulation, "Automático de prueba")}
          {checkbox(autoRunning, onAutoRunning, "Barrido activo")}
        </div>
        <Tabs tabs={[...tabs]} active={tab} onChange={setTab} />
        {tab === "general" ? (
          <>
            <div className="tgs-grid-3">
              {checkbox(
                value.enabled,
                (v) => patch("enabled", v),
                "Bot encendido",
              )}
              <Field label="Modo global">
                <select
                  className="tgs-input"
                  value={value.defaultMode}
                  onChange={(e) =>
                    patch("defaultMode", e.target.value as ChatbotMode)
                  }
                >
                  <option value="OFF">Apagado</option>
                  <option value="SUGGEST">Sugerir</option>
                  <option value="AUTO">Automático</option>
                </select>
              </Field>
              <Field label="Modelo">
                <input
                  className="tgs-input"
                  value={value.model ?? ""}
                  onChange={(e) => patch("model", e.target.value || null)}
                  placeholder="Heredar global"
                />
              </Field>
            </div>
            <Field label="Persona">
              <textarea
                className="tgs-input"
                rows={8}
                value={value.persona}
                onChange={(e) => patch("persona", e.target.value)}
              />
            </Field>
          </>
        ) : null}
        {tab === "style" ? (
          <>
            <div className="tgs-grid-3">
              <Field label="Largo">
                <select
                  className="tgs-input"
                  value={value.responseStyle.length}
                  onChange={(e) =>
                    patch("responseStyle", {
                      ...value.responseStyle,
                      length: e.target
                        .value as typeof value.responseStyle.length,
                    })
                  }
                >
                  <option value="SHORT">Breve</option>
                  <option value="MEDIUM">Medio</option>
                  <option value="DETAILED">Detallado</option>
                </select>
              </Field>
              <Field label="Emojis">
                <select
                  className="tgs-input"
                  value={value.responseStyle.emoji}
                  onChange={(e) =>
                    patch("responseStyle", {
                      ...value.responseStyle,
                      emoji: e.target.value as typeof value.responseStyle.emoji,
                    })
                  }
                >
                  <option value="NONE">Ninguno</option>
                  <option value="SPARING">Ocasionales</option>
                  <option value="NATURAL">Naturales</option>
                </select>
              </Field>
              <Field label="Párrafos">
                <select
                  className="tgs-input"
                  value={value.responseStyle.paragraphs}
                  onChange={(e) =>
                    patch("responseStyle", {
                      ...value.responseStyle,
                      paragraphs: e.target
                        .value as typeof value.responseStyle.paragraphs,
                    })
                  }
                >
                  <option value="COMPACT">Compacto</option>
                  <option value="SHORT">Cortos</option>
                  <option value="FREE">Libre</option>
                </select>
              </Field>
              <Field label="Máximo de caracteres">
                <input
                  className="tgs-input"
                  type="number"
                  min={80}
                  max={4000}
                  value={value.responseStyle.maxCharacters}
                  onChange={(e) =>
                    patch("responseStyle", {
                      ...value.responseStyle,
                      maxCharacters: Number(e.target.value),
                    })
                  }
                />
              </Field>
              {checkbox(
                value.responseStyle.avoidRepetition,
                (v) =>
                  patch("responseStyle", {
                    ...value.responseStyle,
                    avoidRepetition: v,
                  }),
                "Evitar repetición literal",
              )}
            </div>
          </>
        ) : null}
        {tab === "multi" ? (
          <>
            <div className="tgs-grid-3">
              {checkbox(
                value.multiMessage.enabled,
                (v) =>
                  patch("multiMessage", { ...value.multiMessage, enabled: v }),
                "Mensajes múltiples",
              )}
              <Field label="División">
                <select
                  className="tgs-input"
                  value={value.multiMessage.splitMode}
                  onChange={(e) =>
                    patch("multiMessage", {
                      ...value.multiMessage,
                      splitMode: e.target
                        .value as typeof value.multiMessage.splitMode,
                    })
                  }
                >
                  <option value="AI_NATURAL">IA natural</option>
                  <option value="AI_PLUS_FIXED">IA + fijos</option>
                  <option value="FIXED_ONLY">Sólo fijos</option>
                </select>
              </Field>
              <Field label="Máximo de burbujas">
                <input
                  className="tgs-input"
                  type="number"
                  min={1}
                  max={5}
                  value={value.multiMessage.maxBubbles}
                  onChange={(e) =>
                    patch("multiMessage", {
                      ...value.multiMessage,
                      maxBubbles: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Modo sugerencia">
                <select
                  className="tgs-input"
                  value={value.multiMessage.draftMode}
                  onChange={(e) =>
                    patch("multiMessage", {
                      ...value.multiMessage,
                      draftMode: e.target
                        .value as typeof value.multiMessage.draftMode,
                    })
                  }
                >
                  <option value="QUEUE">Cola recomendada</option>
                  <option value="JOINED">Todo junto</option>
                  <option value="FIRST_ONLY">Sólo primera</option>
                </select>
              </Field>
              <Field label="Demora mínima">
                <input
                  className="tgs-input"
                  type="number"
                  value={value.multiMessage.betweenDelayMinSeconds}
                  onChange={(e) =>
                    patch("multiMessage", {
                      ...value.multiMessage,
                      betweenDelayMinSeconds: Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Demora máxima">
                <input
                  className="tgs-input"
                  type="number"
                  value={value.multiMessage.betweenDelayMaxSeconds}
                  onChange={(e) =>
                    patch("multiMessage", {
                      ...value.multiMessage,
                      betweenDelayMaxSeconds: Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Apertura fija">
              <textarea
                className="tgs-input"
                value={value.multiMessage.openingMessage}
                onChange={(e) =>
                  patch("multiMessage", {
                    ...value.multiMessage,
                    openingMessage: e.target.value,
                  })
                }
              />
            </Field>
            <Field label="Cierre fijo">
              <textarea
                className="tgs-input"
                value={value.multiMessage.closingMessage}
                onChange={(e) =>
                  patch("multiMessage", {
                    ...value.multiMessage,
                    closingMessage: e.target.value,
                  })
                }
              />
            </Field>
            {checkbox(
              value.multiMessage.quoteFollowup.enabled,
              (v) =>
                patch("multiMessage", {
                  ...value.multiMessage,
                  quoteFollowup: {
                    ...value.multiMessage.quoteFollowup,
                    enabled: v,
                  },
                }),
              "Seguimiento después del PDF",
            )}
            <Field label="Mensaje posterior">
              <textarea
                className="tgs-input"
                value={value.multiMessage.quoteFollowup.message}
                onChange={(e) =>
                  patch("multiMessage", {
                    ...value.multiMessage,
                    quoteFollowup: {
                      ...value.multiMessage.quoteFollowup,
                      message: e.target.value,
                    },
                  })
                }
              />
            </Field>
          </>
        ) : null}
        {tab === "products" ? (
          <>
            <Alert tone="info">
              Esta línea se inserta como mensaje separado después de que el vendedor manda la foto.
            </Alert>
            <Field label="Introducción para productos">
              <input
                className="tgs-input"
                maxLength={500}
                value={value.productMessageIntro}
                onChange={(event) => patch("productMessageIntro", event.target.value)}
                placeholder="Este sería el producto 👇"
              />
            </Field>
          </>
        ) : null}
        {tab === "quotes" ? (
          <>
            <Alert tone="info">Esta instrucción guía el mensaje editable que acompaña cada PDF de presupuesto.</Alert>
            <Field label="Prompt para enviar presupuestos">
              <textarea className="tgs-input" rows={8} maxLength={5000} value={value.quoteSendPrompt} onChange={event=>patch("quoteSendPrompt",event.target.value)}/>
            </Field>
          </>
        ) : null}
        {tab === "responses" ? (
          <>
            <Field label="Reutilizar desde similitud (%)">
              <input
                className="tgs-input"
                type="number"
                min={0}
                max={100}
                value={value.reuseSimilarityThreshold}
                onChange={(e) =>
                  patch("reuseSimilarityThreshold", Number(e.target.value))
                }
              />
            </Field>
            {value.responses.map((response, index) => (
              <ResponseEditor
                key={response.id}
                response={response}
                index={index}
                onChange={(next) =>
                  patch(
                    "responses",
                    value.responses.map((item) =>
                      item.id === response.id ? next : item,
                    ),
                  )
                }
                onDelete={() =>
                  patch(
                    "responses",
                    value.responses.filter((item) => item.id !== response.id),
                  )
                }
              />
            ))}
            <button
              className="tgs-btn ghost"
              onClick={() =>
                patch("responses", [
                  ...value.responses,
                  {
                    id: crypto.randomUUID(),
                    enabled: true,
                    activators: [],
                    similarityThreshold: 90,
                    answer: "",
                    context: "",
                    attachments: { imageUrl: null, url: null, quote: null },
                  },
                ])
              }
            >
              + Respuesta
            </button>
          </>
        ) : null}
        {tab === "escalation" ? (
          <>
            {checkbox(
              value.modelCanEscalate,
              (v) => patch("modelCanEscalate", v),
              "El modelo puede escalar",
            )}
            <Field label="Palabras clave (una por línea)">
              <textarea
                className="tgs-input"
                rows={5}
                value={value.escalationKeywords.join("\n")}
                onChange={(e) =>
                  patch("escalationKeywords", lines(e.target.value))
                }
              />
            </Field>
            <Field label="Instrucciones">
              <textarea
                className="tgs-input"
                rows={7}
                value={value.escalationInstructions}
                onChange={(e) =>
                  patch("escalationInstructions", e.target.value)
                }
              />
            </Field>
          </>
        ) : null}
        {tab === "hours" ? (
          <>
            {checkbox(
              value.businessHours.enabled,
              (v) =>
                patch("businessHours", { ...value.businessHours, enabled: v }),
              "Respetar horarios",
            )}
            <Field label="Zona horaria">
              <input
                className="tgs-input"
                value={value.businessHours.timezone}
                onChange={(e) =>
                  patch("businessHours", {
                    ...value.businessHours,
                    timezone: e.target.value,
                  })
                }
              />
            </Field>
            <ScheduleEditor settings={value} onChange={patch} />
            <Field label="Fuera de horario">
              <select
                className="tgs-input"
                value={value.outsideHoursBehavior.mode}
                onChange={(e) =>
                  patch("outsideHoursBehavior", {
                    ...value.outsideHoursBehavior,
                    mode: e.target
                      .value as typeof value.outsideHoursBehavior.mode,
                  })
                }
              >
                <option value="OFF">No responder</option>
                <option value="STALL">Mensaje de espera</option>
                <option value="NORMAL">Normal</option>
              </select>
            </Field>
            <Field label="Mensaje">
              <textarea
                className="tgs-input"
                value={value.outsideHoursBehavior.message}
                onChange={(e) =>
                  patch("outsideHoursBehavior", {
                    ...value.outsideHoursBehavior,
                    message: e.target.value,
                  })
                }
              />
            </Field>
          </>
        ) : null}
        {tab === "recontact" ? (
          <>
            <div className="tgs-grid-3">
              {checkbox(
                value.recontactEnabled,
                (v) => patch("recontactEnabled", v),
                "Recontactos activos",
              )}
              <Field label="Días">
                <input
                  className="tgs-input"
                  type="number"
                  min={1}
                  max={365}
                  value={value.recontactDays}
                  onChange={(e) =>
                    patch("recontactDays", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Máximo de intentos">
                <input
                  className="tgs-input"
                  type="number"
                  min={0}
                  max={10}
                  value={value.recontactMaxAttempts}
                  onChange={(e) =>
                    patch("recontactMaxAttempts", Number(e.target.value))
                  }
                />
              </Field>
            </div>
            <Field label="Prompt">
              <textarea
                className="tgs-input"
                rows={8}
                value={value.recontactPrompt}
                onChange={(e) => patch("recontactPrompt", e.target.value)}
              />
            </Field>
          </>
        ) : null}
        {tab === "advanced" ? (
          <>
            <div className="tgs-grid-3">
              <Field label="Escaneo (s)">
                <input
                  className="tgs-input"
                  type="number"
                  value={value.scanIntervalSeconds}
                  onChange={(e) =>
                    patch("scanIntervalSeconds", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Demora AUTO (s)">
                <input
                  className="tgs-input"
                  type="number"
                  value={value.autoDelayMaxSeconds}
                  onChange={(e) =>
                    patch("autoDelayMaxSeconds", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Mensajes de contexto">
                <input
                  className="tgs-input"
                  type="number"
                  value={value.maxRecentSnippets}
                  onChange={(e) =>
                    patch("maxRecentSnippets", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Confirmación envío (ms)">
                <input
                  className="tgs-input"
                  type="number"
                  value={value.sendConfirmationTimeoutMs}
                  onChange={(e) =>
                    patch("sendConfirmationTimeoutMs", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Actualizar memoria cada">
                <input
                  className="tgs-input"
                  type="number"
                  value={value.summaryRefreshEvery}
                  onChange={(e) =>
                    patch("summaryRefreshEvery", Number(e.target.value))
                  }
                />
              </Field>
            </div>
            <Field label="Mensajes automáticos ignorados (uno por línea)">
              <textarea
                className="tgs-input"
                rows={6}
                value={value.ignoredAutoMessages.join("\n")}
                onChange={(e) =>
                  patch("ignoredAutoMessages", lines(e.target.value))
                }
              />
            </Field>
          </>
        ) : null}
      </div>
    </ModalShell>
  );
}

function ResponseEditor({
  response,
  index,
  onChange,
  onDelete,
}: {
  response: ChatbotResponseEntry;
  index: number;
  onChange: (next: ChatbotResponseEntry) => void;
  onDelete: () => void;
}) {
  return (
    <div className="tgs-list-item tgs-stack">
      <div className="tgs-row between">
        <b>Respuesta #{index + 1}</b>
        <button className="tgs-btn danger sm" onClick={onDelete}>
          Eliminar
        </button>
      </div>
      <label className="tgs-row">
        <input
          type="checkbox"
          checked={response.enabled}
          onChange={(e) => onChange({ ...response, enabled: e.target.checked })}
        />
        Activa
      </label>
      <Field label="Activadores (uno por línea)">
        <textarea
          className="tgs-input"
          value={response.activators.join("\n")}
          onChange={(e) =>
            onChange({ ...response, activators: lines(e.target.value) })
          }
        />
      </Field>
      <Field label={`Similitud ${response.similarityThreshold}%`}>
        <input
          type="range"
          min={0}
          max={100}
          value={response.similarityThreshold}
          onChange={(e) =>
            onChange({
              ...response,
              similarityThreshold: Number(e.target.value),
            })
          }
        />
      </Field>
      <Field label="Respuesta">
        <textarea
          className="tgs-input"
          rows={4}
          value={response.answer}
          onChange={(e) => onChange({ ...response, answer: e.target.value })}
        />
      </Field>
      <Field label="Contexto">
        <textarea
          className="tgs-input"
          value={response.context}
          onChange={(e) => onChange({ ...response, context: e.target.value })}
        />
      </Field>
    </div>
  );
}

function ScheduleEditor({
  settings,
  onChange,
}: {
  settings: ChatbotSettings;
  onChange: <K extends keyof ChatbotSettings>(
    key: K,
    value: ChatbotSettings[K],
  ) => void;
}) {
  const days = [
    ["monday", "Lunes"],
    ["tuesday", "Martes"],
    ["wednesday", "Miércoles"],
    ["thursday", "Jueves"],
    ["friday", "Viernes"],
    ["saturday", "Sábado"],
    ["sunday", "Domingo"],
  ] as const;
  return (
    <div className="tgs-list">
      {days.map(([key, label]) => {
        const slot = settings.businessHours.schedule[key][0] ?? {
          from: "09:00",
          to: "18:00",
        };
        return (
          <div className="tgs-row between" key={key}>
            <b>{label}</b>
            <div className="tgs-row">
              <input
                className="tgs-input"
                type="time"
                value={slot.from}
                onChange={(e) =>
                  onChange("businessHours", {
                    ...settings.businessHours,
                    schedule: {
                      ...settings.businessHours.schedule,
                      [key]: [{ ...slot, from: e.target.value }],
                    },
                  })
                }
              />
              <input
                className="tgs-input"
                type="time"
                value={slot.to}
                onChange={(e) =>
                  onChange("businessHours", {
                    ...settings.businessHours,
                    schedule: {
                      ...settings.businessHours.schedule,
                      [key]: [{ ...slot, to: e.target.value }],
                    },
                  })
                }
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
