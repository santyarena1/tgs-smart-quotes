"use client";

import type { WhatsappConversation, WhatsappConversationFilter } from "../../lib/api";
import { Loading } from "../shared";
import { relativeTime, conversationTitle } from "./format";

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
}) {
  return (
    <aside className="crm-list">
      <div className="crm-list-head">
        <div className="crm-list-title">
          <strong>Conversaciones</strong>
          {totalUnread > 0 ? <span className="crm-count">{totalUnread}</span> : null}
        </div>
        <input
          className="crm-search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Buscar por nombre, número o mensaje…"
          aria-label="Buscar conversaciones"
        />
        <div className="crm-filters">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === filter ? "crm-filter active" : "crm-filter"}
              onClick={() => onFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="crm-list-body">
        {loading ? (
          <div className="crm-list-loading"><Loading label="Cargando conversaciones…" /></div>
        ) : conversations.length === 0 ? (
          <p className="crm-list-empty">No hay conversaciones para este filtro.</p>
        ) : (
          conversations.map((conversation) => {
            const preview = conversation.lastInboundAt && (!conversation.lastOutboundAt
              || new Date(conversation.lastInboundAt) > new Date(conversation.lastOutboundAt))
              ? conversation.lastInboundText
              : conversation.lastOutboundText;
            const stamp = conversation.lastInboundAt && conversation.lastOutboundAt
              ? (new Date(conversation.lastInboundAt) > new Date(conversation.lastOutboundAt)
                ? conversation.lastInboundAt
                : conversation.lastOutboundAt)
              : conversation.lastInboundAt ?? conversation.lastOutboundAt ?? conversation.updatedAt;

            return (
              <button
                key={conversation.chatKey}
                type="button"
                className={conversation.chatKey === selectedKey ? "crm-row active" : "crm-row"}
                onClick={() => onSelect(conversation.chatKey)}
              >
                <div className="crm-row-top">
                  <span className="crm-row-name">{conversationTitle(conversation)}</span>
                  <span className="crm-row-time">{relativeTime(stamp)}</span>
                </div>
                <div className="crm-row-preview">{preview || "Sin mensajes"}</div>
                <div className="crm-row-tags">
                  {conversation.unreadCount > 0 ? (
                    <span className="crm-tag unread">{conversation.unreadCount}</span>
                  ) : null}
                  {conversation.escalatedAt ? <span className="crm-tag warn">Escalada</span> : null}
                  {/* La ventana cerrada es la información más accionable de la fila:
                      determina si se puede contestar o hay que usar una plantilla. */}
                  {!conversation.window.open ? <span className="crm-tag closed">Ventana cerrada</span> : null}
                  {conversation.modeOverride === "OFF" ? <span className="crm-tag muted">Bot apagado</span> : null}
                  {conversation.assignedUser ? (
                    <span className="crm-tag info">
                      {conversation.assignedUser.displayName || conversation.assignedUser.username}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
