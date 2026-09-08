"use client";

import { useEffect, useState } from "react";
import { purgeWhatsappConversations } from "../../lib/api";
import { Alert, Modal, errorMessage } from "../shared";

const PHRASE = "BORRAR TODO";

/**
 * Limpieza masiva de conversaciones.
 *
 * Es destructiva e irreversible, así que sigue el patrón de confirmación
 * escrita: no alcanza con un clic, hay que tipear la frase. Solo la ve un ADMIN
 * y el servidor vuelve a validar el rol y la frase.
 */
export function PurgeDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setConfirm(""); setError(null); }
  }, [open]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await purgeWhatsappConversations(confirm.trim());
      onDone(
        `Se borraron ${result.deleted.conversations} conversaciones, `
        + `${result.deleted.messages} mensajes y ${result.deleted.notifications} notificaciones.`,
      );
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
      title="Borrar todas las conversaciones"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="btn-danger"
            disabled={busy || confirm.trim() !== PHRASE}
            onClick={() => void submit()}
          >
            {busy ? "Borrando…" : "Borrar todo"}
          </button>
        </>
      }
    >
      <div className="crm-modal-stack">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Alert tone="error">
          Esto borra <b>todas</b> las conversaciones con su historial de mensajes, la memoria que el
          bot construyó de cada una y las notificaciones del chatbot. No se puede deshacer.
        </Alert>
        <p className="crm-hint">
          Las solicitudes y los presupuestos que salieron de esas conversaciones <b>no</b> se tocan:
          son datos comerciales y quedan intactos.
        </p>
        <label>
          <span>Escribí <b>{PHRASE}</b> para confirmar</span>
          <input
            className="crm-input"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder={PHRASE}
            autoComplete="off"
          />
        </label>
      </div>
    </Modal>
  );
}
