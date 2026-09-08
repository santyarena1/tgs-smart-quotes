"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  assignWhatsappConversation,
  dismissWhatsappSuggestion,
  getWhatsappConversation,
  listWhatsappConversations,
  listWhatsappMessages,
  listWhatsappTemplates,
  markWhatsappRead,
  sendWhatsappMessage,
  sendWhatsappRecontact,
  sendWhatsappSuggestion,
  type WhatsappConversation,
  type WhatsappConversationFilter,
  type WhatsappMessage,
  type WhatsappTemplate,
} from "../../lib/api";
import { Alert, errorMessage } from "../shared";
import { ConversationList } from "./ConversationList";
import { ConversationThread } from "./ConversationThread";
import { Composer } from "./Composer";
import { ContextPanel } from "./ContextPanel";
import { SuggestionCard } from "./SuggestionCard";
import { CrmToolbar } from "./CrmToolbar";
import { QuoteBar } from "./QuoteBar";
import {
  ProductSearchModal,
  QuickRequestModal,
  QuoteSearchModal,
  SendQuoteModal,
  TimelineModal,
  WebSearchModal,
} from "./modals";
import { getConversationQuote, getCrmQuote, requestWhatsappSuggestion } from "../../lib/api";
import type { Quote } from "../../lib/types";

/**
 * Bandeja del CRM.
 *
 * Refresca la lista cada 10 s. No es tiempo real: los mensajes llegan por el webhook
 * al servidor y esta vista los descubre en el siguiente ciclo. Es un compromiso
 * deliberado frente a montar websockets, y muy por debajo de los 8 s de escaneo que
 * usaba la extensión.
 */
const REFRESH_MS = 10_000;

const FILTERS: { id: WhatsappConversationFilter; label: string }[] = [
  { id: "TODAS", label: "Todas" },
  { id: "NO_LEIDAS", label: "Sin leer" },
  { id: "ESCALADAS", label: "Escaladas" },
  { id: "MIAS", label: "Mías" },
  { id: "VENTANA_ABIERTA", label: "Ventana abierta" },
];

export function CrmInbox() {
  const [conversations, setConversations] = useState<WhatsappConversation[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<WhatsappConversation | null>(null);
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [filter, setFilter] = useState<WhatsappConversationFilter>("TODAS");
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteVersion, setQuoteVersion] = useState(1);
  const [suggesting, setSuggesting] = useState(false);
  const [draft, setDraft] = useState("");
  const [quickRequestOpen, setQuickRequestOpen] = useState(false);
  const [quoteSearchOpen, setQuoteSearchOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [webSearchOpen, setWebSearchOpen] = useState(false);
  const [sendQuoteOpen, setSendQuoteOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const selectedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);

  const loadConversations = useCallback(async (quiet = false) => {
    if (!quiet) setListLoading(true);
    try {
      const result = await listWhatsappConversations({ filter, q: search.trim() || undefined, limit: 60 });
      setConversations(result.items);
      setError(null);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      if (!quiet) setListLoading(false);
    }
  }, [filter, search]);

  const loadThread = useCallback(async (chatKey: string, quiet = false) => {
    if (!quiet) setThreadLoading(true);
    try {
      const [conversation, history] = await Promise.all([
        getWhatsappConversation(chatKey),
        listWhatsappMessages(chatKey, { limit: 80 }),
      ]);
      // Una respuesta que llega tarde no debe pisar el chat que el operador ya abrió.
      if (selectedKeyRef.current !== chatKey) return;
      setSelected(conversation);
      setMessages(history.items);
      setError(null);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      if (!quiet) setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    void listWhatsappTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    if (!selectedKey) {
      setSelected(null);
      setMessages([]);
      return;
    }
    void loadThread(selectedKey);
    void markWhatsappRead(selectedKey)
      .then(() => setConversations((current) =>
        current.map((item) => (item.chatKey === selectedKey ? { ...item, unreadCount: 0 } : item))))
      .catch(() => undefined);
  }, [selectedKey, loadThread]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadConversations(true);
      if (selectedKeyRef.current) void loadThread(selectedKeyRef.current, true);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadConversations, loadThread]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, item) => sum + item.unreadCount, 0),
    [conversations],
  );

  async function handleSend(body: Parameters<typeof sendWhatsappMessage>[1]) {
    if (!selectedKey) return;
    await sendWhatsappMessage(selectedKey, body);
    setNotice("Mensaje encolado. Sale en unos segundos.");
    // La cola envía de forma asincrónica: se recarga enseguida y el refresco periódico
    // termina de reflejar el estado real de entrega.
    await loadThread(selectedKey, true);
    await loadConversations(true);
  }

  async function handleRecontact(templateId: string, variables: string[]) {
    if (!selectedKey) return;
    const result = await sendWhatsappRecontact(selectedKey, templateId, variables);
    setNotice(`Recontacto encolado con la plantilla "${result.template}".`);
    await loadThread(selectedKey, true);
    await loadConversations(true);
  }

  async function handleAssign(userId: string | null) {
    if (!selectedKey) return;
    await assignWhatsappConversation(selectedKey, userId);
    await loadThread(selectedKey, true);
    await loadConversations(true);
  }

  async function handleSuggestionSend(logId: string, text: string) {
    await sendWhatsappSuggestion(logId, text);
    setNotice("Sugerencia aprobada y encolada.");
    if (selectedKey) await loadThread(selectedKey, true);
  }

  async function handleSuggestionDismiss(logId: string) {
    await dismissWhatsappSuggestion(logId);
    setNotice("Sugerencia descartada.");
    if (selectedKey) await loadThread(selectedKey, true);
  }

  // Solo la última sugerencia sin resolver es accionable: las anteriores quedaron
  // superadas por mensajes posteriores y aprobarlas contestaría fuera de contexto.
  const pendingSuggestion = useMemo(() => {
    const last = messages[messages.length - 1];
    return last && last.direction === "OUTBOUND" && last.status === "SUGGESTED" ? last : null;
  }, [messages]);

  const loadQuote = useCallback(async (chatKey: string) => {
    try {
      const associated = await getConversationQuote(chatKey);
      if (selectedKeyRef.current !== chatKey) return;
      setQuote(associated);
      setQuoteVersion(associated?.version?.version ?? associated?.activeVersion ?? 1);
    } catch {
      setQuote(null);
    }
  }, []);

  useEffect(() => {
    if (!selectedKey) { setQuote(null); return; }
    void loadQuote(selectedKey);
  }, [selectedKey, loadQuote]);

  async function handleSuggest() {
    if (!selectedKey) return;
    setSuggesting(true);
    setError(null);
    try {
      const result = await requestWhatsappSuggestion(selectedKey);
      await loadThread(selectedKey, true);
      if (result.action === "ESCALATED") setNotice("El bot marcó que esta conversación necesita atención humana.");
      else if (result.action === "SUGGESTED") setNotice("Sugerencia lista para revisar.");
      else setNotice(`El bot terminó con estado ${result.action}.`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSuggesting(false);
    }
  }

  async function pickQuote(picked: Quote, version: number) {
    // Se recarga completo para tener todas las versiones e ítems, que el
    // resultado de búsqueda trae recortados.
    const full = await getCrmQuote(picked.id).catch(() => picked);
    setQuote(full);
    setQuoteVersion(version);
    setQuoteSearchOpen(false);
    setNotice(`Presupuesto ${full.visibleNumber} vinculado a la conversación.`);
  }

  return (
    <div className="crm-inbox">
      <ConversationList
        conversations={conversations}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        filter={filter}
        filters={FILTERS}
        onFilter={setFilter}
        search={search}
        onSearch={setSearch}
        loading={listLoading}
        totalUnread={totalUnread}
      />

      <section className="crm-thread-pane">
        {error ? <div className="crm-banner"><Alert tone="error">{error}</Alert></div> : null}
        {notice ? (
          <div className="crm-banner">
            <Alert tone="ok">
              {notice}
              <button type="button" className="crm-banner-close" onClick={() => setNotice(null)} aria-label="Cerrar">×</button>
            </Alert>
          </div>
        ) : null}

        {!selected ? (
          <div className="crm-placeholder">
            <div className="crm-placeholder-mark">💬</div>
            <p>Elegí una conversación para verla.</p>
          </div>
        ) : (
          <>
            <CrmToolbar
              conversation={selected}
              suggesting={suggesting}
              onSuggest={() => void handleSuggest()}
              onQuickRequest={() => setQuickRequestOpen(true)}
              onQuoteSearch={() => setQuoteSearchOpen(true)}
              onProduct={() => setProductOpen(true)}
              onWebSearch={() => setWebSearchOpen(true)}
            />
            {quote ? (
              <QuoteBar
                quote={quote}
                version={quoteVersion}
                conversation={selected}
                onVersionChange={setQuoteVersion}
                onSend={() => setSendQuoteOpen(true)}
                onHistory={() => setTimelineOpen(true)}
                onPickAnother={() => setQuoteSearchOpen(true)}
                onChanged={async () => { await loadQuote(selected.chatKey); }}
                onNotice={setNotice}
              />
            ) : null}
            <ConversationThread
              conversation={selected}
              messages={messages}
              loading={threadLoading}
            />
            {pendingSuggestion ? (
              <SuggestionCard
                suggestion={pendingSuggestion}
                conversation={selected}
                onSend={handleSuggestionSend}
                onDismiss={handleSuggestionDismiss}
              />
            ) : null}
            <Composer
              conversation={selected}
              templates={templates}
              draft={draft}
              onDraftChange={setDraft}
              onSend={handleSend}
              onRecontact={handleRecontact}
            />
          </>
        )}
      </section>

      <ContextPanel conversation={selected} onAssign={handleAssign} />

      {selected ? (
        <>
          <QuickRequestModal
            open={quickRequestOpen}
            chatKey={selected.chatKey}
            phone={selected.chatKey.replace(/^tel:/, "")}
            name={selected.displayName ?? selected.waContactName ?? ""}
            onClose={() => setQuickRequestOpen(false)}
            onCreated={(title) => setNotice(`Solicitud creada: ${title}`)}
          />
          <QuoteSearchModal
            open={quoteSearchOpen}
            phone={selected.chatKey.replace(/^tel:/, "")}
            onClose={() => setQuoteSearchOpen(false)}
            onPick={(picked, version) => void pickQuote(picked, version)}
          />
          <ProductSearchModal
            open={productOpen}
            chatKey={selected.chatKey}
            onClose={() => setProductOpen(false)}
            onSent={(title) => { setNotice(`Producto enviado: ${title}`); void loadThread(selected.chatKey, true); }}
          />
          <WebSearchModal
            open={webSearchOpen}
            onClose={() => setWebSearchOpen(false)}
            // El enlace se deja escrito en el composer: lo revisa y manda una persona.
            onLink={(url) => { setDraft((current) => (current ? `${current}\n${url}` : url)); setNotice("Enlace listo en el mensaje."); }}
          />
          <SendQuoteModal
            open={sendQuoteOpen}
            quote={quote}
            version={quoteVersion}
            chatKey={selected.chatKey}
            onClose={() => setSendQuoteOpen(false)}
            onSent={(visibleNumber) => {
              setNotice(`Presupuesto ${visibleNumber} encolado con su PDF.`);
              void loadThread(selected.chatKey, true);
            }}
          />
          <TimelineModal open={timelineOpen} quote={quote} onClose={() => setTimelineOpen(false)} />
        </>
      ) : null}
    </div>
  );
}
