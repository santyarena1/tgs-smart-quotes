"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChangelogEntryView } from "../components/ChangelogView";
import { Modal } from "../components/shared";
import { CHANGELOG, currentAppVersion } from "../lib/changelog";

const SEEN_KEY = "changelog_seen_version";

/** Número de versión en la barra de LITE: abre el historial y avisa con un modal cuando hay novedades. */
export function LiteVersion({ enabled }: { enabled: boolean }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const latest = CHANGELOG[0];

  useEffect(() => {
    if (!enabled || !latest) return;
    try {
      if (window.localStorage.getItem(SEEN_KEY) !== latest.version) setPopupOpen(true);
    } catch { /* sin storage */ }
  }, [enabled, latest]);

  const closePopup = useCallback(() => {
    try { if (latest) window.localStorage.setItem(SEEN_KEY, latest.version); } catch { /* sin storage */ }
    setPopupOpen(false);
  }, [latest]);

  // Los modales se dibujan fuera de la barra: la barra flotante tiene efectos (cristal) que atraparían a un modal
  // "fixed" dentro de su caja y lo mostrarían cortado y arriba.
  const modals = (
    <>
      {latest ? <Modal open={popupOpen} title={`Novedades v${latest.version}`} onClose={closePopup}>
        <ChangelogEntryView entry={latest} />
        <p className="lt-changelog-more"><button type="button" className="lt-textlink" onClick={() => { closePopup(); setHistoryOpen(true); }}>Ver historial completo</button></p>
      </Modal> : null}
      <Modal open={historyOpen} title="Historial de novedades" onClose={() => setHistoryOpen(false)} wide>
        <div className="lt-changelog-list">
          {CHANGELOG.map((entry) => <ChangelogEntryView key={entry.version + entry.title} entry={entry} />)}
        </div>
      </Modal>
    </>
  );

  return (
    <>
      <button type="button" className="lt-version" onClick={() => setHistoryOpen(true)} title="Ver las novedades de cada versión">
        v{currentAppVersion()}
      </button>
      {typeof document === "undefined" ? null : createPortal(modals, document.body)}
    </>
  );
}
