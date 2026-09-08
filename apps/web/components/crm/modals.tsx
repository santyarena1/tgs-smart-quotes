"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  changeCrmQuoteState,
  createCrmCustomer,
  createCrmQuickRequest,
  createCustomerQuick,
  crmProductImagePath,
  generateCrmVersionPdf,
  generateQuoteSendMessage,
  getCrmTimeline,
  getStoreSearchUrl,
  listCrmCollections,
  searchCrmProducts,
  searchCrmQuotes,
  sendWhatsappProduct,
  sendWhatsappQuote,
  updateCrmRequest,
  type CrmCatalogProduct,
} from "../../lib/api";
import { formatArs } from "../../lib/money";
import type { Collection, Quote, TimelineEvent } from "../../lib/types";
import { Alert, EmptyState, Loading, Modal, errorMessage } from "../shared";

/** Devuelve el presupuesto "posicionado" en una versión concreta. */
export function quoteAtVersion(quote: Quote, versionNumber: number): Quote {
  const version = quote.versions?.find((item) => item.version === versionNumber) ?? quote.version;
  return { ...quote, version, items: version?.items ?? quote.items };
}

export function quoteItemsPreview(quote: Quote): string {
  const source = quote.version?.items?.length ? quote.version.items : quote.items ?? [];
  const names = source.map((item) => item.frozenName ?? item.name ?? "").filter(Boolean);
  return names.length
    ? `${names.slice(0, 4).join(" · ")}${names.length > 4 ? " · …" : ""}`
    : "Sin componentes cargados";
}

// ---------------------------------------------------------------- solicitud rápida

/**
 * Crea una solicitud sin salir de la conversación.
 * Si el cliente no existe todavía, se crea a partir del teléfono del chat.
 */
export function QuickRequestModal({
  open,
  chatKey,
  phone,
  name,
  onClose,
  onCreated,
}: {
  open: boolean;
  chatKey: string;
  phone: string;
  name: string;
  onClose: () => void;
  onCreated: (title: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(name ? `Consulta de ${name}` : "");
      setText("");
      setError(null);
    }
  }, [open, name]);

  async function submit() {
    if (!title.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const request = await createCrmQuickRequest({
        title: title.trim(),
        originalText: text.trim(),
        detectedPhone: phone || null,
      });
      if (phone) {
        const customer = name
          ? await createCrmCustomer({ name, phone, dni: null }).catch(() => null)
          : await createCustomerQuick(phone).catch(() => null);
        if (customer) await updateCrmRequest(request.id, { customerId: customer.id }).catch(() => undefined);
      }
      onCreated(request.title);
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Solicitud rápida"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-dark" disabled={busy} onClick={() => void submit()}>
            {busy ? "Creando…" : "Crear solicitud"}
          </button>
        </>
      }
    >
      <div className="crm-modal-stack">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <label>
          <span>Título</span>
          <input className="crm-input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          <span>Descripción del pedido</span>
          <textarea
            className="crm-textarea"
            rows={5}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Qué necesita el cliente, preferencias y presupuesto…"
          />
        </label>
        <p className="crm-hint">
          {phone
            ? "Si hace falta, se crea el cliente automáticamente con el teléfono del chat."
            : "No hay teléfono en el chat: la solicitud se crea sin cliente."}
        </p>
        <p className="crm-hint">Chat: {chatKey.replace(/^tel:/, "+")}</p>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------- buscar presupuesto

export function QuoteSearchModal({
  open,
  phone,
  customerId,
  onClose,
  onPick,
}: {
  open: boolean;
  phone: string;
  customerId?: string | null;
  onClose: () => void;
  onPick: (quote: Quote, version: number) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Quote[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setItems([]);
    setSearched(false);
    void listCrmCollections()
      .then((all) => setCollections(all.filter((item) => !item.archived).slice(0, 8)))
      .catch(() => setCollections([]));
  }, [open]);

  useEffect(() => {
    if (!open || !q.trim()) return;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void searchCrmQuotes({ q: q.trim(), phone: phone || undefined, customerId: customerId || undefined })
        .then((result) => {
          setItems(result.items);
          setSearched(true);
        })
        .catch((reason) => setError(errorMessage(reason)))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, q, phone, customerId]);

  return (
    <Modal open={open} title="Buscar presupuesto" wide onClose={onClose}
      footer={<button type="button" className="btn-ghost" onClick={onClose}>Cerrar</button>}>
      <div className="crm-modal-stack">
        <input
          autoFocus
          className="crm-input"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Número, cliente, producto o descripción…"
          aria-label="Buscar presupuesto"
        />
        {error ? <Alert tone="error">{error}</Alert> : null}
        {loading ? (
          <Loading label="Buscando…" />
        ) : items.length ? (
          <div className="crm-modal-list">
            {items.map((quote) => (
              <QuoteResultCard key={quote.id} quote={quote} onPick={onPick} />
            ))}
          </div>
        ) : searched ? (
          <EmptyState icon="⌕">No encontramos presupuestos.</EmptyState>
        ) : (
          <>
            <p className="crm-hint">Escribí para buscar, o entrá por una colección.</p>
            <div className="crm-chip-row">
              {collections.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  className="crm-filter"
                  onClick={() => setQ(collection.name)}
                >
                  {collection.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function QuoteResultCard({ quote, onPick }: { quote: Quote; onPick: (quote: Quote, version: number) => void }) {
  const initial = quote.version?.version ?? quote.activeVersion;
  const [version, setVersion] = useState(initial);
  const selected = quoteAtVersion(quote, version);
  const versions = quote.versions?.length
    ? quote.versions
    : quote.version
      ? [quote.version]
      : [];

  return (
    <article className="crm-quote-card">
      <div className="crm-quote-card-head">
        <strong>{quote.visibleNumber}</strong>
        <span className="crm-hint">{quote.internalName}</span>
        <span className="crm-tag">{selected.version?.state ?? "—"}</span>
      </div>
      <div className="crm-quote-card-row">
        <select
          className="crm-select"
          value={version}
          onChange={(event) => setVersion(Number(event.target.value))}
          aria-label="Versión"
        >
          {versions.map((item) => (
            <option key={item.id} value={item.version}>V{item.version} · {item.state}</option>
          ))}
        </select>
        <span className="crm-hint">{quote.customer?.name ?? "Sin cliente"}</span>
        <strong>{formatArs(selected.version?.totalSaleCents)}</strong>
      </div>
      <p className="crm-hint" title={quoteItemsPreview(selected)}>{quoteItemsPreview(selected)}</p>
      <button type="button" className="btn-dark btn-sm" onClick={() => onPick(quote, version)}>
        Usar esta versión
      </button>
    </article>
  );
}

// ------------------------------------------------------------------ enviar presupuesto

/**
 * Envía un presupuesto por WhatsApp: mensaje de presentación + PDF.
 *
 * El mensaje lo redacta la IA leyendo la conversación (mismo endpoint que usaba la
 * extensión), y se puede editar antes de mandar. El PDF se genera acá y el envío
 * queda a cargo de la cola.
 */
export function SendQuoteModal({
  open,
  quote,
  version,
  chatKey,
  onClose,
  onSent,
}: {
  open: boolean;
  quote: Quote | null;
  version: number;
  chatKey: string;
  onClose: () => void;
  onSent: (visibleNumber: string) => void;
}) {
  const [kind, setKind] = useState<"SIMPLE" | "DETALLADO">("SIMPLE");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generatedFor = useRef("");

  const fallback = useMemo(() => {
    if (!quote) return "";
    return `¡Hola! Te comparto el presupuesto ${quote.visibleNumber} por un total de ${formatArs(quote.version?.totalSaleCents)}. Cualquier consulta quedo a disposición.`;
  }, [quote]);

  useEffect(() => {
    if (!open || !quote) return;
    const key = `${quote.id}:${version}:${chatKey}`;
    if (generatedFor.current === key) return;
    generatedFor.current = key;
    setMessage(fallback);
    setError(null);
    setAiBusy(true);
    void generateQuoteSendMessage(quote.id, { chatKey, version, recentMessages: [] })
      .then((result) => setMessage(result.text))
      // Si la IA falla, queda el mensaje por defecto editable: nunca se bloquea el envío.
      .catch(() => undefined)
      .finally(() => setAiBusy(false));
  }, [open, quote, version, chatKey, fallback]);

  async function submit() {
    if (!quote || !message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await generateCrmVersionPdf(quote.id, version, kind);
      const result = await sendWhatsappQuote(chatKey, {
        familyId: quote.id,
        version,
        kind,
        message: message.trim(),
      });
      onSent(result.visibleNumber);
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open && Boolean(quote)}
      title={quote ? `Enviar ${quote.visibleNumber} V${version}` : "Enviar presupuesto"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-dark" disabled={busy || !message.trim()} onClick={() => void submit()}>
            {busy ? "Enviando…" : "Generar PDF y enviar"}
          </button>
        </>
      }
    >
      <div className="crm-modal-stack">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <label>
          <span>Tipo de PDF</span>
          <select className="crm-select" value={kind} onChange={(event) => setKind(event.target.value as "SIMPLE" | "DETALLADO")}>
            <option value="SIMPLE">Simple</option>
            <option value="DETALLADO">Detallado</option>
          </select>
        </label>
        <label>
          <span>Mensaje que acompaña al PDF {aiBusy ? "· redactando con IA…" : ""}</span>
          <textarea
            className="crm-textarea"
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <p className="crm-hint">
          Se manda primero el mensaje y después el PDF, con una pausa corta entre los dos.
        </p>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------------ producto

export function ProductSearchModal({
  open,
  chatKey,
  onClose,
  onSent,
}: {
  open: boolean;
  chatKey: string;
  onClose: () => void;
  onSent: (title: string) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CrmCatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setQ(""); setItems([]); setError(null); }
  }, [open]);

  useEffect(() => {
    const query = q.trim();
    if (!open || query.length < 2) { setItems([]); return; }
    const timer = window.setTimeout(() => {
      setLoading(true);
      void searchCrmProducts(query)
        .then((result) => setItems(result.items))
        .catch((reason) => setError(errorMessage(reason)))
        .finally(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [open, q]);

  async function send(product: CrmCatalogProduct) {
    setSending(product.mpn);
    setError(null);
    try {
      const price = product.salePriceCents ?? product.priceCents;
      const text = `${product.title}\n${formatArs(price)}`;
      await sendWhatsappProduct(chatKey, { mpn: product.mpn, text });
      onSent(product.title);
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSending(null);
    }
  }

  return (
    <Modal open={open} title="Enviar un producto" wide onClose={onClose}
      footer={<button type="button" className="btn-ghost" onClick={onClose}>Cerrar</button>}>
      <div className="crm-modal-stack">
        <input
          autoFocus
          className="crm-input"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Buscar en el catálogo…"
          aria-label="Buscar producto"
        />
        {error ? <Alert tone="error">{error}</Alert> : null}
        {loading ? (
          <Loading label="Buscando…" />
        ) : items.length ? (
          <div className="crm-product-grid">
            {items.map((product) => (
              <article key={product.mpn} className="crm-product-card">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={crmProductImagePath(product.mpn)} alt={product.title} loading="lazy" />
                ) : (
                  <div className="crm-product-noimg">sin foto</div>
                )}
                <div className="crm-product-body">
                  <p className="crm-product-title">{product.title}</p>
                  <strong>{formatArs(product.salePriceCents ?? product.priceCents)}</strong>
                  <span className="crm-hint">
                    {product.stockQuantity > 0 ? `${product.stockQuantity} en stock` : "Sin stock"}
                  </span>
                  <button
                    type="button"
                    className="btn-dark btn-sm"
                    disabled={sending === product.mpn}
                    onClick={() => void send(product)}
                  >
                    {sending === product.mpn ? "Enviando…" : "Enviar"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : q.trim().length >= 2 ? (
          <EmptyState icon="⌕">No encontramos productos.</EmptyState>
        ) : (
          <p className="crm-hint">Escribí al menos dos letras para buscar.</p>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------- buscar web

export function WebSearchModal({
  open,
  onClose,
  onLink,
}: {
  open: boolean;
  onClose: () => void;
  onLink: (url: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setQuery(""); setError(null); }
  }, [open]);

  async function insert() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await getStoreSearchUrl(query.trim());
      onLink(result.url);
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Buscar en la tienda"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-dark" disabled={busy || !query.trim()} onClick={() => void insert()}>
            {busy ? "Preparando…" : "Poner el enlace en el mensaje"}
          </button>
        </>
      }
    >
      <div className="crm-modal-stack">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <label>
          <span>Qué querés buscar</span>
          <input
            autoFocus
            className="crm-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void insert(); }}
            placeholder="Ej. silla nexus"
          />
        </label>
        <p className="crm-hint">
          El enlace queda escrito en el cuadro de mensaje. No se envía solo: lo revisás y mandás vos.
        </p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------- historial

export function TimelineModal({
  open,
  quote,
  onClose,
}: {
  open: boolean;
  quote: Quote | null;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [filter, setFilter] = useState("TODOS");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !quote) return;
    setLoading(true);
    setFilter("TODOS");
    void getCrmTimeline(quote.id)
      .then((result) => setEvents(result.events))
      .catch((reason) => setError(errorMessage(reason)))
      .finally(() => setLoading(false));
  }, [open, quote]);

  const types = ["TODOS", ...Array.from(new Set(events.map((event) => event.type)))];
  const visible = events.filter((event) => filter === "TODOS" || event.type === filter).slice().reverse();

  return (
    <Modal
      open={open && Boolean(quote)}
      title={quote ? `Historial de ${quote.visibleNumber}` : "Historial"}
      wide
      onClose={onClose}
      footer={<button type="button" className="btn-ghost" onClick={onClose}>Cerrar</button>}
    >
      <div className="crm-modal-stack">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <select className="crm-select" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrar eventos">
          {types.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
        </select>
        {loading ? (
          <Loading label="Cargando historial…" />
        ) : visible.length === 0 ? (
          <EmptyState icon="◷">No hay eventos para este filtro.</EmptyState>
        ) : (
          <div className="crm-modal-list">
            {visible.map((event) => (
              <div key={event.id} className="crm-timeline-item">
                <strong>{event.description ?? event.type.replaceAll("_", " ")}</strong>
                {event.descriptions?.slice(1).map((line) => <div key={line} className="crm-hint">{line}</div>)}
                <div className="crm-hint">
                  {new Date(event.createdAt).toLocaleString("es-AR")}
                  {event.creator ? ` · ${event.creator.displayName || event.creator.username}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------- cambiar de estado

export async function approveQuote(quote: Quote): Promise<Quote> {
  return changeCrmQuoteState(quote.id, "ACEPTADO");
}
