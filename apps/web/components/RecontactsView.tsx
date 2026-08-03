"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  api,
  getRecontactCandidates,
  getRecontactHistory,
  setRecontactOptOut,
} from "../lib/api";
import type { ChatbotSettings, RecontactCandidate, RecontactHistoryItem } from "../lib/types";
import {
  Alert,
  Checkbox,
  EmptyState,
  Field,
  Loading,
  PageHeader,
  Pill,
  Stat,
  StatStrip,
  Tabs,
  errorMessage,
} from "./shared";

type TabId = "pending" | "history";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function truncate(value: string | null, max=180): string {
  if (!value) return "—";
  return value.length > max ? `${value.slice(0,max).trimEnd()}…` : value;
}

export function RecontactsView() {
  const [settings,setSettings]=useState<ChatbotSettings|null>(null);
  const [candidates,setCandidates]=useState<RecontactCandidate[]>([]);
  const [history,setHistory]=useState<RecontactHistoryItem[]>([]);
  const [tab,setTab]=useState<TabId>("pending");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [excluding,setExcluding]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);setError(null);
    try{
      const [nextSettings,nextCandidates,nextHistory]=await Promise.all([
        api<ChatbotSettings>("/chatbot/settings"),
        getRecontactCandidates(),
        getRecontactHistory(),
      ]);
      setSettings(nextSettings);setCandidates(nextCandidates);setHistory(nextHistory);
    }catch(reason){setError(errorMessage(reason))}
    finally{setLoading(false)}
  },[]);

  useEffect(()=>{void load()},[load]);

  async function save(event:FormEvent){
    event.preventDefault();
    if(!settings)return;
    setSaving(true);setError(null);setNotice(null);
    try{
      const {id:_id,updatedAt:_updatedAt,...body}=settings;
      const next=await api<ChatbotSettings>("/chatbot/settings",{method:"PUT",body});
      setSettings(next);setNotice("Configuración de recontactos guardada.");
      const nextCandidates=await getRecontactCandidates();
      setCandidates(nextCandidates);
    }catch(reason){setError(errorMessage(reason))}
    finally{setSaving(false)}
  }

  async function exclude(candidate:RecontactCandidate){
    setExcluding(candidate.chatKey);setError(null);setNotice(null);
    try{
      await setRecontactOptOut(candidate.chatKey,true);
      setNotice(`${candidate.displayName||candidate.chatKey} fue excluido de futuros recontactos.`);
      setCandidates(await getRecontactCandidates());
    }catch(reason){setError(errorMessage(reason))}
    finally{setExcluding(null)}
  }

  return <div>
    <PageHeader eyebrow="Sistema" title="Recontactos" subtitle="Configurá el seguimiento, revisá conversaciones pendientes y medí sus respuestas." actions={<button type="button" className="btn-ghost" onClick={()=>void load()}>Recargar</button>}/>
    {error?<Alert>{error}</Alert>:null}
    {notice?<Alert tone="ok">{notice}</Alert>:null}
    {loading?<Loading/>:null}

    {!loading&&settings?<>
      <form className="card card-pad form-grid" onSubmit={save}>
        <div><h3 className="panel-title">Configuración</h3><p className="section-note">Define cuándo una conversación queda pendiente y cuántas veces puede retomarse.</p></div>
        <Checkbox label="Activar recontactos" checked={settings.recontactEnabled} onChange={recontactEnabled=>setSettings({...settings,recontactEnabled})}/>
        <div className="grid-2">
          <Field label="Días sin respuesta"><input required type="number" min={1} max={365} value={settings.recontactDays} onChange={event=>setSettings({...settings,recontactDays:Number(event.target.value)})}/></Field>
          <Field label="Máximo de intentos"><input required type="number" min={0} max={10} value={settings.recontactMaxAttempts} onChange={event=>setSettings({...settings,recontactMaxAttempts:Number(event.target.value)})}/></Field>
        </div>
        <Field label="Prompt de recontacto" hint="Contexto que usa la IA para redactar el mensaje proactivo."><textarea rows={4} maxLength={5000} value={settings.recontactPrompt} onChange={event=>setSettings({...settings,recontactPrompt:event.target.value})}/></Field>
        <div className="form-actions"><button type="submit" disabled={saving}>{saving?"Guardando…":"Guardar configuración"}</button></div>
      </form>

      <StatStrip>
        <Stat label="Pendientes" value={candidates.length} hint="Conversaciones listas para retomar" accent="var(--info)"/>
        <Stat label="Recontactadas" value={history.length} hint="Conversaciones con al menos un intento" accent="var(--violet)"/>
        <Stat label="Respondieron" value={history.filter(item=>item.repliedAfter).length} hint="Luego del último recontacto" accent="var(--ok)"/>
      </StatStrip>

      <div style={{marginTop:"1rem"}}><Tabs tabs={[{id:"pending",label:"Pendientes"},{id:"history",label:"Historial"}]} active={tab} onChange={setTab}/></div>
      {tab==="pending"?(candidates.length===0?<EmptyState title="Sin recontactos pendientes">No hay conversaciones que cumplan las condiciones actuales.</EmptyState>:<div className="table-wrap"><table><thead><tr><th>Conversación</th><th>Días sin respuesta</th><th>Intentos</th><th></th></tr></thead><tbody>{candidates.map(item=><tr key={item.chatKey}><td><strong>{item.displayName||item.chatKey}</strong>{item.displayName?<div className="muted">{item.chatKey}</div>:null}</td><td>{item.daysSince}</td><td>{item.recontactCount}</td><td className="right"><button type="button" className="btn-ghost btn-sm" disabled={excluding===item.chatKey} onClick={()=>void exclude(item)}>{excluding===item.chatKey?"Excluyendo…":"Excluir"}</button></td></tr>)}</tbody></table></div>):null}
      {tab==="history"?(history.length===0?<EmptyState title="Sin historial">Todavía no se envió ningún recontacto.</EmptyState>:<div className="table-wrap"><table><thead><tr><th>Conversación</th><th>Intentos</th><th>Último recontacto</th><th>Mensaje</th><th>Resultado</th></tr></thead><tbody>{history.map(item=><tr key={item.chatKey}><td><strong>{item.displayName||item.chatKey}</strong></td><td>{item.recontactCount}</td><td>{formatDate(item.lastRecontactAt)}</td><td title={item.lastRecontactText??undefined}>{truncate(item.lastRecontactText)}</td><td><Pill tone={item.repliedAfter?"ok":"neutral"}>{item.repliedAfter?"Respondió":"Sin respuesta"}</Pill></td></tr>)}</tbody></table></div>):null}
    </>:null}
  </div>;
}
