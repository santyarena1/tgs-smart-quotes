"use client";

import type { WhatsappConversation, WhatsappConversationFilter } from "../../lib/api";
import { Loading } from "../shared";
import { avatarInitials, conversationTitle, relativeTime, rowPriority } from "./format";
import { IconLock, IconSearch, IconTrash } from "./icons";

export function ConversationList({
  conversations,
  selectedKey,
  onSelect,
  filter,
  filters,
  onFilter,
  search,
  onSearch,
  loading,
  totalUnread,
  onPurge,
}: {
  conversations: WhatsappConversation[];
  selectedKey: string | null;
  onSelect: (chatKey: string) => void;
  filter: WhatsappConversationFilter;
  filters: { id: WhatsappConversationFilter; label: string }[];
  onFilter: (filter: WhatsappConversationFilter) => void;
  search: string;
  onSearch: (value: string) => void;
  loading: boolean;
  totalUnread: number;
  /** Solo se pasa a un ADMIN: limpieza masiva de conversaciones. */
  onPurge?: () => void;
}) {
  const escalated = conversations.filter((item) => item.escalatedAt).length;

  return (
    <aside className="crm-list">
      <div className="crm-list-head">
        <div className="crm-list-title">
          <strong>Conversaciones</strong>
          {totalUnread > 0 ? <span className="crm-count">{totalUnread}</span> : null}
          {onPurge ? (
            <button type="button" className="crm-list-purge" onClick={onPurge} title="Borrar todas las conversaciones">
              <IconTrash size={14} /> Limpiar
            </button>
          ) : null}
        </div>
        <div className="crm-search-wrap">
          <IconSearch size={15} />
          <input
            className="crm-search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar por nombre, número o mensaje"
            aria-label="Buscar conversaciones"
          />
        </div>
        <div className="crm-filters">
          {filters.map((item) => {
            // El contador va en el propio filtro: dice cuánto hay antes de tocarlo.
            const count = item.id === "NO_LEIDAS"
              ? conversations.filter((row) => row.unreadCount > 0).length
              : item.id === "ESCALADAS"
                ? escalated
                : null;
            return (
              <button
                key={item.id}
                type="button"
                className={item.id === filter ? "crm-filter active" : "crm-filter"}
                onClick={() => onFilter(item.id)}
              >
                {item.label}
                {count ? <span className="crm-filter-count">{count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="crm-list-body">
        {loading ? (
          <div className="crm-list-loading"><Loading label="Cargando conversaciones…" /></div>
        ) : conversations.length === 0 ? (
          <p className="crm-list-empty">No hay conversaciones para este filtro.</p>
        ) : (
          conversations.map((conversation) => {
            const inboundIsLast = conversation.lastInboundAt
              && (!conversation.lastOutboundAt
                || new Date(conversation.lastInboundAt) > new Date(conversation.lastOutboundAt));
            const preview = inboundIsLast ? conversation.lastInboundText : conversation.lastOutboundText;
            const stamp = conversation.lastInboundAt && conversation.lastOutboundAt
              ? (new Date(conversation.lastInboundAt) > new Date(conversation.lastOutboundAt)
                ? conversation.lastInboundAt
                : conversation.lastOutboundAt)
              : conversation.lastInboundAt ?? conversation.lastOutboundAt ?? conversation.updatedAt;
            const priority = rowPriority(conversation);
            const active = conversation.chatKey === selectedKey;

            return (
              <button
                key={conversation.chatKey}
                type="button"
                className={`crm-row prio-${priority}${active ? " active" : ""}`}
                onClick={() => onSelect(conversation.chatKey)}
              >
                <span className="crm-row-bar" aria-hidden="true" />
                <span className={`crm-avatar prio-${priority}`}>{avatarInitials(conversation)}</span>
                <span className="crm-row-body">
                  <span className="crm-row-top">
                    <span className="crm-row-name">{conversationTitle(conversation)}</span>
                    <span className="crm-row-time">{relativeTime(stamp)}</span>
                  </span>
                  <span className="crm-row-preview">{preview || "Sin mensajes"}</span>
                  <span className="crm-row-tags">
                    {conversation.escalatedAt ? <span className="crm-tag warn">Escalada</span> : null}
                    {conversation.unreadCount > 0 ? (
                      <span className="crm-tag unread">{conversation.unreadCount}</span>
                    ) : null}
                    {conversation.assignedUser ? (
                      <span className="crm-tag info">
                        {conversation.assignedUser.displayName || conversation.assignedUser.username}
                      </span>
                    ) : null}
                    {!conversation.window.open ? (
                      <span className="crm-row-closed">
                        <IconLock size={12} /> Ventana cerrada
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
