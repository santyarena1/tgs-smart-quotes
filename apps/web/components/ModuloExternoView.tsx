'use client';

import {FormEvent,useEffect,useState} from 'react';
import {api} from '../lib/api';
import {Alert,Checkbox,Field,Loading,PageHeader,Pill,Tabs,errorMessage} from './shared';

type Tab='conexiones'|'plantillas'|'layout'|'almacenamiento';
type Provider='photoroom'|'tripo'|'higgsfield'|'serper'|'r2'|'wordpress';
type View={id:'singleton';photoroomKeySet:boolean;tripoKeySet:boolean;higgsfieldKeySet:boolean;higgsfieldSecretSet:boolean;serperKeySet:boolean;r2SecretAccessKeySet:boolean;wpHmacSecretSet:boolean;r2Endpoint:string|null;r2Bucket:string|null;r2AccessKeyId:string|null;r2PublicBaseUrl:string|null;wpBaseUrl:string;autoRepublish:boolean;updatedAt:string};
type Draft={photoroomKey:string;tripoKey:string;higgsfieldKey:string;higgsfieldSecret:string;serperKey:string;r2SecretAccessKey:string;wpHmacSecret:string;r2Endpoint:string;r2Bucket:string;r2AccessKeyId:string;r2PublicBaseUrl:string;wpBaseUrl:string;autoRepublish:boolean};
type Secret=keyof Pick<Draft,'photoroomKey'|'tripoKey'|'higgsfieldKey'|'higgsfieldSecret'|'serperKey'|'r2SecretAccessKey'|'wpHmacSecret'>;
const tabs:{id:Tab;label:string}[]=[{id:'conexiones',label:'Conexiones'},{id:'plantillas',label:'Plantillas'},{id:'layout',label:'Layout de landing'},{id:'almacenamiento',label:'Almacenamiento'}];
const empty:Draft={photoroomKey:'',tripoKey:'',higgsfieldKey:'',higgsfieldSecret:'',serperKey:'',r2SecretAccessKey:'',wpHmacSecret:'',r2Endpoint:'',r2Bucket:'',r2AccessKeyId:'',r2PublicBaseUrl:'',wpBaseUrl:'https://www.thegamershop.com.ar',autoRepublish:true};

export function ModuloExternoView(){
 const[tab,setTab]=useState<Tab>('conexiones'),[view,setView]=useState<View|null>(null),[draft,setDraft]=useState<Draft>(empty);
 const[clears,setClears]=useState<Partial<Record<Secret,boolean>>>({}),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null),[testing,setTesting]=useState<Provider|null>(null);
 const[results,setResults]=useState<Partial<Record<Provider,{ok:boolean;detail?:string}>>>({});
 const load=async()=>{setLoading(true);setError(null);try{const v=await api<View>('/settings/external-module/config');setView(v);setDraft({...empty,r2Endpoint:v.r2Endpoint??'',r2Bucket:v.r2Bucket??'',r2AccessKeyId:v.r2AccessKeyId??'',r2PublicBaseUrl:v.r2PublicBaseUrl??'',wpBaseUrl:v.wpBaseUrl,autoRepublish:v.autoRepublish});}catch(e){setError(errorMessage(e));}finally{setLoading(false);}};
 useEffect(()=>{void load();},[]);
 const set=(key:keyof Draft,value:string|boolean)=>setDraft(d=>({...d,[key]:value}));
 const secret=(key:Secret,label:string,isSet:boolean)=><Field label={label} hint={isSet?'Hay una credencial cifrada guardada.':''}><input type={'password'} value={draft[key] as string} placeholder={isSet?'•••• guardada':'Ingresar credencial'} onChange={e=>set(key,e.target.value)}/>{isSet?<Checkbox label={'Borrar credencial guardada'} checked={Boolean(clears[key])} onChange={v=>setClears(c=>({...c,[key]:v}))}/>:null}</Field>;
 const test=async(provider:Provider)=>{setTesting(provider);setError(null);try{const r=await api<{ok:boolean;detail?:string}>(`/settings/external-module/config/test/${provider}`,{method:'POST'});setResults(x=>({...x,[provider]:r}));}catch(e){setResults(x=>({...x,[provider]:{ok:false,detail:errorMessage(e)}}));}finally{setTesting(null);}};
 const provider=(name:string,id:Provider,children:React.ReactNode)=>{const r=results[id];return <section className={'card card-pad'}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><h3 className={'panel-title'}>{name}</h3><button type={'button'} className={'btn-ghost btn-sm'} disabled={testing===id} onClick={()=>void test(id)}>{testing===id?'Probando…':'Probar'}</button></div>{children}{r?<Alert tone={r.ok?'ok':'error'}>{r.ok?'Conexión correcta':r.detail??'No se pudo conectar'}</Alert>:null}</section>};
 const save=async(e:FormEvent)=>{e.preventDefault();setSaving(true);setError(null);setNotice(null);try{const body={...draft,clearPhotoroomKey:clears.photoroomKey,clearTripoKey:clears.tripoKey,clearHiggsfieldKey:clears.higgsfieldKey,clearHiggsfieldSecret:clears.higgsfieldSecret,clearSerperKey:clears.serperKey,clearR2SecretAccessKey:clears.r2SecretAccessKey,clearWpHmacSecret:clears.wpHmacSecret};const next=await api<View>('/settings/external-module/config',{method:'PUT',body});setView(next);setDraft(d=>({...d,photoroomKey:'',tripoKey:'',higgsfieldKey:'',higgsfieldSecret:'',serperKey:'',r2SecretAccessKey:'',wpHmacSecret:''}));setClears({});setNotice('Configuración guardada.');}catch(e){setError(errorMessage(e));}finally{setSaving(false);}};
 return <div><PageHeader eyebrow={'Módulo Externo'} title={'Módulo Externo'} subtitle={'Configuración de conexiones y proveedores.'} actions={<Pill tone={'warn'}>Beta</Pill>}/><Tabs tabs={tabs} active={tab} onChange={setTab}/>{tab!=='conexiones'?<div className={'card card-pad'} style={{marginTop:20}}><h3 className={'panel-title'}>En construcción</h3></div>:loading?<Loading label={'Cargando conexiones…'}/>:<form onSubmit={save} style={{display:'grid',gap:16,marginTop:20}}>{error?<Alert>{error}</Alert>:null}{notice?<Alert tone={'ok'}>{notice}</Alert>:null}
 {provider('Photoroom','photoroom',secret('photoroomKey','API key',Boolean(view?.photoroomKeySet)))}
 {provider('Tripo','tripo',secret('tripoKey','API key',Boolean(view?.tripoKeySet)))}
 {provider('Higgsfield','higgsfield',<div className={'form-grid'}>{secret('higgsfieldKey','API key',Boolean(view?.higgsfieldKeySet))}{secret('higgsfieldSecret','API secret',Boolean(view?.higgsfieldSecretSet))}</div>)}
 {provider('Serper','serper',secret('serperKey','API key',Boolean(view?.serperKeySet)))}
 {provider('Cloudflare R2','r2',<div className={'form-grid'}><Field label={'Endpoint'}><input value={draft.r2Endpoint} onChange={e=>set('r2Endpoint',e.target.value)}/></Field><Field label={'Bucket'}><input value={draft.r2Bucket} onChange={e=>set('r2Bucket',e.target.value)}/></Field><Field label={'Access key ID'}><input value={draft.r2AccessKeyId} onChange={e=>set('r2AccessKeyId',e.target.value)}/></Field>{secret('r2SecretAccessKey','Secret access key',Boolean(view?.r2SecretAccessKeySet))}<Field label={'URL pública base'}><input value={draft.r2PublicBaseUrl} onChange={e=>set('r2PublicBaseUrl',e.target.value)}/></Field></div>)}
 {provider('WordPress','wordpress',<div className={'form-grid'}><Field label={'URL base'}><input type={'url'} required value={draft.wpBaseUrl} onChange={e=>set('wpBaseUrl',e.target.value)}/></Field>{secret('wpHmacSecret','Secreto HMAC',Boolean(view?.wpHmacSecretSet))}<Checkbox label={'Republicar automáticamente'} checked={draft.autoRepublish} onChange={v=>set('autoRepublish',v)}/></div>)}
 <div><button className={'btn-dark'} disabled={saving}>{saving?'Guardando…':'Guardar'}</button></div></form>}</div>;
}
