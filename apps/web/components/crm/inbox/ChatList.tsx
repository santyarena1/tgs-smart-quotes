"use client";

import { memo } from "react";
import type { WhatsappConversation } from "../../../lib/api";
import { CRM_VIEWS, type CrmViewId } from "../../../lib/crm";
import { avatarInitials, conversationTitle, relativeTime } from "../format";
import type { CrmViewer } from "../useCrmLive";

/** Vistas que se muestran siempre; el resto se despliega en "Más". */
const PRIMARY: CrmViewId[] = ["ALL", "MINE", "UNASSIGNED", "BOT", "UNREAD"];

export function ChatList({
  items,
  counts,
  view,
  onView,
  query,
  onQuery,
  selectedKey,
  onSelect,
  viewers,
  meId,
  loading,
  hasMore,
  onLoadMore,
  tag,
  onClearTag,
}: {
  items: WhatsappConversation[];
  counts: Partial<Record<CrmViewId, number>>;
  view: CrmViewId;
  onView: (view: CrmViewId) => void;
  query: string;
  onQuery: (value: string) => void;
  selectedKey: string | null;
  onSelect: (chatKey: string) => void;
  viewers: Record<string, CrmViewer[]>;
  meId: string;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  tag: string | null;
  onClearTag: () => void;
}) {
  const secondary = CRM_VIEWS.filter((item) => !PRIMARY.includes(item.id));
  const current = CRM_VIEWS.find((item) => item.id === view);

  return (
    <section className="cx-list" aria-label="Conversaciones">
      <div className="cx-list-head">
        <div className="cx-search">
          <span aria-hidden="true">⌕</span>
          <input
            id="cx-search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Buscar nombre, número, mensaje o etiqueta"
            aria-label="Buscar conversaciones"
          />
          <kbd title="Abrir el buscador rápido">Ctrl K</kbd>
        </div>
        <div className="cx-views" role="tablist" aria-label="Vistas">
          {CRM_VIEWS.filter((item) => PRIMARY.includes(item.id)).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={view === item.id}
              className={view === item.id ? "cx-view active" : "cx-view"}
              title={item.hint}
              onClick={() => onView(item.id)}
            >
              {item.label}
              {counts[item.id] ? <span className="cx-count">{counts[item.id]}</span> : null}
            </button>
          ))}
          <select
            className={secondary.some((item) => item.id === view) ? "cx-view-more active" : "cx-view-more"}
            value={secondary.some((item) => item.id === view) ? view : ""}
            onChange={(event) => event.target.value && onView(event.target.value as CrmViewId)}
            aria-label="Más vistas"
          >
            <option value="">Más…</option>
            {secondary.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}{counts[item.id] ? ` (${counts[item.id]})` : ""}
              </option>
            ))}
          </select>
        </div>
        {tag ? (
          <div className="cx-tagfilter">
            Etiqueta <strong>#{tag}</strong>
            <button type="button" onClick={onClearTag} aria-label="Quitar filtro de etiqueta">×</button>
          </div>
        ) : null}
      </div>

      <div className="cx-list-body">
        {loading && items.length === 0 ? <ListSkeleton /> : null}
        {!loading && items.length === 0 ? (
          <p className="cx-empty">
            {query ? "No hay chats que coincidan con la búsqueda." : `No hay chats en "${current?.label ?? ""}".`}
          </p>
        ) : null}
        {items.map((item) => (
          <ChatRow
            key={item.chatKey}
            item={item}
            selected={item.chatKey === selectedKey}
            onSelect={onSelect}
            others={(viewers[item.chatKey] ?? []).filter((viewer) => viewer.userId !== meId)}
          />
        ))}
        {hasMore ? (
          <button type="button" className="cx-loadmore" onClick={onLoadMore} disabled={loading}>
            {loading ? "Cargando…" : "Cargar más"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

const ChatRow = memo(function ChatRow({
  item,
  selected,
  onSelect,
  others,
}: {
  item: WhatsappConversation;
  selected: boolean;
  onSelect: (chatKey: string) => void;
  others: CrmViewer[];
}) {
  const unread = item.unreadCount > 0;
  const preview = item.lastSpeaker === "US"
    ? `Vos: ${item.lastOutboundText ?? ""}`
    : item.lastInboundText ?? item.lastOutboundText ?? "";
  const typing = others.find((viewer) => viewer.typing);
  return (
    <button
      type="button"
      className={["cx-row", selected ? "selected" : "", unread ? "unread" : "", item.status === "NEEDS_HUMAN" ? "alert" : ""].join(" ")}
      onClick={() => onSelect(item.chatKey)}
      aria-current={selected ? "true" : undefined}
    >
      <span className="cx-avatar" aria-hidden="true">{avatarInitials(item)}</span>
      <span className="cx-row-main">
        <span className="cx-row-top">
          <span className="cx-row-name">{conversationTitle(item)}</span>
          <span className="cx-row-time">{relativeTime(item.lastMessageAt ?? item.lastInboundAt)}</span>
        </span>
        <span className="cx-row-preview">
          {typing ? <em>{typing.name} está escribiendo…</em> : preview || <em>Sin mensajes</em>}
        </span>
        <span className="cx-row-meta">
          <StatusPill item={item} />
          {item.assignedUser ? <span className="cx-pill">👤 {item.assignedUser.displayName || item.assignedUser.username}</span> : null}
          {!item.window.open && item.lastInboundAt ? <span className="cx-pill muted" title="Pasaron más de 24 h: solo plantillas">⏱ cerrada</span> : null}
          {(item.tags ?? []).slice(0, 2).map((tag) => <span key={tag} className="cx-pill tag">#{tag}</span>)}
          {others.length && !typing ? <span className="cx-pill eye" title={others.map((viewer) => viewer.name).join(", ")}>👁 {others[0]?.name}</span> : null}
        </span>
      </span>
      {unread ? <span className="cx-unread" aria-label={`${item.unreadCount} sin leer`}>{item.unreadCount}</span> : null}
    </button>
  );
});

export function StatusPill({ item }: { item: WhatsappConversation }) {
  switch (item.status) {
    case "NEEDS_HUMAN":
      return <span className="cx-pill alert" title={item.escalationReason ?? undefined}>⚠ Derivado</span>;
    case "HUMAN":
      return <span className="cx-pill human">👤 {item.bot?.pausedBy ?? "Vendedor"}</span>;
    case "SNOOZED":
      return <span className="cx-pill muted">⏰ Pospuesto</span>;
    case "RESOLVED":
      return <span className="cx-pill ok">✓ Resuelto</span>;
    case "BOT":
      return <span className="cx-pill bot">{item.bot?.replying ? "🤖 respondiendo…" : "🤖 Bot"}</span>;
    default:
      return null;
  }
}

function ListSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="cx-row skeleton">
          <span className="cx-avatar" />
          <span className="cx-row-main">
            <span className="cx-skel w60" />
            <span className="cx-skel w90" />
          </span>
        </div>
      ))}
    </div>
  );
}
