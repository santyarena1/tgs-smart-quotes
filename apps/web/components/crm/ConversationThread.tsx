"use client";

import { useEffect, useRef, useState } from "react";
import type { WhatsappConversation, WhatsappMessage } from "../../lib/api";
import { Loading } from "../shared";
import {
  actorLabel,
  avatarInitials,
  clockTime,
  conversationTitle,
  dayLabel,
  deliveryLabel,
  phoneLabel,
  windowCountdown,
} from "./format";
import { IconClock, IconLock, IconPaperclip } from "./icons";

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
  const [countdown, setCountdown] = useState(() => windowCountdown(conversation.window.expiresAt));

  // La cuenta regresiva avanza sola: si dependiera del refresco de 10 s, el
  // número quedaría congelado justo cuando importa mirarlo.
  useEffect(() => {
    setCountdown(windowCountdown(conversation.window.expiresAt));
    const timer = window.setInterval(
      () => setCountdown(windowCountdown(conversation.window.expiresAt)),
      30_000,
    );
    return () => window.clearInterval(timer);
  }, [conversation.window.expiresAt]);

  // Un borrador no es un mensaje: una sugerencia sin aprobar y una descartada no
  // van al hilo. Dibujarlas como burbuja saliente hacía creer que ya se enviaron.
  const sent = messages.filter(
    (message) => message.status !== "SUGGESTED" && message.status !== "DISMISSED",
  );

  useEffect(() => {
    const lastId = sent[sent.length - 1]?.id ?? null;
    // Solo baja cuando llega algo nuevo: si no, cada refresco de 10 s te tiraría
    // al final mientras estás leyendo mensajes viejos.
    if (lastId && lastId !== lastIdRef.current) {
      lastIdRef.current = lastId;
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [sent]);

  let lastDay = "";

  return (
    <div className="crm-thread">
      <header className="crm-thread-head">
        <div className="crm-thread-who">
          <span className="crm-avatar">{avatarInitials(conversation)}</span>
          <div>
            <strong>{conversationTitle(conversation)}</strong>
            <span className="crm-thread-phone">{phoneLabel(conversation.chatKey)}</span>
          </div>
        </div>
        <div className="crm-thread-state">
          {conversation.escalatedAt ? (
            <span className="crm-tag warn" title={conversation.escalationReason ?? undefined}>
              Escalada
            </span>
          ) : null}
          {/* La ventana define si podés escribir: va como dato de primer nivel. */}
          {countdown ? (
            <span className="crm-window open" title={conversation.window.description}>
              <IconClock size={14} /> {countdown} de ventana
            </span>
          ) : (
            <span className="crm-window closed" title={conversation.window.description}>
              <IconLock size={14} /> Ventana cerrada
            </span>
          )}
        </div>
      </header>

      <div className="crm-thread-body">
        {loading && sent.length === 0 ? (
          <Loading label="Cargando conversación…" />
        ) : sent.length === 0 ? (
          <p className="crm-list-empty">Todavía no hay mensajes en esta conversación.</p>
        ) : (
          sent.map((message) => {
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
                      <p className="crm-bubble-media"><IconPaperclip size={13} /> {message.mediaFilename}</p>
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
