"use client";

import {FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useState} from "react";
import {api} from "../lib/api";
import type {ChatbotResponseEntry, ChatbotSettings, Quote} from "../lib/types";
import {Alert, Checkbox, Field, Loading, Tabs, errorMessage} from "./shared";

const uid=()=>globalThis.crypto?.randomUUID?.()??`respuesta-${Date.now()}-${Math.random()}`;
const splitLines=(value:string)=>value.split("\n").map(item=>item.trim()).filter(Boolean);
const emptyAttachments=()=>({imageUrl:null,url:null,quote:null});
type AiModelOption={id:string;created:number;ownedBy:string};
type TabId="try"|"voice"|"bubbles"|"knowledge"|"hours"|"handoff"|"advanced";
type Mode=ChatbotSettings["defaultMode"];
type DayKey=keyof ChatbotSettings["businessHours"]["schedule"];
const modelEfficiencyHint=(id:string)=>/(nano|mini|small|flash)/i.test(id)?"económico/eficiente":null;
const DAYS:ReadonlyArray<readonly [DayKey,string,string]>=[
  ["monday","Lunes","Lu"],["tuesday","Martes","Ma"],["wednesday","Miércoles","Mi"],
  ["thursday","Jueves","Ju"],["friday","Viernes","Vi"],["saturday","Sábado","Sá"],["sunday","Domingo","Do"],
];
const WEEKDAYS:DayKey[]=["monday","tuesday","wednesday","thursday","friday"];

const MODES:Array<{id:Mode;title:string;text:string}>=[
  {id:"OFF",title:"Apagado",text:"No redacta ni responde. Los chats los atiende una persona."},
  {id:"SUGGEST",title:"Solo sugerir",text:"Redacta la respuesta en la bandeja y una persona la aprueba, la edita o la descarta."},
  {id:"AUTO",title:"Automático",text:"Responde solo, con demoras humanas. Deriva a una persona cuando hace falta."},
];

// --------------------------------------------------------------------- piezas chicas

/** Opciones mutuamente excluyentes como botones: se ven todas de un vistazo. */
function Segmented<T extends string>({value,options,onChange,label}:{value:T;options:Array<{id:T;label:string;hint?:string}>;onChange:(value:T)=>void;label:string}) {
  const current=options.find(option=>option.id===value);
  return <div className="field">
    <span className="field-label">{label}</span>
    <div className="bot-segmented" role="radiogroup" aria-label={label}>
      {options.map(option=><button key={option.id} type="button" role="radio" aria-checked={option.id===value}
        className={option.id===value?"active":""} onClick={()=>onChange(option.id)}>{option.label}</button>)}
    </div>
    {current?.hint?<span className="field-hint">{current.hint}</span>:null}
  </div>;
}

/** Tarjetas de opción con explicación: para las decisiones que cambian el comportamiento. */
function ChoiceCards<T extends string>({value,options,onChange,label}:{value:T;options:Array<{id:T;title:string;text:string}>;onChange:(value:T)=>void;label:string}) {
  return <div className="bot-choices" role="radiogroup" aria-label={label}>
    {options.map(option=><button key={option.id} type="button" role="radio" aria-checked={option.id===value}
      className={`bot-choice${option.id===value?" active":""}`} onClick={()=>onChange(option.id)}>
      <strong>{option.title}</strong>
      <span>{option.text}</span>
    </button>)}
  </div>;
}

function Section({title,note,children,aside}:{title:string;note?:ReactNode;children:ReactNode;aside?:ReactNode}) {
  return <section className="card card-pad form-grid">
    <div className="toolbar" style={{alignItems:"flex-start"}}>
      <div><h3 className="panel-title">{title}</h3>{note?<p className="section-note">{note}</p>:null}</div>
      {aside}
    </div>
    {children}
  </section>;
}

function ListEditor({label,values,onChange,hint,placeholder}:{label:string;values:string[];onChange:(values:string[])=>void;hint?:string;placeholder?:string}) {
  // Se edita como texto crudo para no comerse el salto de línea mientras se escribe.
  const [draft,setDraft]=useState(values.join("\n"));
  useEffect(()=>{if(splitLines(draft).join("\n")!==values.join("\n"))setDraft(values.join("\n"))},[values]);// eslint-disable-line react-hooks/exhaustive-deps
  return <Field label={label} hint={hint}>
    <textarea rows={4} value={draft} placeholder={placeholder??"Una opción por línea"} onChange={event=>{setDraft(event.target.value);onChange(splitLines(event.target.value))}}/>
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
    {values.length?<div className="bot-chips">
      {values.map(value=><span key={value} className="bot-chip">
        {value}
        <button type="button" aria-label={`Quitar ${value}`} onClick={()=>onChange(values.filter(item=>item!==value))}>×</button>
      </span>)}
    </div>:null}
    <div className="toolbar">
      <input
        value={draft}
        placeholder="Ej.: formas de pago, cuotas, mercado pago"
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
    <p className="section-note">Enter o coma para agregar. Podés pegar varias separadas por coma.</p>
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

  const count=[response.attachments.url,response.attachments.imageUrl,response.attachments.quote].filter(Boolean).length;
  return <details className="bot-details" open={count>0}>
    <summary>Adjuntos {count?`(${count})`:"(opcional)"}: link, imagen o PDF de un presupuesto</summary>
    <div className="form-grid" style={{marginTop:10}}>
      <Field label="Link" hint="Se agrega al final de la respuesta.">
        <input type="url" value={response.attachments.url??""} placeholder="https://…" onChange={event=>onChange({...response.attachments,url:event.target.value||null})}/>
      </Field>
      <Field label="Imagen" hint="Sale como un mensaje aparte después del texto. PNG, JPG, WEBP o GIF; máximo 5 MB.">
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
      <Field label="PDF de un presupuesto" hint="Buscá por número, cliente o nombre interno. Sale como documento después del texto.">
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
        <button type="button" className="btn-ghost btn-sm" onClick={()=>onChange({...response.attachments,quote:null})}>Quitar presupuesto</button>
      </div>:null}
    </div>
  </details>;
}

// --------------------------------------------------------------------- vista previa

/** Cómo le llega una respuesta al cliente con la configuración actual de burbujas. */
function BubblePreview({settings}:{settings:ChatbotSettings}) {
  const multi=settings.multiMessage;
  const aiCount=!multi.enabled||multi.splitMode==="FIXED_ONLY"?1:Math.max(1,Math.min(5,multi.maxBubbles));
  const bubbles:Array<{text:string;kind:"fixed"|"ai"}>=[];
  if(multi.enabled&&multi.openingMessage.trim())bubbles.push({text:multi.openingMessage.trim(),kind:"fixed"});
  for(let index=0;index<aiCount;index+=1){
    bubbles.push({kind:"ai",text:aiCount===1?"Respuesta redactada por la IA":`Parte ${index+1} de la respuesta de la IA`});
  }
  if(multi.enabled&&multi.closingMessage.trim())bubbles.push({text:multi.closingMessage.trim(),kind:"fixed"});
  const delay=multi.betweenDelayMinSeconds===multi.betweenDelayMaxSeconds
    ?`${multi.betweenDelayMinSeconds} s`
    :`${multi.betweenDelayMinSeconds}–${multi.betweenDelayMaxSeconds} s`;
  return <div className="bot-phone" aria-label="Vista previa de una respuesta">
    <div className="bot-phone-head">Así le llega al cliente</div>
    <div className="bot-phone-body">
      <div className="bot-bubble in">¿Tienen el Ryzen 5 5600 en stock?</div>
      {settings.autoDelayMaxSeconds>0?<div className="bot-wait">en Automático espera 0–{settings.autoDelayMaxSeconds} s antes de empezar</div>:null}
      {bubbles.map((bubble,index)=><div key={index} className="bot-bubble-group">
        {index>0?<div className="bot-wait">{delay}</div>:null}
        <div className={`bot-bubble out${bubble.kind==="fixed"?" fixed":""}`}>{bubble.text}</div>
      </div>)}
      {multi.enabled&&multi.openingMessage.trim()?<p className="bot-phone-note">La apertura fija sale solo en la primera respuesta del bot en cada chat.</p>:null}
    </div>
  </div>;
}

// --------------------------------------------------------------------- simulador

type SimulationResult={
  action:string;
  messages?:string[];
  reply?:string;
  quoteFollowupMessage?:string|null;
  wouldEscalate?:{reason:string|null};
  attachments?:Array<{image?:{url?:string;filename?:string}|null;quote?:{visibleNumber?:string;version?:number}|null}>;
  reused?:unknown;
  matchedResponseId?:string|null;
  matchedResponseScore?:number|null;
  decisionReason?:string|null;
};
type SimTurn={from:"customer"|"bot"|"system";text:string;detail?:string[]};

const SIM_ACTIONS:Record<string,string>={
  OFF:"El modo general está en Apagado: no respondería.",
  DISABLED:"El bot está apagado: no respondería.",
  OUTSIDE_HOURS:"Fuera del horario comercial, con \"No responder\": no respondería.",
  ESCALATED:"El chat de prueba quedó escalado.",
};

export function Simulator({settings,dirty}:{settings:ChatbotSettings;dirty:boolean}) {
  const [turns,setTurns]=useState<SimTurn[]>([]);
  const [draft,setDraft]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [session,setSession]=useState(()=>`sim:config:${Date.now()}`);

  async function send(){
    const message=draft.trim();
    if(!message)return;
    setBusy(true);setError(null);setDraft("");
    const history=turns.filter(turn=>turn.from!=="system").slice(-12).map(turn=>({
      direction:turn.from==="customer"?"INBOUND" as const:"OUTBOUND" as const,
      text:turn.text,
    }));
    setTurns(current=>[...current,{from:"customer",text:message}]);
    try{
      const result=await api<SimulationResult>("/chatbot/respond",{method:"POST",body:{
        chatKey:session,
        displayName:"Cliente de prueba",
        message,
        messageFingerprint:`${session}:${Date.now()}`,
        simulation:true,
        recentMessages:history,
      }});
      const detail:string[]=[];
      const rule=result.matchedResponseId?settings.responses.findIndex(item=>item.id===result.matchedResponseId):-1;
      const matched=rule>=0?settings.responses[rule]:undefined;
      if(matched)detail.push(`Usó la respuesta #${rule+1} (${matched.activators.slice(0,3).join(", ")||"sin activadores"}) · ${Math.round(result.matchedResponseScore??0)} % de similitud`);
      if(result.reused)detail.push("Reutilizó una respuesta anterior equivalente (no gastó IA)");
      for(const attachment of result.attachments??[]){
        if(attachment.image?.url)detail.push(`Adjuntaría la imagen ${attachment.image.filename??""}`.trim());
        if(attachment.quote)detail.push(`Adjuntaría el PDF ${attachment.quote.visibleNumber??""} V${attachment.quote.version??""}`);
      }
      if(result.quoteFollowupMessage)detail.push(`Después del PDF: "${result.quoteFollowupMessage}"`);
      if(result.decisionReason)detail.push(`Criterio: ${result.decisionReason}`);
      if(result.wouldEscalate){
        setTurns(current=>[...current,{from:"system",text:`Derivaría a una persona: ${result.wouldEscalate?.reason??"sin motivo"}`,detail}]);
      }else if(SIM_ACTIONS[result.action]){
        const text=SIM_ACTIONS[result.action]??result.action;
        setTurns(current=>[...current,{from:"system",text}]);
      }else{
        const bubbles=result.messages?.length?result.messages:result.reply?[result.reply]:[];
        setTurns(current=>[...current,...bubbles.map((text,index)=>({from:"bot" as const,text,detail:index===bubbles.length-1?detail:undefined}))]);
      }
    }catch(reason){setError(errorMessage(reason))}
    finally{setBusy(false)}
  }

  return <Section
    title="Probar el bot"
    note="Escribí como si fueras un cliente y mirá qué contestaría. No se manda nada por WhatsApp ni aparece en la bandeja. Usa la configuración guardada y el modo Automático."
    aside={turns.length?<button type="button" className="btn-ghost btn-sm" onClick={()=>{setTurns([]);setSession(`sim:config:${Date.now()}`)}}>Empezar de nuevo</button>:null}
  >
    {dirty?<Alert tone="info">Tenés cambios sin guardar: la prueba usa lo último que guardaste.</Alert>:null}
    {error?<Alert>{error}</Alert>:null}
    <div className="bot-phone wide">
      <div className="bot-phone-body tall">
        {turns.length===0?<p className="bot-phone-note">Probá con algo real: "¿cuánto sale el Ryzen 5 5600?", "¿hacen envíos?", "quiero hablar con alguien".</p>:null}
        {turns.map((turn,index)=>turn.from==="system"
          ?<div key={index} className="bot-system">{turn.text}{turn.detail?.length?<ul>{turn.detail.map(item=><li key={item}>{item}</li>)}</ul>:null}</div>
          :<div key={index} className="bot-bubble-group">
            <div className={`bot-bubble ${turn.from==="customer"?"in":"out"}`}>{turn.text}</div>
            {turn.detail?.length?<ul className="bot-why">{turn.detail.map(item=><li key={item}>{item}</li>)}</ul>:null}
          </div>)}
        {busy?<div className="bot-typing">El bot está escribiendo…</div>:null}
      </div>
      <div className="bot-phone-input">
        <input value={draft} disabled={busy} placeholder="Escribí un mensaje de cliente…" onChange={event=>setDraft(event.target.value)}
          onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();void send()}}}/>
        <button type="button" disabled={busy||!draft.trim()} onClick={()=>void send()}>{busy?"…":"Enviar"}</button>
      </div>
    </div>
  </Section>;
}

// --------------------------------------------------------------------- respuestas

function ResponseCard({response,index,onPatch,onRemove,onDuplicate,onError}:{
  response:ChatbotResponseEntry;
  index:number;
  onPatch:(values:Partial<ChatbotResponseEntry>)=>void;
  onRemove:()=>void;
  onDuplicate:()=>void;
  onError:(message:string)=>void;
}) {
  const [open,setOpen]=useState(!response.answer);
  const title=response.activators.slice(0,4).join(" · ")||"Respuesta sin activadores";
  return <article className={`bot-rule${response.enabled?"":" off"}`}>
    <header className="bot-rule-head">
      <button type="button" className="bot-rule-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}>
        <span className="bot-rule-index">#{index+1}</span>
        <span className="bot-rule-title">{title}</span>
        {!open&&response.answer?<span className="bot-rule-preview">{response.answer}</span>:null}
      </button>
      <label className="bot-switch" title={response.enabled?"Activa":"Pausada"}>
        <input type="checkbox" checked={response.enabled} onChange={event=>onPatch({enabled:event.target.checked})}/>
        <span>{response.enabled?"Activa":"Pausada"}</span>
      </label>
    </header>
    {open?<div className="form-grid bot-rule-body">
      <Field label="¿Cuándo se usa?" hint="Palabras o frases que dispara el cliente. Si coinciden varias respuestas, gana la más parecida.">
        <ActivatorInput values={response.activators} onChange={activators=>onPatch({activators})}/>
      </Field>
      <Field label={`Qué tan parecido tiene que ser: ${response.similarityThreshold} %`} hint={response.similarityThreshold>=90
        ?"Estricto: casi la misma frase. Una coincidencia exacta siempre activa."
        :response.similarityThreshold>=70
          ?"Flexible: con 80 %, \"formas de pago\" reconoce \"qué medios de pago aceptan\"."
          :"Muy flexible: puede activarse con mensajes que no tienen nada que ver."}>
        <input type="range" min={0} max={100} step={1} value={response.similarityThreshold} onChange={event=>onPatch({similarityThreshold:Number(event.target.value)})}/>
      </Field>
      <Field label="Qué tiene que decir" hint="La información correcta y autorizada. El bot la redacta con su tono, pero no la cambia.">
        <textarea rows={4} required value={response.answer} placeholder="Ej.: Aceptamos efectivo, transferencia y tarjetas hasta 12 cuotas con recargo." onChange={event=>onPatch({answer:event.target.value})}/>
      </Field>
      <Field label="Contexto para el bot (opcional)" hint="Le explica el tema para que conteste mejor. No se copia textual al cliente.">
        <textarea rows={3} value={response.context} placeholder="Ej.: Las cuotas sin interés son solo con bancos adheridos; si pregunta por uno puntual, derivá." onChange={event=>onPatch({context:event.target.value})}/>
      </Field>
      <ResponseAttachmentsEditor response={response} onError={onError} onChange={attachments=>onPatch({attachments})}/>
      <div className="form-actions">
        <button type="button" className="btn-ghost btn-sm" onClick={onDuplicate}>Duplicar</button>
        <button type="button" className="btn-danger btn-sm" onClick={onRemove}>Eliminar</button>
      </div>
    </div>:null}
  </article>;
}

// --------------------------------------------------------------------- horario

const firstRange=(settings:ChatbotSettings,day:DayKey)=>settings.businessHours.schedule[day][0]??null;

function summarizeHours(settings:ChatbotSettings):string {
  if(!settings.businessHours.enabled)return "Todo el día, todos los días";
  // Agrupa días seguidos con el mismo rango: "Lu a Vi 09:00–18:00 · Sá 09:00–13:00".
  const groups:Array<{first:string;last:string;range:string;position:number}>=[];
  DAYS.forEach(([key,,short],position)=>{
    const range=firstRange(settings,key);
    if(!range)return;
    const label=`${range.from}–${range.to}`;
    const previous=groups[groups.length-1];
    if(previous&&previous.range===label&&previous.position===position-1){
      previous.last=short;previous.position=position;
    }else groups.push({first:short,last:short,range:label,position});
  });
  if(!groups.length)return "Ningún día habilitado";
  return groups.map(group=>`${group.first===group.last?group.first:`${group.first} a ${group.last}`} ${group.range}`).join(" · ");
}

// --------------------------------------------------------------------- módulo

export function ChatbotSettingsSection() {
  const [settings,setSettings]=useState<ChatbotSettings|null>(null);
  const [saved,setSaved]=useState<string>("");
  const [activeTab,setActiveTab]=useState<TabId>("try");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [models,setModels]=useState<AiModelOption[]>([]);
  const [modelsBusy,setModelsBusy]=useState(false);
  const [ruleFilter,setRuleFilter]=useState("");

  useEffect(()=>{
    api<ChatbotSettings>("/chatbot/settings")
      .then(next=>{setSettings(next);setSaved(JSON.stringify(next))})
      .catch(reason=>setError(errorMessage(reason)))
      .finally(()=>setLoading(false));
  },[]);

  const dirty=useMemo(()=>Boolean(settings)&&JSON.stringify(settings)!==saved,[settings,saved]);

  if(loading)return <Loading/>;
  if(!settings)return <Alert>{error??"No se pudo cargar la configuración del chatbot."}</Alert>;

  const set=(values:Partial<ChatbotSettings>)=>setSettings({...settings,...values});
  const style=(values:Partial<ChatbotSettings["responseStyle"]>)=>set({responseStyle:{...settings.responseStyle,...values}});
  const multi=(values:Partial<ChatbotSettings["multiMessage"]>)=>set({multiMessage:{...settings.multiMessage,...values}});
  const hours=(values:Partial<ChatbotSettings["businessHours"]>)=>set({businessHours:{...settings.businessHours,...values}});
  const setDay=(day:DayKey,range:{from:string;to:string}|null)=>hours({schedule:{...settings.businessHours.schedule,[day]:range?[range]:[]}});
  const patchResponse=(id:string,values:Partial<ChatbotResponseEntry>)=>set({
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

  async function save(event?:FormEvent){
    event?.preventDefault();
    if(!settings)return;
    setSaving(true);setError(null);setNotice(null);
    try{
      const {id:_id,updatedAt:_updatedAt,...body}=settings;
      const next=await api<ChatbotSettings>("/chatbot/settings",{method:"PUT",body});
      setSettings(next);setSaved(JSON.stringify(next));
      setNotice("Configuración guardada. Se aplica al próximo mensaje que llegue.");
    }catch(reason){setError(errorMessage(reason))}
    finally{setSaving(false)}
  }

  const activeRules=settings.responses.filter(item=>item.enabled).length;
  const status=!settings.enabled
    ?{tone:"off",text:"Apagado: no redacta ni responde en ningún chat."}
    :settings.defaultMode==="AUTO"
      ?{tone:"auto",text:"Responde solo en los chats que no tengan otro modo elegido."}
      :settings.defaultMode==="SUGGEST"
        ?{tone:"suggest",text:"Redacta sugerencias que una persona aprueba desde la bandeja."}
        :{tone:"off",text:"Encendido, pero el modo general está en Apagado."};

  const tabs:Array<{id:TabId;label:string}>=[
    {id:"try",label:"Probar"},
    {id:"voice",label:"Cómo habla"},
    {id:"bubbles",label:"Mensajes y burbujas"},
    {id:"knowledge",label:`Qué sabe (${activeRules})`},
    {id:"hours",label:"Horario"},
    {id:"handoff",label:"Derivar a una persona"},
    {id:"advanced",label:"Avanzado"},
  ];
  const filteredRules=settings.responses
    .map((response,index)=>({response,index}))
    .filter(({response})=>{
      const q=ruleFilter.trim().toLowerCase();
      return !q||[response.answer,response.context,...response.activators].some(value=>value.toLowerCase().includes(q));
    });

  return <form className="form-grid bot-settings" onSubmit={save} style={{maxWidth:1080}}>
    {error?<Alert>{error}</Alert>:null}
    {notice&&!dirty?<Alert tone="ok">{notice}</Alert>:null}

    {/* Lo que más se toca: encendido y modo, siempre a la vista. */}
    <section className={`card card-pad form-grid bot-status ${status.tone}`}>
      <div className="toolbar" style={{alignItems:"center"}}>
        <div>
          <h3 className="panel-title">Estado del bot</h3>
          <p className="section-note">{status.text}</p>
        </div>
        <label className="bot-switch big">
          <input type="checkbox" checked={settings.enabled} onChange={event=>set({enabled:event.target.checked})}/>
          <span>{settings.enabled?"Encendido":"Apagado"}</span>
        </label>
      </div>
      <ChoiceCards label="Modo general" value={settings.defaultMode} options={MODES} onChange={defaultMode=>set({defaultMode})}/>
      <div className="bot-summary">
        <button type="button" onClick={()=>setActiveTab("hours")}>🕘 {summarizeHours(settings)}{settings.businessHours.enabled?` · fuera de horario: ${settings.outsideHoursBehavior.mode==="OFF"?"no responde":settings.outsideHoursBehavior.mode==="STALL"?"avisa y espera":"responde igual"}`:""}</button>
        <button type="button" onClick={()=>setActiveTab("bubbles")}>💬 {settings.multiMessage.enabled?`Hasta ${settings.multiMessage.maxBubbles} burbujas`:"Un solo mensaje"}</button>
        <button type="button" onClick={()=>setActiveTab("knowledge")}>📚 {activeRules} respuesta{activeRules===1?"":"s"} configurada{activeRules===1?"":"s"}</button>
        <button type="button" onClick={()=>setActiveTab("handoff")}>🙋 {settings.escalationKeywords.length} palabra{settings.escalationKeywords.length===1?"":"s"} que derivan{settings.modelCanEscalate?" · la IA también puede derivar":""}</button>
      </div>
      <p className="section-note">Cada chat puede tener su propio modo desde la bandeja (panel derecho → Bot).</p>
    </section>

    <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab}/>

    {activeTab==="try"?<Simulator settings={settings} dirty={dirty}/>:null}

    {activeTab==="voice"?<>
      <Section title="Personalidad" note="Quién es el bot y cómo trata a los clientes. Es la instrucción más importante: cuanto más concreta, mejor.">
        <Field label="Instrucciones de personalidad y tono" hint="Trato (vos/usted), modismos, nivel técnico, qué nunca debe decir, qué hacer con los precios.">
          <textarea rows={8} required value={settings.persona} placeholder={"Ej.: Sos vendedor de The Gamer Shop. Tratás de vos, con tono cercano y técnico cuando hace falta.\nNunca inventes precios ni stock: si no está en la información, decí que lo consultás.\nNo uses frases de call center."} onChange={event=>set({persona:event.target.value})}/>
        </Field>
      </Section>
      <Section title="Estilo de las respuestas">
        <div className="grid-3">
          <Segmented label="Largo" value={settings.responseStyle.length} onChange={length=>style({length})} options={[
            {id:"SHORT",label:"Breve",hint:"Una o dos oraciones. Ideal para WhatsApp."},
            {id:"MEDIUM",label:"Media",hint:"Explica un poco más cuando la pregunta lo pide."},
            {id:"DETAILED",label:"Detallada",hint:"Respuestas completas; puede resultar largo para un chat."},
          ]}/>
          <Segmented label="Emojis" value={settings.responseStyle.emoji} onChange={emoji=>style({emoji})} options={[
            {id:"NONE",label:"Nunca"},{id:"SPARING",label:"A veces",hint:"Alguno ocasional para dar calidez."},{id:"NATURAL",label:"Naturales",hint:"Como los usaría una persona en WhatsApp."},
          ]}/>
          <Segmented label="Párrafos" value={settings.responseStyle.paragraphs} onChange={paragraphs=>style({paragraphs})} options={[
            {id:"COMPACT",label:"Compacto"},{id:"SHORT",label:"Cortos"},{id:"FREE",label:"Libre"},
          ]}/>
        </div>
        <div className="grid-2">
          <Field label="Máximo de caracteres por respuesta" hint="Tope duro: lo que pase de acá se corta.">
            <input type="number" min={80} max={4000} value={settings.responseStyle.maxCharacters} onChange={event=>style({maxCharacters:Number(event.target.value)})}/>
          </Field>
          <Checkbox label="No repetir textual el último mensaje enviado" checked={settings.responseStyle.avoidRepetition} onChange={avoidRepetition=>style({avoidRepetition})}/>
        </div>
      </Section>
      <Section title="Saludos y despedidas" note="Ejemplos que la IA puede usar. Los saludos solo al empezar una conversación; las despedidas solo si el cliente la cierra.">
        <div className="grid-2">
          <ListEditor label="Saludos" placeholder={"¡Hola! ¿Cómo estás?\n¡Buenas! ¿En qué te ayudo?"} values={settings.openingMessages} onChange={openingMessages=>set({openingMessages})}/>
          <ListEditor label="Despedidas" placeholder={"¡Gracias por escribirnos!\nCualquier cosa, acá estamos."} values={settings.closingMessages} onChange={closingMessages=>set({closingMessages})}/>
        </div>
      </Section>
    </>:null}

    {activeTab==="bubbles"?<Section title="Mensajes y burbujas" note="Cómo se reparte cada respuesta en mensajes de WhatsApp y cuánto espera entre uno y otro. Vale igual para Automático y para las sugerencias aprobadas.">
      <div className="bot-split">
        <div className="form-grid">
          <Checkbox label="Mandar la respuesta en varias burbujas cortas" checked={settings.multiMessage.enabled} onChange={enabled=>multi({enabled})}/>
          {settings.multiMessage.enabled?<>
            <ChoiceCards label="Cómo dividir" value={settings.multiMessage.splitMode} onChange={splitMode=>multi({splitMode})} options={[
              {id:"AI_NATURAL",title:"La IA decide",text:"Parte la respuesta donde queda natural."},
              {id:"AI_PLUS_FIXED",title:"IA + fijos",text:"La IA parte la respuesta y se suman tu apertura y tu cierre."},
              {id:"FIXED_ONLY",title:"Un bloque + fijos",text:"La IA escribe un solo mensaje y se suman tu apertura y tu cierre."},
            ]}/>
            {settings.multiMessage.splitMode!=="FIXED_ONLY"?<Field label={`Máximo de burbujas de la IA: ${settings.multiMessage.maxBubbles}`}>
              <input type="range" min={1} max={5} value={settings.multiMessage.maxBubbles} onChange={event=>multi({maxBubbles:Number(event.target.value)})}/>
            </Field>:null}
            {settings.multiMessage.splitMode!=="AI_NATURAL"||settings.multiMessage.openingMessage||settings.multiMessage.closingMessage?<div className="grid-2">
              <Field label="Burbuja fija de apertura" hint="Solo en la primera respuesta del bot en cada chat. Vacío = no se agrega."><textarea rows={2} maxLength={1000} value={settings.multiMessage.openingMessage} placeholder="¡Hola! Gracias por escribir a The Gamer Shop 👋" onChange={event=>multi({openingMessage:event.target.value})}/></Field>
              <Field label="Burbuja fija de cierre" hint="Al final de cada respuesta. Vacío = no se agrega."><textarea rows={2} maxLength={1000} value={settings.multiMessage.closingMessage} onChange={event=>multi({closingMessage:event.target.value})}/></Field>
            </div>:null}
          </>:null}
          <div className="grid-2">
            <Field label="Espera mínima entre burbujas (s)"><input type="number" min={0} max={30} value={settings.multiMessage.betweenDelayMinSeconds} onChange={event=>multi({betweenDelayMinSeconds:Number(event.target.value)})}/></Field>
            <Field label="Espera máxima entre burbujas (s)"><input type="number" min={0} max={60} value={settings.multiMessage.betweenDelayMaxSeconds} onChange={event=>multi({betweenDelayMaxSeconds:Number(event.target.value)})}/></Field>
          </div>
          <Field label="Espera antes de empezar a responder, en Automático (s)" hint="Elige un valor al azar entre 0 y este máximo, para no contestar instantáneamente.">
            <input type="number" min={0} max={120} value={settings.autoDelayMaxSeconds} onChange={event=>set({autoDelayMaxSeconds:Number(event.target.value)})}/>
          </Field>
          <hr/>
          <Checkbox label="Mandar un mensaje después del PDF de un presupuesto" checked={settings.multiMessage.quoteFollowup.enabled} onChange={enabled=>multi({quoteFollowup:{...settings.multiMessage.quoteFollowup,enabled}})}/>
          {settings.multiMessage.quoteFollowup.enabled?<Field label="Mensaje después del presupuesto"><textarea rows={2} maxLength={1000} value={settings.multiMessage.quoteFollowup.message} placeholder="¿Querés que te lo reserve o ajustamos algo?" onChange={event=>multi({quoteFollowup:{...settings.multiMessage.quoteFollowup,message:event.target.value}})}/></Field>:null}
        </div>
        <BubblePreview settings={settings}/>
      </div>
    </Section>:null}

    {activeTab==="knowledge"?<Section
      title="Qué sabe el bot"
      note="Información autorizada del negocio: formas de pago, envíos, garantía, horarios del local… Cuando el cliente pregunta algo parecido a los activadores, el bot responde con esto."
      aside={<button type="button" onClick={()=>{setRuleFilter("");set({responses:[...settings.responses,{
        id:uid(),enabled:true,activators:[],similarityThreshold:85,answer:"",context:"",attachments:emptyAttachments(),
      }]})}}>+ Agregar respuesta</button>}
    >
      {settings.responses.length>3?<input value={ruleFilter} placeholder="Buscar en las respuestas…" onChange={event=>setRuleFilter(event.target.value)}/>:null}
      {settings.responses.length===0?<Alert tone="info">Todavía no hay respuestas. Empezá por las preguntas que más se repiten: formas de pago, envíos y garantía.</Alert>:null}
      <div className="form-grid">
        {filteredRules.map(({response,index})=><ResponseCard key={response.id} response={response} index={index} onError={setError}
          onPatch={values=>patchResponse(response.id,values)}
          onRemove={()=>set({responses:settings.responses.filter(item=>item.id!==response.id)})}
          onDuplicate={()=>set({responses:[...settings.responses.slice(0,index+1),{...response,id:uid(),activators:[...response.activators]},...settings.responses.slice(index+1)]})}
        />)}
      </div>
    </Section>:null}

    {activeTab==="hours"?<>
      <Section title="Horario comercial" note={settings.businessHours.enabled?summarizeHours(settings):"Sin horario: el bot actúa a cualquier hora."}>
        <Checkbox label="El bot responde distinto fuera de horario" checked={settings.businessHours.enabled} onChange={enabled=>hours({enabled})}/>
        {settings.businessHours.enabled?<>
          <div className="bot-presets">
            <span className="section-note">Atajos:</span>
            <button type="button" className="btn-ghost btn-sm" onClick={()=>hours({schedule:Object.fromEntries(DAYS.map(([key])=>[key,WEEKDAYS.includes(key)?[{from:"09:00",to:"18:00"}]:[]])) as ChatbotSettings["businessHours"]["schedule"]})}>Lun a Vie 9–18</button>
            <button type="button" className="btn-ghost btn-sm" onClick={()=>hours({schedule:Object.fromEntries(DAYS.map(([key])=>[key,key==="sunday"?[]:key==="saturday"?[{from:"09:00",to:"13:00"}]:[{from:"09:00",to:"18:00"}]])) as ChatbotSettings["businessHours"]["schedule"]})}>Lun a Vie 9–18 + Sáb 9–13</button>
            <button type="button" className="btn-ghost btn-sm" onClick={()=>{const monday=firstRange(settings,"monday")??{from:"09:00",to:"18:00"};hours({schedule:Object.fromEntries(DAYS.map(([key])=>[key,firstRange(settings,key)?[monday]:[]])) as ChatbotSettings["businessHours"]["schedule"]})}}>Copiar el horario del lunes a los días activos</button>
          </div>
          <div className="bot-week">
            {DAYS.map(([key,label])=>{
              const range=firstRange(settings,key);
              return <div className={`bot-day${range?"":" closed"}`} key={key}>
                <label className="bot-switch">
                  <input type="checkbox" checked={Boolean(range)} onChange={event=>setDay(key,event.target.checked?{from:"09:00",to:"18:00"}:null)}/>
                  <span>{label}</span>
                </label>
                {range?<div className="bot-day-range">
                  <input type="time" aria-label={`${label} desde`} value={range.from} onChange={event=>setDay(key,{...range,from:event.target.value})}/>
                  <span>a</span>
                  <input type="time" aria-label={`${label} hasta`} value={range.to} onChange={event=>setDay(key,{...range,to:event.target.value})}/>
                </div>:<span className="section-note">Cerrado</span>}
              </div>;
            })}
          </div>
          <Field label="Zona horaria">
            <select value={settings.businessHours.timezone} onChange={event=>hours({timezone:event.target.value})}>
              {[...new Set(["America/Argentina/Buenos_Aires",settings.businessHours.timezone])].map(zone=><option key={zone} value={zone}>{zone==="America/Argentina/Buenos_Aires"?"Argentina (Buenos Aires)":zone}</option>)}
            </select>
          </Field>
        </>:null}
      </Section>
      {settings.businessHours.enabled?<Section title="Fuera de horario" note="Qué hace el bot cuando escriben con el local cerrado.">
        <ChoiceCards label="Fuera de horario" value={settings.outsideHoursBehavior.mode} onChange={mode=>set({outsideHoursBehavior:{...settings.outsideHoursBehavior,mode}})} options={[
          {id:"OFF",title:"No responde",text:"El mensaje queda en la bandeja para el próximo turno."},
          {id:"STALL",title:"Avisa y espera",text:"Contesta algo natural diciendo que lo ven en horario comercial."},
          {id:"NORMAL",title:"Responde igual",text:"Atiende como siempre, a cualquier hora."},
        ]}/>
        {settings.outsideHoursBehavior.mode==="STALL"?<Field label="Qué puede decir fuera de horario" hint="Guía para la IA: no se copia textual."><textarea rows={3} value={settings.outsideHoursBehavior.message} placeholder="Estamos fuera de horario; mañana a primera hora te respondemos." onChange={event=>set({outsideHoursBehavior:{...settings.outsideHoursBehavior,message:event.target.value}})}/></Field>:null}
      </Section>:null}
    </>:null}

    {activeTab==="handoff"?<Section title="Derivar a una persona" note="Cuando el bot deriva, deja de responder en ese chat, lo marca como escalado en la bandeja y avisa en la campana. Se reanuda desde la bandeja (panel derecho → Reanudar el bot).">
      <Field label="Palabras o frases que derivan al instante" hint="Si el mensaje del cliente contiene alguna, el bot no contesta y deriva. Los audios siempre derivan.">
        <ActivatorInput values={settings.escalationKeywords} onChange={escalationKeywords=>set({escalationKeywords})}/>
      </Field>
      <Checkbox label="Dejar que la IA derive cuando no puede resolver con seguridad" checked={settings.modelCanEscalate} onChange={modelCanEscalate=>set({modelCanEscalate})}/>
      <Field label="Cuándo tiene que derivar la IA" hint="Criterios en lenguaje natural. Ej.: reclamos, garantías, pedidos de descuento, dudas técnicas que no estén en 'Qué sabe'.">
        <textarea rows={5} required value={settings.escalationInstructions} onChange={event=>set({escalationInstructions:event.target.value})}/>
      </Field>
      <ListEditor label="Mensajes automáticos a ignorar" hint="Bienvenidas o respuestas automáticas de WhatsApp Business que no son del cliente. Una por línea." values={settings.ignoredAutoMessages} onChange={ignoredAutoMessages=>set({ignoredAutoMessages})}/>
    </Section>:null}

    {activeTab==="advanced"?<Section title="Avanzado" note="Ajustes técnicos. Los valores actuales sirven para el uso normal.">
      <div className="grid-2">
        <Field label="Modelo de IA" hint="Heredar usa el modelo de Configuración → IA.">
          <select value={settings.model??""} onChange={event=>set({model:event.target.value||null})}>
            <option value="">Heredar modelo global</option>
            {settings.model&&!models.some(model=>model.id===settings.model)?<option value={settings.model}>{settings.model} (actual)</option>:null}
            {models.map(model=><option key={model.id} value={model.id}>{model.id}{modelEfficiencyHint(model.id)?` · ${modelEfficiencyHint(model.id)}`:""}</option>)}
          </select>
        </Field>
        <div className="form-actions" style={{alignItems:"end"}}><button type="button" className="btn-ghost" disabled={modelsBusy} onClick={()=>void loadModels()}>{modelsBusy?"Consultando OpenAI…":"Cargar modelos disponibles"}</button></div>
        <Field label="Mensajes anteriores que lee" hint="Cuántos mensajes del chat recibe la IA como contexto. Más contexto = mejores respuestas y más costo."><input type="number" min={0} max={50} value={settings.maxRecentSnippets} onChange={event=>set({maxRecentSnippets:Number(event.target.value)})}/></Field>
        <Field label="Actualizar la memoria del chat cada (mensajes)" hint="En chats largos el bot guarda un resumen; esto define cada cuánto lo renueva."><input type="number" min={2} max={100} value={settings.summaryRefreshEvery} onChange={event=>set({summaryRefreshEvery:Number(event.target.value)})}/></Field>
        <Field label="Reutilizar respuestas desde (% de similitud)" hint="Si una pregunta es casi igual a otra ya respondida, reusa esa respuesta y no gasta IA. 0 lo desactiva."><input type="number" min={0} max={100} value={settings.reuseSimilarityThreshold} onChange={event=>set({reuseSimilarityThreshold:Number(event.target.value)})}/></Field>
      </div>
      <details className="bot-details">
        <summary>Solo para la extensión de Chrome (no afectan a la bandeja ni a la API de WhatsApp)</summary>
        <div className="grid-3" style={{marginTop:10}}>
          <Field label="Escaneo cada (segundos)"><input type="number" min={3} max={120} value={settings.scanIntervalSeconds} onChange={event=>set({scanIntervalSeconds:Number(event.target.value)})}/></Field>
          <Field label="Confirmación de envío (ms)"><input type="number" min={3000} max={60000} step={1000} value={settings.sendConfirmationTimeoutMs} onChange={event=>set({sendConfirmationTimeoutMs:Number(event.target.value)})}/></Field>
          <Field label="Sugerencias en WhatsApp Web">
            <select value={settings.multiMessage.draftMode} onChange={event=>multi({draftMode:event.target.value as ChatbotSettings["multiMessage"]["draftMode"]})}>
              <option value="QUEUE">Cola, una por una</option><option value="JOINED">Todo junto</option><option value="FIRST_ONLY">Solo la primera</option>
            </select>
          </Field>
        </div>
      </details>
    </Section>:null}

    <div className={`bot-savebar${dirty?" dirty":""}`}>
      <span>{dirty?"Tenés cambios sin guardar":"Todo guardado"}</span>
      <div className="form-actions">
        {dirty?<button type="button" className="btn-ghost" disabled={saving} onClick={()=>{setSettings(JSON.parse(saved) as ChatbotSettings);setNotice(null)}}>Descartar cambios</button>:null}
        <button type="submit" disabled={saving||!dirty}>{saving?"Guardando…":"Guardar"}</button>
      </div>
    </div>
  </form>;
}
