"use client";

import {FormEvent, KeyboardEvent, useEffect, useState} from "react";
import {api} from "../lib/api";
import type {ChatbotResponseEntry, ChatbotSettings, Quote} from "../lib/types";
import {Alert, Checkbox, Field, Loading, Tabs, errorMessage} from "./shared";

const uid=()=>globalThis.crypto?.randomUUID?.()??`respuesta-${Date.now()}-${Math.random()}`;
const splitLines=(value:string)=>value.split("\n").map(item=>item.trim()).filter(Boolean);
const emptyAttachments=()=>({imageUrl:null,url:null,quote:null});
type AiModelOption={id:string;created:number;ownedBy:string};
type TabId="identity"|"responses"|"when"|"advanced";
const modelEfficiencyHint=(id:string)=>/(nano|mini|small|flash)/i.test(id)?"económico/eficiente":null;
const DAYS=[
  ["monday","Lunes"],["tuesday","Martes"],["wednesday","Miércoles"],
  ["thursday","Jueves"],["friday","Viernes"],["saturday","Sábado"],["sunday","Domingo"],
] as const;

function ListEditor({label,values,onChange,hint}:{label:string;values:string[];onChange:(values:string[])=>void;hint?:string}) {
  return <Field label={label} hint={hint}>
    <textarea rows={4} value={values.join("\n")} onChange={event=>onChange(splitLines(event.target.value))} placeholder="Una opción por línea"/>
  </Field>;
}

function ActivatorInput({values,onChange}:{values:string[];onChange:(values:string[])=>void}) {
  const [draft,setDraft]=useState("");
  const commit=(raw=draft)=>{
    const additions=raw.split(",").map(value=>value.trim()).filter(Boolean);
    if(!additions.length)return;
    onChange([...new Set([...values,...additions])]);
    setDraft("");
  };
  const onKeyDown=(event:KeyboardEvent<HTMLInputElement>)=>{
    if(event.key===","||event.key==="Enter"){
      event.preventDefault();
      commit();
    }else if(event.key==="Backspace"&&!draft&&values.length){
      event.preventDefault();
      onChange(values.slice(0,-1));
    }
  };
  return <div className="form-grid">
    <div className="toolbar" style={{justifyContent:"flex-start",gap:8}}>
      {values.map(value=><span key={value} style={{display:"inline-flex",alignItems:"center",gap:4,border:"1px solid var(--border, #d7dce3)",borderRadius:999,padding:"0.2rem 0.35rem 0.2rem 0.65rem",background:"var(--surface, #f5f7fa)"}}>
        {value}
        <button type="button" className="btn-ghost btn-sm" aria-label={`Quitar ${value}`} onClick={()=>onChange(values.filter(item=>item!==value))}>×</button>
      </span>)}
    </div>
    <div className="toolbar">
      <input
        value={draft}
        placeholder="Palabra o frase completa"
        onChange={event=>{
          const value=event.target.value;
          if(value.includes(","))commit(value);
          else setDraft(value);
        }}
        onPaste={event=>{
          const pasted=event.clipboardData.getData("text");
          if(!pasted.includes(","))return;
          event.preventDefault();
          commit(`${draft}${draft?",":""}${pasted}`);
        }}
        onKeyDown={onKeyDown}
      />
      <button type="button" className="btn-ghost" disabled={!draft.trim()} onClick={()=>commit()}>+ Agregar</button>
    </div>
    <p className="section-note">Escribí una palabra o frase y presioná coma, Enter o “+ Agregar”. Backspace elimina el último activador si el campo está vacío.</p>
  </div>;
}

function ResponseAttachmentsEditor({
  response,
  onChange,
  onError,
}:{
  response:ChatbotResponseEntry;
  onChange:(attachments:ChatbotResponseEntry["attachments"])=>void;
  onError:(message:string)=>void;
}) {
  const [query,setQuery]=useState("");
  const [quotes,setQuotes]=useState<Quote[]>([]);
  const [busy,setBusy]=useState(false);
  const selected=quotes.find(item=>item.id===response.attachments.quote?.familyId);
  const quote=response.attachments.quote;
  const versions=selected?.versions??[];

  useEffect(()=>{
    const familyId=quote?.familyId;
    if(!familyId||quotes.some(item=>item.id===familyId))return;
    void api<Quote>(`/quotes/${familyId}`)
      .then(item=>setQuotes(current=>current.some(value=>value.id===item.id)?current:[item,...current]))
      .catch(()=>undefined);
  },[quote?.familyId,quotes]);

  async function search(){
    if(!query.trim())return;
    setBusy(true);
    try{
      const result=await api<{items:Quote[]}>("/quotes/search",{query:{q:query.trim(),page:1,pageSize:10}});
      setQuotes(result.items);
    }catch(error){onError(errorMessage(error))}
    finally{setBusy(false)}
  }

  async function upload(file:File|null){
    if(!file)return;
    setBusy(true);
    try{
      const form=new FormData();
      form.append("file",file);
      const request=await fetch("/api/chatbot/settings/rule-image",{method:"POST",body:form,credentials:"include"});
      const payload=await request.json().catch(()=>null) as {url?:string;message?:string}|null;
      if(!request.ok||!payload?.url)throw new Error(payload?.message??"No se pudo subir la imagen");
      onChange({...response.attachments,imageUrl:payload.url});
    }catch(error){onError(errorMessage(error))}
    finally{setBusy(false)}
  }

  return <details>
    <summary>Adjuntos opcionales</summary>
    <div className="card card-pad form-grid" style={{marginTop:8}}>
      <Field label="URL" hint="Se agrega al final de la respuesta.">
        <input type="url" value={response.attachments.url??""} placeholder="https://…" onChange={event=>onChange({...response.attachments,url:event.target.value||null})}/>
      </Field>
      <Field label="Imagen" hint="PNG, JPG, WEBP o GIF; máximo 5 MB.">
        <div className="form-actions">
          <label className="btn-ghost" style={{cursor:busy?"wait":"pointer"}}>
            {busy?"Procesando…":response.attachments.imageUrl?"Cambiar imagen":"Subir imagen"}
            <input hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={event=>{const file=event.target.files?.[0]??null;event.target.value="";void upload(file)}}/>
          </label>
          {response.attachments.imageUrl?<>
            <a href={response.attachments.imageUrl} target="_blank" rel="noreferrer">Ver imagen</a>
            <button type="button" className="btn-danger btn-sm" onClick={()=>onChange({...response.attachments,imageUrl:null})}>Quitar</button>
          </>:null}
        </div>
      </Field>
      <Field label="Presupuesto" hint="Buscá por número, cliente o nombre interno.">
        <div className="toolbar">
          <input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Ej.: 34" onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();void search()}}}/>
          <button type="button" className="btn-ghost" disabled={busy||!query.trim()} onClick={()=>void search()}>Buscar</button>
        </div>
      </Field>
      {quotes.length?<Field label="Resultado">
        <select value={quote?.familyId??""} onChange={event=>{
          const family=quotes.find(item=>item.id===event.target.value);
          onChange({...response.attachments,quote:family?{familyId:family.id,version:family.activeVersion,useLatest:false}:null});
        }}>
          <option value="">Sin presupuesto</option>
          {quotes.map(item=><option key={item.id} value={item.id}>{item.visibleNumber} · {item.internalName}</option>)}
        </select>
      </Field>:null}
      {quote?<div className="grid-2">
        <Checkbox label="Usar siempre la última versión" checked={quote.useLatest} onChange={useLatest=>onChange({...response.attachments,quote:{...quote,useLatest,version:useLatest?null:(quote.version??selected?.activeVersion??1)}})}/>
        {!quote.useLatest?<Field label="Versión fijada">
          <select value={quote.version??selected?.activeVersion??1} onChange={event=>onChange({...response.attachments,quote:{...quote,version:Number(event.target.value)}})}>
            {(versions.length?versions.map(item=>item.version):[quote.version??1]).map(version=><option key={version} value={version}>V{version}</option>)}
          </select>
        </Field>:<p className="section-note">La versión activa se resuelve justo antes de responder.</p>}
      </div>:null}
    </div>
  </details>;
}

export function ChatbotSettingsSection() {
  const [settings,setSettings]=useState<ChatbotSettings|null>(null);
  const [activeTab,setActiveTab]=useState<TabId>("identity");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [models,setModels]=useState<AiModelOption[]>([]);
  const [modelsBusy,setModelsBusy]=useState(false);

  useEffect(()=>{
    api<ChatbotSettings>("/chatbot/settings")
      .then(setSettings)
      .catch(reason=>setError(errorMessage(reason)))
      .finally(()=>setLoading(false));
  },[]);

  if(loading)return <Loading/>;
  if(!settings)return <Alert>{error??"No se pudo cargar la configuración del chatbot."}</Alert>;

  const patchResponse=(id:string,values:Partial<ChatbotResponseEntry>)=>setSettings({
    ...settings,
    responses:settings.responses.map(response=>response.id===id?{...response,...values}:response),
  });

  async function loadModels(){
    setModelsBusy(true);setError(null);
    try{
      const result=await api<{models:AiModelOption[]}>("/settings/ai/models");
      setModels(result.models);
      setNotice(`Modelos disponibles: ${result.models.length}. Las etiquetas de eficiencia son orientativas.`);
    }catch(reason){setError(errorMessage(reason))}
    finally{setModelsBusy(false)}
  }

  async function save(event:FormEvent){
    event.preventDefault();
    if(!settings)return;
    setSaving(true);setError(null);setNotice(null);
    try{
      const {id:_id,updatedAt:_updatedAt,...body}=settings;
      const next=await api<ChatbotSettings>("/chatbot/settings",{method:"PUT",body});
      setSettings(next);
      setNotice(next.enabled
        ?"Configuración guardada. Las respuestas del bot están encendidas."
        :"Configuración guardada. Las respuestas del bot están apagadas.");
    }catch(reason){setError(errorMessage(reason))}
    finally{setSaving(false)}
  }

  const tabs:Array<{id:TabId;label:string}>=[
    {id:"identity",label:"Identidad"},{id:"responses",label:"Respuestas"},{id:"when",label:"Cuándo actúa"},{id:"advanced",label:"Avanzado"},
  ];

  return <form className="form-grid" onSubmit={save} style={{maxWidth:980}}>
    {error?<Alert>{error}</Alert>:null}
    {notice?<Alert tone="ok">{notice}</Alert>:null}
    <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab}/>

    {activeTab==="identity"?<section className="card card-pad form-grid">
      <div><h3 className="panel-title">Identidad del bot</h3><p className="section-note">Cómo habla, cómo abre una conversación y cómo la cierra.</p></div>
      <Field label="Persona e instrucciones de tono" hint="Describí modismos, nivel técnico, trato, vocabulario y cosas que nunca debe decir.">
        <textarea rows={7} required value={settings.persona} onChange={event=>setSettings({...settings,persona:event.target.value})}/>
      </Field>
      <div className="grid-2">
        <ListEditor label="Saludos de apertura" values={settings.openingMessages} onChange={openingMessages=>setSettings({...settings,openingMessages})}/>
        <ListEditor label="Mensajes de cierre" values={settings.closingMessages} onChange={closingMessages=>setSettings({...settings,closingMessages})}/>
      </div>
      <div className="grid-3">
        <Field label="Largo de respuesta">
          <select value={settings.responseStyle.length} onChange={event=>setSettings({...settings,responseStyle:{...settings.responseStyle,length:event.target.value as ChatbotSettings["responseStyle"]["length"]}})}>
            <option value="SHORT">Breve</option><option value="MEDIUM">Media</option><option value="DETAILED">Detallada</option>
          </select>
        </Field>
        <Field label="Máximo de caracteres"><input type="number" min={80} max={4000} value={settings.responseStyle.maxCharacters} onChange={event=>setSettings({...settings,responseStyle:{...settings.responseStyle,maxCharacters:Number(event.target.value)}})}/></Field>
        <Field label="Emojis">
          <select value={settings.responseStyle.emoji} onChange={event=>setSettings({...settings,responseStyle:{...settings.responseStyle,emoji:event.target.value as ChatbotSettings["responseStyle"]["emoji"]}})}>
            <option value="NONE">Sin emojis</option><option value="SPARING">Ocasionales</option><option value="NATURAL">Naturales</option>
          </select>
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Párrafos">
          <select value={settings.responseStyle.paragraphs} onChange={event=>setSettings({...settings,responseStyle:{...settings.responseStyle,paragraphs:event.target.value as ChatbotSettings["responseStyle"]["paragraphs"]}})}>
            <option value="COMPACT">Compacto</option><option value="SHORT">Párrafos cortos</option><option value="FREE">Libre</option>
          </select>
        </Field>
        <Checkbox label="Evitar repeticiones literales" checked={settings.responseStyle.avoidRepetition} onChange={avoidRepetition=>setSettings({...settings,responseStyle:{...settings.responseStyle,avoidRepetition}})}/>
      </div>
    </section>:null}

    {activeTab==="responses"?<section className="card card-pad form-grid">
      <div className="toolbar">
        <div><h3 className="panel-title">Respuestas</h3><p className="section-note">Información autorizada que se activa por palabras o frases. Si coinciden varias, gana la de mayor similitud.</p></div>
        <button type="button" onClick={()=>setSettings({...settings,responses:[...settings.responses,{
          id:uid(),enabled:true,activators:[],similarityThreshold:90,answer:"",context:"",attachments:emptyAttachments(),
        }]})}>+ Agregar respuesta</button>
      </div>
      {settings.responses.length===0?<Alert tone="info">Todavía no configuraste respuestas.</Alert>:null}
      {settings.responses.map((response,index)=><article className="card card-pad form-grid" key={response.id}>
        <div className="toolbar">
          <strong>Respuesta #{index+1}</strong>
          <div className="form-actions">
            <Checkbox label="Activa" checked={response.enabled} onChange={enabled=>patchResponse(response.id,{enabled})}/>
            <button type="button" className="btn-danger btn-sm" onClick={()=>setSettings({...settings,responses:settings.responses.filter(item=>item.id!==response.id)})}>Eliminar</button>
          </div>
        </div>
        <Field label="Palabras o frases activadoras">
          <ActivatorInput values={response.activators} onChange={activators=>patchResponse(response.id,{activators})}/>
        </Field>
        <Field label={`Similitud mínima: ${response.similarityThreshold}%`} hint="Ejemplo: con 85%, “formas de pago” puede reconocer “qué medios de pago aceptan”. Una coincidencia directa siempre activa.">
          <input type="range" min={0} max={100} step={1} value={response.similarityThreshold} onChange={event=>patchResponse(response.id,{similarityThreshold:Number(event.target.value)})}/>
        </Field>
        <Field label="Respuesta concisa" hint="La información central y autorizada que el bot debe transmitir.">
          <textarea rows={4} required value={response.answer} onChange={event=>patchResponse(response.id,{answer:event.target.value})}/>
        </Field>
        <Field label="Contexto extra (opcional)" hint="Ayuda al modelo a entender el tema y redactar natural. No se repite textualmente ni reemplaza la respuesta concisa.">
          <textarea rows={3} value={response.context} onChange={event=>patchResponse(response.id,{context:event.target.value})}/>
        </Field>
        <ResponseAttachmentsEditor response={response} onError={setError} onChange={attachments=>patchResponse(response.id,{attachments})}/>
      </article>)}
    </section>:null}

    {activeTab==="when"?<section className="card card-pad form-grid">
      <div><h3 className="panel-title">Cuándo actúa</h3><p className="section-note">Activación, modos, horarios y situaciones que requieren una persona.</p></div>
      <Alert tone={settings.enabled?"info":"error"}>{settings.enabled?"Las respuestas del bot están encendidas.":"Las respuestas del bot están apagadas; no procesará ni enviará mensajes."}</Alert>
      <div className="grid-2">
        <Checkbox label="Respuestas del bot encendidas" checked={settings.enabled} onChange={enabled=>setSettings({...settings,enabled})}/>
        <Field label="Modo global predeterminado">
          <select value={settings.defaultMode} onChange={event=>setSettings({...settings,defaultMode:event.target.value as ChatbotSettings["defaultMode"]})}>
            <option value="OFF">Apagado</option><option value="SUGGEST">Solo sugerir</option><option value="AUTO">Automático</option>
          </select>
        </Field>
      </div>
      <ListEditor label="Mensajes automáticos de Meta a ignorar" values={settings.ignoredAutoMessages} hint="Una bienvenida por línea. No cuentan como una respuesta real del negocio." onChange={ignoredAutoMessages=>setSettings({...settings,ignoredAutoMessages})}/>
      <hr/>
      <Checkbox label="Aplicar horario comercial" checked={settings.businessHours.enabled} onChange={enabled=>setSettings({...settings,businessHours:{...settings.businessHours,enabled}})}/>
      <div className="grid-2">
        <Field label="Zona horaria"><input value={settings.businessHours.timezone} onChange={event=>setSettings({...settings,businessHours:{...settings.businessHours,timezone:event.target.value}})}/></Field>
        <Field label="Fuera de horario">
          <select value={settings.outsideHoursBehavior.mode} onChange={event=>setSettings({...settings,outsideHoursBehavior:{...settings.outsideHoursBehavior,mode:event.target.value as ChatbotSettings["outsideHoursBehavior"]["mode"]}})}>
            <option value="OFF">No responder</option><option value="STALL">Respuesta natural de espera</option><option value="NORMAL">Responder normalmente</option>
          </select>
        </Field>
      </div>
      <Field label="Mensaje permitido fuera de horario"><textarea rows={3} value={settings.outsideHoursBehavior.message} onChange={event=>setSettings({...settings,outsideHoursBehavior:{...settings.outsideHoursBehavior,message:event.target.value}})}/></Field>
      <div className="form-grid">{DAYS.map(([key,label])=>{
        const first=settings.businessHours.schedule[key][0];
        const active=Boolean(first);
        return <div className="grid-3" key={key}>
          <Checkbox label={label} checked={active} onChange={enabled=>setSettings({...settings,businessHours:{...settings.businessHours,schedule:{...settings.businessHours.schedule,[key]:enabled?(first?[first]:[{from:"09:00",to:"18:00"}]):[]}}})}/>
          <Field label="Desde"><input type="time" disabled={!active} value={first?.from??"09:00"} onChange={event=>setSettings({...settings,businessHours:{...settings.businessHours,schedule:{...settings.businessHours.schedule,[key]:[{from:event.target.value,to:first?.to??"18:00"}]}}})}/></Field>
          <Field label="Hasta"><input type="time" disabled={!active} value={first?.to??"18:00"} onChange={event=>setSettings({...settings,businessHours:{...settings.businessHours,schedule:{...settings.businessHours.schedule,[key]:[{from:first?.from??"09:00",to:event.target.value}]}}})}/></Field>
        </div>;
      })}</div>
      <hr/>
      <h4>Escalación silenciosa</h4>
      <ListEditor label="Palabras o frases que pausan el bot" values={settings.escalationKeywords} hint="Una coincidencia pausa el chat y avisa internamente." onChange={escalationKeywords=>setSettings({...settings,escalationKeywords})}/>
      <Field label="Criterios para pedir intervención humana"><textarea rows={5} required value={settings.escalationInstructions} onChange={event=>setSettings({...settings,escalationInstructions:event.target.value})}/></Field>
      <Checkbox label="Permitir que el modelo pida intervención cuando no puede resolver con seguridad" checked={settings.modelCanEscalate} onChange={modelCanEscalate=>setSettings({...settings,modelCanEscalate})}/>
      <hr/>
      <div><h4 className="panel-title">Recontactos</h4><p className="section-note">Retoma conversaciones en las que el último mensaje fue del negocio y el cliente todavía no respondió.</p></div>
      <Checkbox label="Activar recontactos" checked={settings.recontactEnabled} onChange={recontactEnabled=>setSettings({...settings,recontactEnabled})}/>
      <div className="grid-2">
        <Field label="Días sin respuesta para recontactar">
          <input type="number" min={1} max={365} value={settings.recontactDays} onChange={event=>setSettings({...settings,recontactDays:Number(event.target.value)})}/>
        </Field>
        <Field label="Máximo de recontactos por conversación">
          <input type="number" min={0} max={10} value={settings.recontactMaxAttempts} onChange={event=>setSettings({...settings,recontactMaxAttempts:Number(event.target.value)})}/>
        </Field>
      </div>
      <Field label="Prompt de recontacto (contexto para la IA)">
        <textarea rows={4} value={settings.recontactPrompt} placeholder="Retomá la conversación de forma cordial, recordá que dejamos un presupuesto y preguntá si sigue interesado." onChange={event=>setSettings({...settings,recontactPrompt:event.target.value})}/>
      </Field>
    </section>:null}

    {activeTab==="advanced"?<section className="card card-pad form-grid">
      <div><h3 className="panel-title">Avanzado</h3><p className="section-note">Ajustes técnicos. Los valores actuales son seguros para el uso normal.</p></div>
      <div className="grid-2">
        <Field label="Modelo del chatbot" hint="Heredar usa el modelo global de Configuración → IA.">
          <select value={settings.model??""} onChange={event=>setSettings({...settings,model:event.target.value||null})}>
            <option value="">Heredar modelo global</option>
            {settings.model&&!models.some(model=>model.id===settings.model)?<option value={settings.model}>{settings.model} (actual)</option>:null}
            {models.map(model=><option key={model.id} value={model.id}>{model.id}{modelEfficiencyHint(model.id)?` · ${modelEfficiencyHint(model.id)}`:""}</option>)}
          </select>
        </Field>
        <div className="form-actions" style={{alignItems:"end"}}><button type="button" className="btn-ghost" disabled={modelsBusy} onClick={()=>void loadModels()}>{modelsBusy?"Consultando OpenAI…":"Cargar modelos disponibles"}</button></div>
      </div>
      <div className="grid-2">
        <Field label="Escaneo cada (segundos)" hint="Frecuencia con la que la extensión revisa chats pendientes."><input type="number" min={3} max={120} value={settings.scanIntervalSeconds} onChange={event=>setSettings({...settings,scanIntervalSeconds:Number(event.target.value)})}/></Field>
        <Field label="Mensajes recientes para contexto" hint="Cantidad máxima de mensajes visibles que se envían para entender la conversación."><input type="number" min={0} max={50} value={settings.maxRecentSnippets} onChange={event=>setSettings({...settings,maxRecentSnippets:Number(event.target.value)})}/></Field>
        <Field label="Demora aleatoria máxima (segundos)" hint="En AUTO espera un valor entre 0 y este máximo antes de enviar."><input type="number" min={0} max={120} value={settings.autoDelayMaxSeconds} onChange={event=>setSettings({...settings,autoDelayMaxSeconds:Number(event.target.value)})}/></Field>
        <Field label="Reutilizar desde esta similitud (%)" hint="Ahorra tokens usando una respuesta histórica equivalente. 0 lo desactiva."><input type="number" min={0} max={100} value={settings.reuseSimilarityThreshold} onChange={event=>setSettings({...settings,reuseSimilarityThreshold:Number(event.target.value)})}/></Field>
        <Field label="Actualizar memoria cada (mensajes)" hint="Frecuencia de actualización del resumen de conversaciones largas."><input type="number" min={2} max={100} value={settings.summaryRefreshEvery} onChange={event=>setSettings({...settings,summaryRefreshEvery:Number(event.target.value)})}/></Field>
        <Field label="Confirmación de envío (ms)" hint="Cuánto espera la extensión a que WhatsApp confirme un envío automático."><input type="number" min={3000} max={60000} step={1000} value={settings.sendConfirmationTimeoutMs} onChange={event=>setSettings({...settings,sendConfirmationTimeoutMs:Number(event.target.value)})}/></Field>
      </div>
    </section>:null}

    <div className="form-actions"><button type="submit" disabled={saving}>{saving?"Guardando…":"Guardar configuración del chatbot"}</button></div>
  </form>;
}
