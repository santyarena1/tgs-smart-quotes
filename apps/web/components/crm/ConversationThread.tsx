"use client";

import { useEffect, useRef } from "react";
import type { WhatsappConversation, WhatsappMessage } from "../../lib/api";
import { Loading } from "../shared";
import { actorLabel, clockTime, conversationTitle, dayLabel, deliveryLabel } from "./format";

export function ConversationThread({
  conversation,
  messages,
  loading,
}: {
  conversation: WhatsappConversation;
  messages: WhatsappMessage[];
  loading: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string | null>(null);

  useEffect(() => {
    const lastId = messages[messages.length - 1]?.id ?? null;
    // Solo baja cuando llega algo nuevo: si no, cada refresco de 10 s te tiraría
    // al final mientras estás leyendo mensajes viejos.
    if (lastId && lastId !== lastIdRef.current) {
      lastIdRef.current = lastId;
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages]);

  let lastDay = "";

  return (
    <div className="crm-thread">
      <header className="crm-thread-head">
        <div>
          <strong>{conversationTitle(conversation)}</strong>
          <span className="crm-thread-phone">{conversation.chatKey.replace(/^tel:/, "+")}</span>
        </div>
        <div className="crm-thread-state">
          {conversation.escalatedAt ? (
            <span className="crm-tag warn" title={conversation.escalationReason ?? undefined}>
              Escalada
            </span>
          ) : null}
          <span className={conversation.window.open ? "crm-window open" : "crm-window closed"}>
            {conversation.window.description}
          </span>
        </div>
      </header>

      <div className="crm-thread-body">
        {loading && messages.length === 0 ? (
          <Loading label="Cargando conversación…" />
        ) : messages.length === 0 ? (
          <p className="crm-list-empty">Todavía no hay mensajes en esta conversación.</p>
        ) : (
          messages.map((message) => {
            const day = dayLabel(message.createdAt);
            const showDay = day !== lastDay;
            lastDay = day;
            const delivery = deliveryLabel(message);
            const outbound = message.direction === "OUTBOUND";

            return (
              <div key={message.id}>
                {showDay ? <div className="crm-day">{day}</div> : null}
                <div className={outbound ? "crm-bubble-row out" : "crm-bubble-row in"}>
                  <div className={`crm-bubble ${outbound ? "out" : "in"}${message.status === "SEND_FAILED" ? " failed" : ""}`}>
                    {outbound ? <div className="crm-bubble-actor">{actorLabel(message)}</div> : null}
                    <p className="crm-bubble-text">{message.text}</p>
                    {message.mediaFilename ? (
                      <p className="crm-bubble-media">📎 {message.mediaFilename}</p>
                    ) : null}
                    <div className="crm-bubble-meta">
                      <span>{clockTime(message.createdAt)}</span>
                      {delivery.icon ? (
                        <span className={`crm-delivery ${delivery.tone}`} title={delivery.label}>
                          {delivery.icon}
                        </span>
                      ) : null}
                    </div>
                    {message.status === "SEND_FAILED" && message.error ? (
                      <p className="crm-bubble-error">{message.error}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
