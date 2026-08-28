"use client";

import {useEffect, useMemo, useState} from "react";
import {createPortal} from "react-dom";
import {api} from "../lib/api";
import type {NavId} from "../lib/types";
import {Alert, Checkbox, Field, Modal} from "./shared";

// Definido local en el web para no depender del build de @tgs/contracts.
export type NavPreferences = {
  version: 1;
  groups: {id: string; label: string; collapsed: boolean}[];
  items: {id: NavId; groupId: string; order: number; hidden: boolean}[];
};

export type SidebarNavGroup = {
  id: string;
  label: string;
  ungrouped?: boolean;
  items: {id: NavId; label: string; icon: string}[];
};
type Props = {userId: string; groups: SidebarNavGroup[]; active: NavId; onNavigate: (id: NavId) => void};

function defaults(groups: SidebarNavGroup[]): NavPreferences {
  return {
    version: 1,
    groups: groups.map((g) => ({id: g.id, label: g.label, collapsed: true})),
    items: groups.flatMap((g) => g.items.map((it, order) => ({id: it.id, groupId: g.id, order, hidden: false}))),
  };
}

/** Combina los grupos permitidos (post-gating) con las preferencias guardadas del usuario. */
function effective(groups: SidebarNavGroup[], stored: NavPreferences | null): NavPreferences {
  const base = defaults(groups);
  if (!stored || stored.version !== 1) return base;
  const allowed = new Set(base.items.map((i) => i.id));
  const resultGroups = stored.groups.map((g) => ({...g}));
  const groupIds = new Set(resultGroups.map((g) => g.id));
  for (const g of base.groups) if (!groupIds.has(g.id)) {resultGroups.push(g); groupIds.add(g.id);}
  const seen = new Set<string>();
  const resultItems = stored.items
    .filter((i) => allowed.has(i.id) && groupIds.has(i.groupId) && !seen.has(i.id) && (seen.add(i.id), true))
    .map((i) => ({...i}));
  for (const i of base.items) if (!seen.has(i.id)) resultItems.push({...i});
  return {version: 1, groups: resultGroups, items: resultItems};
}

/** Reindexa el `order` dentro de cada grupo a 0..n. */
function normalize(prefs: NavPreferences): NavPreferences {
  const byGroup = new Map<string, typeof prefs.items>();
  for (const it of [...prefs.items].sort((a, b) => a.order - b.order)) {
    const arr = byGroup.get(it.groupId) ?? [];
    arr.push(it);
    byGroup.set(it.groupId, arr);
  }
  const items = prefs.items.map((it) => ({
    ...it,
    order: (byGroup.get(it.groupId) ?? []).findIndex((o) => o.id === it.id),
  }));
  return {...prefs, items};
}

export function PersonalizableSidebarNav({userId, groups, active, onNavigate}: Props) {
  const [stored, setStored] = useState<NavPreferences | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null); // acordeón: un solo grupo abierto
  const [draft, setDraft] = useState<NavPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let active = true;
    api<NavPreferences | null>("/me/nav-preferences")
      .then((v) => {if (active) setStored(v && v.version === 1 ? v : null);})
      .catch(() => {/* si falla, se usan los defaults */});
    return () => {active = false;};
  }, [userId]);

  const prefs = useMemo(() => effective(groups, stored), [groups, stored]);
  const info = useMemo(() => new Map(groups.flatMap((g) => g.items.map((it) => [it.id, it] as const))), [groups]);

  const shownGroups = useMemo(
    () =>
      prefs.groups
        .map((g) => ({
          ...g,
          items: prefs.items.filter((i) => i.groupId === g.id && !i.hidden).sort((a, b) => a.order - b.order),
        }))
        .filter((g) => g.items.length > 0),
    [prefs],
  );

  async function save(next: NavPreferences) {
    setSaving(true);
    setError(null);
    try {
      // Conservar ítems/grupos que el usuario hoy no tiene permitidos (por rol/flags) para no perderlos.
      const allowed = new Set(groups.flatMap((g) => g.items.map((it) => it.id)));
      const keepItems = stored?.items.filter((i) => !allowed.has(i.id)) ?? [];
      const keepGroupIds = new Set(keepItems.map((i) => i.groupId));
      const keepGroups = stored?.groups.filter((g) => keepGroupIds.has(g.id) && !next.groups.some((x) => x.id === g.id)) ?? [];
      const payload = normalize({
        version: 1,
        groups: [...next.groups.map((g) => ({...g, collapsed: true})), ...keepGroups],
        items: [...next.items, ...keepItems],
      });
      const saved = await api<NavPreferences>("/me/nav-preferences", {method: "PUT", body: payload});
      setStored(saved && saved.version === 1 ? saved : payload);
      setDraft(null);
    } catch {
      setError("No se pudieron guardar tus preferencias.");
    } finally {
      setSaving(false);
    }
  }

  // ---- edición sobre el draft ----
  function setItem(id: string, patch: Partial<NavPreferences["items"][number]>) {
    setDraft((d) => (d ? normalize({...d, items: d.items.map((i) => (i.id === id ? {...i, ...patch} : i))}) : d));
  }
  function move(id: string, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const it = d.items.find((i) => i.id === id);
      if (!it) return d;
      const sibs = d.items.filter((i) => i.groupId === it.groupId).sort((a, b) => a.order - b.order);
      const idx = sibs.findIndex((i) => i.id === id);
      const other = sibs[idx + dir];
      if (!other) return d;
      return normalize({
        ...d,
        items: d.items.map((i) => (i.id === id ? {...i, order: other.order} : i.id === other.id ? {...i, order: it.order} : i)),
      });
    });
  }
  function addGroup() {
    setDraft((d) => (d ? {...d, groups: [...d.groups, {id: `grupo-${crypto.randomUUID()}`, label: "Nuevo grupo", collapsed: true}]} : d));
  }
  function renameGroup(id: string, label: string) {
    setDraft((d) => (d ? {...d, groups: d.groups.map((g) => (g.id === id ? {...g, label} : g))} : d));
  }
  function removeGroup(id: string) {
    setDraft((d) => {
      if (!d || d.groups.length === 1) return d;
      const dest = d.groups.find((g) => g.id !== id)!;
      let order = d.items.filter((i) => i.groupId === dest.id).length;
      return normalize({
        ...d,
        groups: d.groups.filter((g) => g.id !== id),
        items: d.items.map((i) => (i.groupId === id ? {...i, groupId: dest.id, order: order++} : i)),
      });
    });
  }

  const modal =
    draft !== null && mounted
      ? createPortal(
          <Modal
            open
            wide
            title="Personalizar navegación"
            onClose={() => {if (!saving) setDraft(null);}}
            footer={
              <>
                <button type="button" className="btn-ghost btn-sm" disabled={saving} onClick={() => setDraft(null)}>Cancelar</button>
                <button
                  type="button"
                  className="btn-dark btn-sm"
                  disabled={saving || draft.groups.some((g) => !g.label.trim())}
                  onClick={() => void save(draft)}
                >
                  {saving ? "Guardando…" : "Guardar"}
                </button>
              </>
            }
          >
            <div className="nav-editor">
              {error ? <Alert>{error}</Alert> : null}
              <section className="nav-editor-section">
                <div className="nav-editor-heading">
                  <div><h3>Módulos</h3><p>Elegí qué mostrar, el orden y a qué grupo pertenece cada uno.</p></div>
                </div>
                <div className="nav-editor-items">
                  {draft.groups.flatMap((g) => draft.items.filter((i) => i.groupId === g.id).sort((a, b) => a.order - b.order)).map((item) => {
                    const meta = info.get(item.id);
                    if (!meta) return null;
                    const sibs = draft.items.filter((i) => i.groupId === item.groupId).sort((a, b) => a.order - b.order);
                    const idx = sibs.findIndex((i) => i.id === item.id);
                    return (
                      <div className="nav-editor-item" key={item.id}>
                        <Checkbox label={`${meta.icon}  ${meta.label}`} checked={!item.hidden} onChange={(c) => setItem(item.id, {hidden: !c})} />
                        <div className="nav-editor-item-actions">
                          <button type="button" className="btn-ghost btn-sm" disabled={idx === 0} onClick={() => move(item.id, -1)} aria-label={`Subir ${meta.label}`}>↑</button>
                          <button type="button" className="btn-ghost btn-sm" disabled={idx === sibs.length - 1} onClick={() => move(item.id, 1)} aria-label={`Bajar ${meta.label}`}>↓</button>
                          <select aria-label={`Grupo de ${meta.label}`} value={item.groupId} onChange={(e) => setItem(item.id, {groupId: e.target.value, order: draft.items.filter((i) => i.groupId === e.target.value).length})}>
                            {draft.groups.map((g) => <option key={g.id} value={g.id}>{g.label || "(sin nombre)"}</option>)}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="nav-editor-section">
                <div className="nav-editor-heading">
                  <div><h3>Grupos</h3><p>Creá, renombrá o eliminá secciones del menú.</p></div>
                  <button type="button" className="btn-ghost btn-sm" onClick={addGroup}>+ Crear grupo</button>
                </div>
                <div className="nav-editor-groups">
                  {draft.groups.map((g) => (
                    <div className="nav-editor-group" key={g.id}>
                      <Field label="Nombre del grupo"><input value={g.label} maxLength={100} onChange={(e) => renameGroup(g.id, e.target.value)} /></Field>
                      <button type="button" className="btn-ghost btn-sm" disabled={draft.groups.length === 1} onClick={() => removeGroup(g.id)}>Borrar</button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </Modal>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="nav-groups">
        {shownGroups.map((group) => {
          const catalog = groups.find((g) => g.id === group.id);
          const ungrouped = Boolean(catalog?.ungrouped);
          if (ungrouped) {
            return (
              <div className="nav-group ungrouped" key={group.id}>
                <div className="nav-group-links">
                  {group.items.map((item) => {
                    const meta = info.get(item.id);
                    if (!meta) return null;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={active === item.id ? "nav-link active" : "nav-link"}
                        onClick={() => onNavigate(item.id)}
                      >
                        <span className="ico" aria-hidden="true">{meta.icon}</span>
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }
          const isOpen = openGroup === group.id;
          return (
            <div className={isOpen ? "nav-group open" : "nav-group"} key={group.id}>
              <button
                type="button"
                className="nav-group-toggle"
                aria-expanded={isOpen}
                onClick={() => setOpenGroup(isOpen ? null : group.id)}
              >
                <span>{group.label}</span>
                <span className="nav-group-caret" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen ? (
                <div className="nav-group-links">
                  {group.items.map((item) => {
                    const meta = info.get(item.id);
                    if (!meta) return null;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={active === item.id ? "nav-link active" : "nav-link"}
                        onClick={() => onNavigate(item.id)}
                      >
                        <span className="ico" aria-hidden="true">{meta.icon}</span>
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="nav-personalize-row">
        <button type="button" className="btn-ghost btn-sm" onClick={() => {setError(null); setDraft(structuredClone(prefs));}}>⚙ Personalizar menú</button>
      </div>
      {modal}
    </>
  );
}
