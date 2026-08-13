"use client";

import {useEffect, useMemo, useState} from "react";
import type {NavPreferences} from "@tgs/contracts";
import {api} from "../lib/api";
import type {NavId} from "../lib/types";

export type SidebarNavGroup = {
  id: string;
  label: string;
  items: {id: NavId; label: string; icon: string}[];
};

type Props = {
  userId: string;
  groups: SidebarNavGroup[];
  active: NavId;
  onNavigate: (id: NavId) => void;
};

function defaults(groups: SidebarNavGroup[]): NavPreferences {
  return {
    version: 1,
    groups: groups.map((group) => ({id: group.id, label: group.label, collapsed: true})),
    items: groups.flatMap((group) => group.items.map((item, order) => ({id: item.id, groupId: group.id, order, hidden: false}))),
  };
}

function effective(groups: SidebarNavGroup[], stored: NavPreferences | null): NavPreferences {
  const base = defaults(groups);
  if (!stored || stored.version !== 1) return base;
  const allowed = new Set(base.items.map((item) => item.id));
  const resultGroups = stored.groups.map((group) => ({...group}));
  const groupIds = new Set(resultGroups.map((group) => group.id));
  for (const group of base.groups) {
    if (!groupIds.has(group.id)) {
      resultGroups.push(group);
      groupIds.add(group.id);
    }
  }
  const seen = new Set<string>();
  const resultItems = stored.items
    .filter((item) => allowed.has(item.id as NavId) && groupIds.has(item.groupId) && !seen.has(item.id) && seen.add(item.id))
    .map((item) => ({...item}));
  for (const item of base.items) {
    if (!seen.has(item.id)) resultItems.push(item);
  }
  return {version: 1, groups: resultGroups, items: resultItems};
}

function normalizeOrders(prefs: NavPreferences): NavPreferences {
  return {
    ...prefs,
    items: prefs.items.map((item) => ({...item, order: prefs.items.filter((other) => other.groupId === item.groupId).sort((a, b) => a.order - b.order).findIndex((other) => other.id === item.id)})),
  };
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
    setPrefs(defaults(groups));
    setDraft(null);
    void api<NavPreferences | null>("/me/nav-preferences")
      .then((stored) => { if (activeRequest) { setStoredPrefs(stored); setPrefs(effective(groups, stored)); } })
      .catch(() => { if (activeRequest) setError("No se pudieron cargar tus preferencias."); });
    return () => { activeRequest = false; };
  }, [userId]); // Los cambios de flags se integran abajo sin volver a pedir al servidor.

  useEffect(() => {
    setPrefs((current) => effective(groups, storedPrefs ?? current));
    setDraft((current) => current ? effective(groups, current) : null);
  }, [groups, storedPrefs]);

  async function persist(next: NavPreferences) {
    setSaving(true);
    setError(null);
    try {
      const allowedIds = new Set(groups.flatMap((group) => group.items.map((item) => item.id)));
      const retainedItems = storedPrefs?.items.filter((item) => !allowedIds.has(item.id as NavId)) ?? [];
      const requiredGroupIds = new Set(retainedItems.map((item) => item.groupId));
      const retainedGroups = storedPrefs?.groups.filter((group) => requiredGroupIds.has(group.id) && !next.groups.some((candidate) => candidate.id === group.id)) ?? [];
      const payload = normalizeOrders({...next, groups: [...next.groups, ...retainedGroups], items: [...next.items, ...retainedItems]});
      const saved = await api<NavPreferences>("/me/nav-preferences", {method: "PUT", body: payload});
      setStoredPrefs(saved);
      setPrefs(effective(groups, saved));
      return true;
    } catch {
      setError("No se pudieron guardar tus preferencias.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function toggleGroup(groupId: string) {
    const next = {...prefs, groups: prefs.groups.map((group) => group.id === groupId ? {...group, collapsed: !group.collapsed} : group)};
    setPrefs(next);
    void persist(next);
  }

  function updateDraftItem(id: string, update: Partial<NavPreferences["items"][number]>) {
    setDraft((current) => current ? normalizeOrders({...current, items: current.items.map((item) => item.id === id ? {...item, ...update} : item)}) : current);
  }

  function move(id: string, direction: -1 | 1) {
    setDraft((current) => {
      if (!current) return current;
      const item = current.items.find((candidate) => candidate.id === id);
      if (!item) return current;
      const siblings = current.items.filter((candidate) => candidate.groupId === item.groupId).sort((a, b) => a.order - b.order);
      const index = siblings.findIndex((candidate) => candidate.id === id);
      const other = siblings[index + direction];
      if (!other) return current;
      return {...current, items: current.items.map((candidate) => candidate.id === id ? {...candidate, order: other.order} : candidate.id === other.id ? {...candidate, order: item.order} : candidate)};
    });
  }

  const shownGroups = prefs.groups.map((group) => ({
    ...group,
    items: prefs.items.filter((item) => item.groupId === group.id && !item.hidden).sort((a, b) => a.order - b.order),
  })).filter((group) => group.items.length > 0);

  if (draft) return (
    <div className="nav-customizer">
      <div className="nav-customizer-title"><strong>Personalizar menú</strong></div>
      {draft.groups.map((group) => {
        const items = draft.items.filter((item) => item.groupId === group.id).sort((a, b) => a.order - b.order);
        return <section className="nav-customizer-group" key={group.id}>
          <input aria-label="Nombre del grupo" value={group.label} maxLength={100} onChange={(event) => setDraft({...draft, groups: draft.groups.map((candidate) => candidate.id === group.id ? {...candidate, label: event.target.value} : candidate)})}/>
          {items.map((item, index) => {
            const info = itemInfo.get(item.id as NavId);
            if (!info) return null;
            return <div className="nav-customizer-item" key={item.id}>
              <label><input type="checkbox" checked={!item.hidden} onChange={(event) => updateDraftItem(item.id, {hidden: !event.target.checked})}/> {info.label}</label>
              <div className="nav-customizer-controls">
                <button type="button" className="btn-ghost btn-sm" disabled={index === 0} onClick={() => move(item.id, -1)} aria-label={`Subir ${info.label}`}>↑</button>
                <button type="button" className="btn-ghost btn-sm" disabled={index === items.length - 1} onClick={() => move(item.id, 1)} aria-label={`Bajar ${info.label}`}>↓</button>
                <select aria-label={`Grupo de ${info.label}`} value={item.groupId} onChange={(event) => updateDraftItem(item.id, {groupId: event.target.value, order: draft.items.filter((candidate) => candidate.groupId === event.target.value).length})}>
                  {draft.groups.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
                </select>
              </div>
            </div>;
          })}
        </section>;
      })}
      <button type="button" className="btn-ghost btn-sm" onClick={() => setDraft({...draft, groups: [...draft.groups, {id: `grupo-${crypto.randomUUID()}`, label: "Nuevo grupo", collapsed: true}]})}>+ Crear grupo</button>
      {error ? <small className="nav-customizer-error">{error}</small> : null}
      <div className="nav-customizer-actions">
        <button type="button" className="btn-ghost btn-sm" disabled={saving} onClick={() => setDraft(null)}>Cancelar</button>
        <button type="button" className="btn-dark btn-sm" disabled={saving || draft.groups.some((group) => !group.label.trim())} onClick={() => void persist(draft).then((ok) => {if (ok) setDraft(null);})}>{saving ? "Guardando…" : "Guardar"}</button>
      </div>
    </div>
  );

  return <>
    <div className="nav-personalize-row"><button type="button" className="btn-ghost btn-sm" onClick={() => setDraft(structuredClone(prefs))}>⚙ Personalizar</button></div>
    {error ? <small className="nav-customizer-error">{error}</small> : null}
    {shownGroups.map((group) => <div className="nav-group" key={group.id}>
      <button type="button" className="nav-group-label nav-group-toggle" aria-expanded={!group.collapsed} onClick={() => toggleGroup(group.id)}>
        <span>{group.label}</span><span aria-hidden="true">{group.collapsed ? "▸" : "▾"}</span>
      </button>
      {!group.collapsed ? <div className="nav-group-links">{group.items.map((item) => {
        const info = itemInfo.get(item.id as NavId);
        if (!info) return null;
        return <button key={item.id} type="button" className={active === item.id ? "nav-link active" : "nav-link"} onClick={() => onNavigate(item.id as NavId)}><span className="ico" aria-hidden="true">{info.icon}</span>{info.label}</button>;
      })}</div> : null}
    </div>)}
  </>;
}
