"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  assignWhatsappConversation,
  deleteWhatsappConversation,
  dismissWhatsappSuggestion,
  getConversationQuote,
  getCrmQuote,
  getWhatsappConversation,
  listWhatsappMessages,
  listWhatsappTemplates,
  markWhatsappRead,
  releaseConversation,
  requestWhatsappSuggestion,
  sendWhatsappMessage,
  sendWhatsappSuggestion,
  takeConversation,
  unlinkConversationQuote,
  updateConversationBot,
  type WhatsappConversation,
  type WhatsappMessage,
  type WhatsappTemplate,
} from "../../../lib/api";
import {
  addNote,
  deleteNote,
  getCrmInbox,
  listCrmTags,
  listNotes,
  listQuickReplies,
  listTeam,
  renameConversation,
  reopenConversation,
  resolveConversation,
  setConversationTags,
  snoozeConversation,
  type CrmNote,
  type CrmViewId,
  type QuickReply,
  type TeamMember, setConversationAlwaysOn } from "../../../lib/crm";
import type { Quote } from "../../../lib/types";
import { errorMessage } from "../../shared";
import { useSession } from "../../SessionProvider";
import { EmptyInbox } from "../EmptyInbox";
import { conversationTitle } from "../format";
import { ProductSearchModal, QuickRequestModal, QuoteSearchModal, SendQuoteModal, TimelineModal, WebSearchModal } from "../modals";
import { QuoteBar } from "../QuoteBar";
import { SuggestionCard } from "../SuggestionCard";
import { useCrmTheme } from "../theme";
import { useCrmLive } from "../useCrmLive";
import { ChatHeader } from "./ChatHeader";
import { ChatList } from "./ChatList";
import { ChatSide } from "./ChatSide";
import { CommandPalette } from "./CommandPalette";
import { ReplyBox } from "./ReplyBox";
import { Thread } from "./Thread";

const PAGE = 40;
const THREAD_PAGE = 60;

/** Sonido corto de aviso, sin archivos: un "ding" generado en el momento. */
function ding() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.36);
    oscillator.onended = () => void context.close();
  } catch {
    // sin audio (navegador sin interacción previa, etc.): el aviso visual alcanza
  }
}

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT" || element.isContentEditable));
}

export function Inbox() {
  const { user } = useSession();
  const meId = user?.id ?? "";
  const { setChoice } = useCrmTheme();

  // ---------------------------------------------------------------- bandeja
  const [view, setView] = useState<CrmViewId>("ALL");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [items, setItems] = useState<WhatsappConversation[]>([]);
  const [counts, setCounts] = useState<Partial<Record<CrmViewId, number>>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const unreadSnapshot = useRef<Map<string, number> | null>(null);

  // ---------------------------------------------------------------- chat abierto
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [conversation, setConversation] = useState<WhatsappConversation | null>(null);
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [notes, setNotes] = useState<CrmNote[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteVersion, setQuoteVersion] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [suggesting, setSuggesting] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);

  // ---------------------------------------------------------------- catálogos
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);

  // ---------------------------------------------------------------- UI
  const [toast, setToast] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [modal, setModal] = useState<null | "request" | "quoteSearch" | "product" | "web" | "sendQuote" | "timeline">(null);

  const notify = useCallback((text: string, tone: "ok" | "error" = "ok") => setToast({ text, tone }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.tone === "error" ? 7000 : 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => { selectedRef.current = selectedKey; }, [selectedKey]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Preferencia de panel derecho y chat abierto por URL (?chat=tel:...).
  useEffect(() => {
    try { setSideOpen(localStorage.getItem("tgs.crm.side") !== "0"); } catch { /* sin storage */ }
    const fromUrl = new URLSearchParams(window.location.search).get("chat");
    if (fromUrl) setSelectedKey(fromUrl);
  }, []);
  useEffect(() => {
    try { localStorage.setItem("tgs.crm.side", sideOpen ? "1" : "0"); } catch { /* sin storage */ }
  }, [sideOpen]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedKey) url.searchParams.set("chat", selectedKey);
    else url.searchParams.delete("chat");
    window.history.replaceState(null, "", url.toString());
  }, [selectedKey]);

  useEffect(() => {
    void listWhatsappTemplates().then(setTemplates).catch(() => setTemplates([]));
    void listQuickReplies().then(setQuickReplies).catch(() => setQuickReplies([]));
    void listTeam().then(setTeam).catch(() => setTeam([]));
    void listCrmTags().then((rows) => setKnownTags(rows.map((row) => row.tag))).catch(() => setKnownTags([]));
  }, []);

  const loadList = useCallback(async (quiet = false) => {
    if (!quiet) setListLoading(true);
    try {
      const result = await getCrmInbox({ view, q: debouncedQuery || undefined, tag: tag ?? undefined, limit: PAGE });
      setItems(result.items);
      setCounts(result.counts);
      setNextCursor(result.nextCursor);
      // Aviso de mensaje nuevo: sube el no leído de un chat que no es el abierto.
      const previous = unreadSnapshot.current;
      const current = new Map(result.items.map((item) => [item.chatKey, item.unreadCount]));
      if (previous) {
        const fresh = result.items.find((item) => item.chatKey !== selectedRef.current && item.unreadCount > (previous.get(item.chatKey) ?? 0));
        if (fresh) {
          ding();
          if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            new Notification(conversationTitle(fresh), { body: fresh.lastInboundText ?? "Mensaje nuevo", tag: fresh.chatKey });
          }
        }
      }
      unreadSnapshot.current = current;
    } catch (reason) {
      notify(errorMessage(reason), "error");
    } finally {
      if (!quiet) setListLoading(false);
    }
  }, [view, debouncedQuery, tag, notify]);

  useEffect(() => {
    unreadSnapshot.current = null;
    void loadList();
  }, [loadList]);

  async function loadMore() {
    if (!nextCursor) return;
    setListLoading(true);
    try {
      const result = await getCrmInbox({ view, q: debouncedQuery || undefined, tag: tag ?? undefined, cursor: nextCursor, limit: PAGE });
      setItems((current) => [...current, ...result.items.filter((item) => !current.some((existing) => existing.chatKey === item.chatKey))]);
      setNextCursor(result.nextCursor);
    } catch (reason) {
      notify(errorMessage(reason), "error");
    } finally {
      setListLoading(false);
    }
  }

  const loadChat = useCallback(async (chatKey: string, quiet = false) => {
    if (!quiet) setThreadLoading(true);
    try {
      const [chat, history, chatNotes] = await Promise.all([
        getWhatsappConversation(chatKey),
        listWhatsappMessages(chatKey, { limit: THREAD_PAGE }),
        listNotes(chatKey),
      ]);
      if (selectedRef.current !== chatKey) return;
      setConversation(chat);
      // Al refrescar se conservan los mensajes viejos ya cargados.
      setMessages((current) => {
        if (!quiet) return history.items;
        const fresh = new Map(history.items.map((message) => [message.id, message]));
        const older = current.filter((message) => !fresh.has(message.id) && history.items.length && message.createdAt < history.items[0]!.createdAt);
        return [...older, ...history.items];
      });
      if (!quiet) setOlderCursor(history.nextCursor);
      setNotes(chatNotes);
    } catch (reason) {
      notify(errorMessage(reason), "error");
    } finally {
      if (!quiet) setThreadLoading(false);
    }
  }, [notify]);

  async function loadOlder() {
    if (!selectedKey || !olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await listWhatsappMessages(selectedKey, { limit: THREAD_PAGE, before: olderCursor });
      setMessages((current) => [...page.items.filter((message) => !current.some((existing) => existing.id === message.id)), ...current]);
      setOlderCursor(page.nextCursor);
    } catch (reason) {
      notify(errorMessage(reason), "error");
    } finally {
      setLoadingOlder(false);
    }
  }

  const loadQuote = useCallback(async (chatKey: string) => {
    try {
      const associated = await getConversationQuote(chatKey);
      if (selectedRef.current !== chatKey) return;
      setQuote(associated);
      setQuoteVersion(associated?.version?.version ?? associated?.activeVersion ?? 1);
    } catch {
      setQuote(null);
    }
  }, []);

  useEffect(() => {
    if (!selectedKey) {
      setConversation(null);
      setMessages([]);
      setNotes([]);
      setQuote(null);
      return;
    }
    setMessages([]);
    setNotes([]);
    void loadChat(selectedKey);
    void loadQuote(selectedKey);
    void markWhatsappRead(selectedKey)
      .then(() => setItems((current) => current.map((item) => (item.chatKey === selectedKey ? { ...item, unreadCount: 0 } : item))))
      .catch(() => undefined);
  }, [selectedKey, loadChat, loadQuote]);

  // ---------------------------------------------------------------- tiempo real
  const reloadTimer = useRef<number | null>(null);
  const draft = selectedKey ? drafts[selectedKey] ?? "" : "";
  const { connected, viewers } = useCrmLive({
    chatKey: selectedKey,
    typing: draft.trim().length > 0,
    onChats: (chatKeys) => {
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
      reloadTimer.current = window.setTimeout(() => void loadList(true), 250);
      const open = selectedRef.current;
      if (open && chatKeys.includes(open)) {
        void loadChat(open, true);
        if (!document.hidden) void markWhatsappRead(open).catch(() => undefined);
      }
    },
  });

  // Respaldo si el canal en vivo se cae.
  useEffect(() => {
    if (connected) return;
    const timer = window.setInterval(() => {
      void loadList(true);
      if (selectedRef.current) void loadChat(selectedRef.current, true);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [connected, loadList, loadChat]);

  // Título de la pestaña con los no leídos.
  useEffect(() => {
    const unread = counts.UNREAD ?? 0;
    document.title = unread ? `(${unread}) CRM · The Gamer Shop` : "CRM · The Gamer Shop";
  }, [counts.UNREAD]);

  // ---------------------------------------------------------------- acciones
  const refreshOpen = useCallback(async () => {
    if (selectedRef.current) await loadChat(selectedRef.current, true);
    await loadList(true);
  }, [loadChat, loadList]);

  const act = useCallback(async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      if (success) notify(success);
      await refreshOpen();
    } catch (reason) {
      notify(errorMessage(reason), "error");
    }
  }, [notify, refreshOpen]);

  const pendingSuggestion = useMemo(() => {
    const last = [...messages].reverse().find((message) => message.direction === "OUTBOUND" && message.status !== "DISMISSED");
    return last && last.status === "SUGGESTED" ? last : null;
  }, [messages]);

  function moveSelection(step: 1 | -1) {
    if (!items.length) return;
    const index = items.findIndex((item) => item.chatKey === selectedKey);
    const next = items[Math.max(0, Math.min(items.length - 1, index + step))] ?? items[0];
    if (next) setSelectedKey(next.chatKey);
  }

  // Atajos de teclado.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "j") moveSelection(1);
      else if (event.key === "k") moveSelection(-1);
      else if (event.key === "i") setSideOpen((open) => !open);
      else if (event.key === "e" && selectedRef.current && conversation?.status !== "RESOLVED") {
        const key = selectedRef.current;
        void act(() => resolveConversation(key), "Chat resuelto.");
      } else if (event.key === "/") {
        event.preventDefault();
        document.getElementById("cx-search")?.focus();
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Pedir permiso de notificaciones del navegador una vez, tras una interacción.
  useEffect(() => {
    const ask = () => {
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
      window.removeEventListener("pointerdown", ask);
    };
    window.addEventListener("pointerdown", ask);
    return () => window.removeEventListener("pointerdown", ask);
  }, []);

  const showEmpty = !listLoading && view === "ALL" && !debouncedQuery && !tag && (counts.ALL ?? 0) === 0 && (counts.RESOLVED ?? 0) === 0;
  const chatViewers = selectedKey ? viewers[selectedKey] ?? [] : [];

  return (
    <div className={`cx-inbox${sideOpen && conversation ? " with-side" : ""}${conversation ? " has-chat" : ""}`}>
      <ChatList
        items={items}
        counts={counts}
        view={view}
        onView={(next) => { setView(next); setTag(null); }}
        query={query}
        onQuery={setQuery}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        viewers={viewers}
        meId={meId}
        loading={listLoading}
        hasMore={Boolean(nextCursor)}
        onLoadMore={() => void loadMore()}
        tag={tag}
        onClearTag={() => setTag(null)}
      />

      <section className="cx-chat" aria-label="Conversación">
        {!conversation ? (
          showEmpty ? <EmptyInbox /> : (
            <div className="cx-placeholder">
              <span aria-hidden="true">💬</span>
              <p>Elegí una conversación.</p>
              <p className="cx-hint">Ctrl K para buscar · J/K para moverte entre chats</p>
            </div>
          )
        ) : (
          <>
            <ChatHeader
              conversation={conversation}
              viewers={chatViewers}
              meId={meId}
              sideOpen={sideOpen}
              onToggleSide={() => setSideOpen(!sideOpen)}
              onBack={() => setSelectedKey(null)}
              onRename={async (name) => { await act(() => renameConversation(conversation.chatKey, name), "Nombre guardado."); }}
              onTake={() => void act(() => takeConversation(conversation.chatKey), "Tomaste el chat: el bot no va a responder acá.")}
              onRelease={() => void act(() => releaseConversation(conversation.chatKey), "El chat volvió al bot.")}
              onResolve={() => void act(() => resolveConversation(conversation.chatKey), "Chat resuelto.")}
              onReopen={() => void act(() => reopenConversation(conversation.chatKey), "Chat reabierto.")}
              onSnooze={(until) => void act(() => snoozeConversation(conversation.chatKey, until), `Pospuesto hasta ${until.toLocaleString("es-AR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}.`)}
            />
            {quote ? (
              <QuoteBar
                quote={quote}
                version={quoteVersion}
                conversation={conversation}
                onVersionChange={setQuoteVersion}
                onSend={() => setModal("sendQuote")}
                onHistory={() => setModal("timeline")}
                onPickAnother={() => setModal("quoteSearch")}
                onChanged={async () => { await loadQuote(conversation.chatKey); }}
                onNotice={(text) => notify(text)}
                onUnlink={async () => { await unlinkConversationQuote(conversation.chatKey); setQuote(null); }}
              />
            ) : null}
            <Thread
              conversation={conversation}
              messages={messages}
              notes={notes}
              loading={threadLoading}
              hasOlder={Boolean(olderCursor)}
              loadingOlder={loadingOlder}
              onLoadOlder={() => void loadOlder()}
              onDeleteNote={(id) => void act(() => deleteNote(conversation.chatKey, id), "Nota borrada.")}
              meId={meId}
            />
            {pendingSuggestion ? (
              <SuggestionCard
                suggestion={pendingSuggestion}
                conversation={conversation}
                onSend={async (logId, bubbles) => { await sendWhatsappSuggestion(logId, bubbles); notify("Sugerencia enviada."); await refreshOpen(); }}
                onDismiss={async (logId) => { await dismissWhatsappSuggestion(logId); await refreshOpen(); }}
              />
            ) : null}
            <ReplyBox
              conversation={conversation}
              templates={templates}
              quickReplies={quickReplies}
              team={team}
              draft={draft}
              onDraft={(value) => setDrafts((current) => ({ ...current, [conversation.chatKey]: value }))}
              onSendText={async (text) => { await sendWhatsappMessage(conversation.chatKey, { text }); await refreshOpen(); }}
              onSendTemplate={async (templateId, variables) => {
                await sendWhatsappMessage(conversation.chatKey, { templateId, templateVariables: variables });
                notify("Plantilla enviada.");
                await refreshOpen();
              }}
              onAddNote={async (body, mentions) => {
                await addNote(conversation.chatKey, body, mentions);
                await refreshOpen();
              }}
              suggesting={suggesting}
              onSuggest={async () => {
                setSuggesting(true);
                try {
                  const result = await requestWhatsappSuggestion(conversation.chatKey);
                  await refreshOpen();
                  if (result.action === "ESCALATED") notify("El bot indica que esto lo tiene que ver una persona.");
                  else if (result.action !== "SUGGESTED") notify(`El bot no generó sugerencia (${result.action}).`);
                } catch (reason) {
                  notify(errorMessage(reason), "error");
                } finally {
                  setSuggesting(false);
                }
              }}
              actions={[
                { id: "quote", icon: "📄", label: "Presupuesto", onClick: () => setModal("quoteSearch"), title: "Vincular o mandar un presupuesto" },
                { id: "product", icon: "🛒", label: "Producto", onClick: () => setModal("product"), title: "Mandar un producto del catálogo con foto" },
                { id: "web", icon: "🌐", label: "Tienda", onClick: () => setModal("web"), title: "Link de búsqueda en la tienda web" },
                { id: "request", icon: "📝", label: "Solicitud", onClick: () => setModal("request"), title: "Crear una solicitud desde este chat" },
              ]}
            />
          </>
        )}
      </section>

      {conversation && sideOpen ? (
        <ChatSide
          conversation={conversation}
          team={team}
          knownTags={knownTags}
          canDelete={user?.role === "ADMIN"}
          onAssign={async (userId) => { await assignWhatsappConversation(conversation.chatKey, userId); await refreshOpen(); }}
          onTags={async (tags) => {
            await setConversationTags(conversation.chatKey, tags);
            setKnownTags((current) => [...new Set([...current, ...tags])]);
            await refreshOpen();
          }}
          onBotMode={async (mode) => { await updateConversationBot(conversation.chatKey, { modeOverride: mode }); await refreshOpen(); }}
          onAlwaysOn={async (alwaysOn) => { await setConversationAlwaysOn(conversation.chatKey, alwaysOn); await refreshOpen(); }}
          onDelete={async () => {
            await deleteWhatsappConversation(conversation.chatKey);
            setSelectedKey(null);
            notify("Conversación borrada.");
            await loadList(true);
          }}
          onTagFilter={(value) => { setTag(value); setView("ALL"); }}
          onLeadChanged={refreshOpen}
        />
      ) : null}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenChat={(chatKey) => setSelectedKey(chatKey)}
        onView={(next) => { setView(next); setTag(null); }}
        extra={[
          { id: "theme-light", label: "Tema claro", run: () => setChoice("light") },
          { id: "theme-dark", label: "Tema oscuro", run: () => setChoice("dark") },
          { id: "theme-system", label: "Tema automático", run: () => setChoice("system") },
          { id: "quick", label: "Administrar respuestas rápidas", run: () => { window.location.href = "/crm/respuestas"; } },
        ]}
      />

      {toast ? (
        <div className={`cx-toast ${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
          {toast.text}
          <button type="button" onClick={() => setToast(null)} aria-label="Cerrar">×</button>
        </div>
      ) : null}
      {!connected ? <div className="cx-offline" title="Reintentando la conexión en vivo">Reconectando…</div> : null}

      {conversation ? (
        <>
          <QuickRequestModal
            open={modal === "request"}
            chatKey={conversation.chatKey}
            phone={conversation.chatKey.replace(/^tel:/, "")}
            name={conversation.displayName ?? conversation.waContactName ?? ""}
            onClose={() => setModal(null)}
            onCreated={(title) => notify(`Solicitud creada: ${title}`)}
          />
          <QuoteSearchModal
            open={modal === "quoteSearch"}
            phone={conversation.chatKey.replace(/^tel:/, "")}
            onClose={() => setModal(null)}
            onPick={async (picked, version) => {
              const full = await getCrmQuote(picked.id).catch(() => picked);
              setQuote(full);
              setQuoteVersion(version);
              setModal(null);
              notify(`Presupuesto ${full.visibleNumber} vinculado. Mandalo con "Enviar" en la barra de arriba.`);
            }}
          />
          <ProductSearchModal
            open={modal === "product"}
            chatKey={conversation.chatKey}
            onClose={() => setModal(null)}
            onSent={(title) => { notify(`Producto enviado: ${title}`); void refreshOpen(); }}
          />
          <WebSearchModal
            open={modal === "web"}
            onClose={() => setModal(null)}
            onLink={(url) => {
              if (conversation.window.open) {
                setDrafts((current) => ({ ...current, [conversation.chatKey]: current[conversation.chatKey] ? `${current[conversation.chatKey]}\n${url}` : url }));
                notify("Link listo en el cuadro de mensaje.");
              } else {
                void navigator.clipboard?.writeText(url).catch(() => undefined);
                notify("La ventana está cerrada: el link se copió al portapapeles.");
              }
            }}
          />
          <SendQuoteModal
            open={modal === "sendQuote"}
            quote={quote}
            version={quoteVersion}
            chatKey={conversation.chatKey}
            onClose={() => setModal(null)}
            onSent={(visibleNumber) => { notify(`Presupuesto ${visibleNumber} enviado con su PDF.`); void refreshOpen(); }}
          />
          <TimelineModal open={modal === "timeline"} quote={quote} onClose={() => setModal(null)} />
        </>
      ) : null}
    </div>
  );
}
