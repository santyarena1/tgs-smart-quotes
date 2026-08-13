"use client";

import {useEffect, useMemo, useState} from "react";
import {api} from "../lib/api";
import type {NavId} from "../lib/types";
import {Alert, Checkbox, Field, Modal} from "./shared";

// Definido local en el web para no depender del build de @tgs/contracts.
export type NavPreferences = {
  version: 1;
  groups: {id: string; label: string; collapsed: boolean}[];
  items: {id: NavId; groupId: string; order: number; hidden: boolean}[];
};

export type SidebarNavGroup = {id: string; label: string; items: {id: NavId; label: string; icon: string}[]};
type Props = {userId: string; groups: SidebarNavGroup[]; active: NavId; onNavigate: (id: NavId) => void};

function defaults(groups: SidebarNavGroup[]): NavPreferences {
  return {version: 1, groups: groups.map((group) => ({id: group.id, label: group.label, collapsed: true})), items: groups.flatMap((group) => group.items.map((item, order) => ({id: item.id, groupId: group.id, order, hidden: false})))};
}

function effective(groups: SidebarNavGroup[], stored: NavPreferences | null): NavPreferences {
  const base = defaults(groups);
  if (!stored || stored.version !== 1) return base;
  const allowed = new Set(base.items.map((item) => item.id));
  const resultGroups = stored.groups.map((group) => ({...group}));
  const groupIds = new Set(resultGroups.map((group) => group.id));
  for (const group of base.groups) if (!groupIds.has(group.id)) { resultGroups.push(group); groupIds.add(group.id); }
  const seen = new Set<string>();
  const resultItems = stored.items.filter((item) => allowed.has(item.id) && groupIds.has(item.groupId) && !seen.has(item.id) && seen.add(item.id)).map((item) => ({...item}));
  for (const item of base.items) if (!seen.has(item.id)) resultItems.push(item);
  return {version: 1, groups: resultGroups, items: resultItems};
}

function normalizeOrders(prefs: NavPreferences): NavPreferences {
  return {...prefs, items: prefs.items.map((item) => ({...item, order: prefs.items.filter((other) => other.groupId === item.groupId).sort((a, b) => a.order - b.order).findIndex((other) => other.id === item.id)}))};
}

export function PersonalizableSidebarNav({userId, groups, active, onNavigate}: Props) {
  const [prefs, setPrefs] = useState<NavPreferences>(() => defaults(groups));
  const [storedPrefs, setStoredPrefs] = useState<NavPreferences | null>(null);
  const [draft, setDraft] = useState<NavPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemInfo = useMemo(() => new Map(groups.flatMap((group) => group.items.map((item) => [item.id, item]))), [groups]);

  useEffect(() => {
    let activeRequest = true;
    setPrefs(defaults(groups)); setDraft(null); setError(null);
    void api<NavPreferences | null>("/me/nav-preferences").then((stored) => { if (activeRequest) { setStoredPrefs(stored); setPrefs(effective(groups, stored)); } }).catch(() => { if (activeRequest) setError("No se pudieron cargar tus preferencias."); });
    return () => { activeRequest = false; };
  }, [userId]);

  useEffect(() => {
    setPrefs((current) => effective(groups, storedPrefs ?? current));
    setDraft((current) => current ? effective(groups, current) : null);
  }, [groups, storedPrefs]);

  async function persist(next: NavPreferences) {
    setSaving(true); setError(null);
    try {
      const allowedIds = new Set(groups.flatMap((group) => group.items.map((item) => item.id)));
      const retainedItems = storedPrefs?.items.filter((item) => !allowedIds.has(item.id)) ?? [];
      const requiredGroupIds = new Set(retainedItems.map((item) => item.groupId));
      const retainedGroups = storedPrefs?.groups.filter((group) => requiredGroupIds.has(group.id) && !next.groups.some((candidate) => candidate.id === group.id)) ?? [];
      const payload = normalizeOrders({...next, groups: [...next.groups, ...retainedGroups], items: [...next.items, ...retainedItems]});
      const saved = await api<NavPreferences>("/me/nav-preferences", {method: "PUT", body: payload});
      setStoredPrefs(saved); setPrefs(effective(groups, saved)); return true;
    } catch { setError("No se pudieron guardar tus preferencias."); return false; }
    finally { setSaving(false); }
  }

  function toggleGroup(groupId: string) {
    const next = {...prefs, groups: prefs.groups.map((group) => group.id === groupId ? {...group, collapsed: !group.collapsed} : group)};
    setPrefs(next); void persist(next);
  }

  function updateDraftItem(id: string, update: Partial<NavPreferences["items"][number]>) {
    setDraft((current) => current ? normalizeOrders({...current, items: current.items.map((item) => item.id === id ? {...item, ...update} : item)}) : current);
  }

  function move(id: string, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const item = current.items.find((candidate) => candidate.id === id); if (!item) return current;
      const siblings = current.items.filter((candidate) => candidate.groupId === item.groupId).sort((a, b) => a.order - b.order);
      const other = siblings[siblings.findIndex((candidate) => candidate.id === id) + direction]; if (!other) return current;
      return {...current, items: current.items.map((candidate) => candidate.id === id ? {...candidate, order: other.order} : candidate.id === other.id ? {...candidate, order: item.order} : candidate)};
    });
  }

  function removeGroup(groupId: string) {
    setDraft((current) => {
      if (!current || current.groups.length === 1) return current;
      const destination = current.groups.find((group) => group.id !== groupId)!;
      let order = current.items.filter((item) => item.groupId === destination.id).length;
      return normalizeOrders({...current, groups: current.groups.filter((group) => group.id !== groupId), items: current.items.map((item) => item.groupId === groupId ? {...item, groupId: destination.id, order: order++} : item)});
    });
  }

  const shownGroups = prefs.groups.map((group) => ({...group, items: prefs.items.filter((item) => item.groupId === group.id && !item.hidden).sort((a, b) => a.order - b.order)})).filter((group) => group.items.length > 0);

  return <>
    {shownGroups.map((group) => <div className="nav-group" key={group.id}>
      <button type="button" className="nav-group-label nav-group-toggle" aria-expanded={!group.collapsed} onClick={() => toggleGroup(group.id)}><span>{group.label}</span><span aria-hidden="true">{group.collapsed ? "▸" : "▾"}</span></button>
      {!group.collapsed ? <div className="nav-group-links">{group.items.map((item) => {
        const info = itemInfo.get(item.id); if (!info) return null;
        return <button key={item.id} type="button" className={active === item.id ? "nav-link active" : "nav-link"} onClick={() => onNavigate(item.id)}><span className="ico" aria-hidden="true">{info.icon}</span>{info.label}</button>;
      })}</div> : null}
    </div>)}
    <div className="nav-personalize-row"><button type="button" className="btn-ghost btn-sm" onClick={() => {setError(null); setDraft(structuredClone(prefs));}}>Personalizar</button></div>
    <Modal open={draft !== null} title="Personalizar navegación" wide onClose={() => {if (!saving) setDraft(null);}} footer={<><button type="button" className="btn-ghost btn-sm" disabled={saving} onClick={() => setDraft(null)}>Cancelar</button><button type="button" className="btn-dark btn-sm" disabled={saving || !draft || draft.groups.some((group) => !group.label.trim())} onClick={() => {if (draft) void persist(draft).then((ok) => {if (ok) setDraft(null);});}}>{saving ? "Guardando…" : "Guardar"}</button></>}>
      {draft ? <div className="nav-editor">
        {error ? <Alert>{error}</Alert> : null}
        <section className="nav-editor-section"><div className="nav-editor-heading"><div><h3>Ítems del menú</h3><p>Elegí qué mostrar, su orden y el grupo al que pertenece.</p></div></div>
          <div className="nav-editor-items">{draft.groups.flatMap((group) => draft.items.filter((item) => item.groupId === group.id).sort((a, b) => a.order - b.order)).map((item) => {
            const info = itemInfo.get(item.id); if (!info) return null;
            const siblings = draft.items.filter((candidate) => candidate.groupId === item.groupId).sort((a, b) => a.order - b.order); const index = siblings.findIndex((candidate) => candidate.id === item.id);
            return <div className="nav-editor-item" key={item.id}><Checkbox label={info.label} checked={!item.hidden} onChange={(checked) => updateDraftItem(item.id, {hidden: !checked})}/><div className="nav-editor-item-actions"><button type="button" className="btn-ghost btn-sm" disabled={index === 0} onClick={() => move(item.id, -1)} aria-label={`Subir ${info.label}`}>↑</button><button type="button" className="btn-ghost btn-sm" disabled={index === siblings.length - 1} onClick={() => move(item.id, 1)} aria-label={`Bajar ${info.label}`}>↓</button><select aria-label={`Grupo de ${info.label}`} value={item.groupId} onChange={(event) => updateDraftItem(item.id, {groupId: event.target.value, order: draft.items.filter((candidate) => candidate.groupId === event.target.value).length})}>{draft.groups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}</select></div></div>;
          })}</div>
        </section>
        <section className="nav-editor-section"><div className="nav-editor-heading"><div><h3>Grupos</h3><p>Creá, renombrá o eliminá secciones del menú.</p></div><button type="button" className="btn-ghost btn-sm" onClick={() => setDraft({...draft, groups: [...draft.groups, {id: `grupo-${crypto.randomUUID()}`, label: "Nuevo grupo", collapsed: true}]})}>+ Crear grupo</button></div>
          <div className="nav-editor-groups">{draft.groups.map((group) => <div className="nav-editor-group" key={group.id}><Field label="Nombre del grupo"><input value={group.label} maxLength={100} onChange={(event) => setDraft({...draft, groups: draft.groups.map((candidate) => candidate.id === group.id ? {...candidate, label: event.target.value} : candidate)})}/></Field><Checkbox label="Arranca colapsado" checked={group.collapsed} onChange={(collapsed) => setDraft({...draft, groups: draft.groups.map((candidate) => candidate.id === group.id ? {...candidate, collapsed} : candidate)})}/><button type="button" className="btn-ghost btn-sm" disabled={draft.groups.length === 1} onClick={() => removeGroup(group.id)}>Borrar</button></div>)}</div>
        </section>
      </div> : null}
    </Modal>
  </>;
}
