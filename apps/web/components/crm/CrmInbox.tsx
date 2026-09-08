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
              onSend={handleSend}
              onRecontact={handleRecontact}
            />
          </>
        )}
      </section>

      <ContextPanel conversation={selected} onAssign={handleAssign} />
    </div>
  );
}
