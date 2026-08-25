"use client";

import {FormEvent,useCallback,useEffect,useState} from "react";
import {api} from "../lib/api";
import {formatArs,parseArsToCents} from "../lib/money";
import {Alert,EmptyState,Field,Loading,MoneyInput,PageHeader,Pill,Stat,StatStrip,errorMessage} from "./shared";

type Salary={id:string;amountCents:string;effectiveFrom:string;reason?:string|null};
type Profile={fullName:string;docId?:string|null;position?:string|null;branch?:{name:string}|null;balanceCents:string;currentSalary:Salary|null;summary:{pendingMovements:number;openObligations:number;pendingRequests:number}};
type Movement={id:string;kind:string;direction:"EMPLOYEE_OWES"|"COMPANY_OWES";amountCents:string;status:string;occurredAt:string;description?:string|null};
type Obligation={id:string;kind:string;originalAmountCents:string;pendingCents:string;status:string;description?:string|null;installments:Array<{id:string;number:number;period:string;amountCents:string;paidCents:string;status:string}>};
type Payment={id:string;amountCents:string;method:string;paidAt:string;reference?:string|null};
type RequestItem={id:string;kind:string;amountCents:string;description?:string|null;status:string;createdAt:string};

const labels:Record<string,string>={SALARY_ACCRUAL:"Sueldo",SALARY_PAYMENT:"Pago de sueldo",ADVANCE:"Adelanto",MERCHANDISE:"Mercadería",CARD_CONSUMPTION:"Consumo de tarjeta",DEBT:"Deuda",REPAYMENT:"Pago",REIMBURSEMENT:"Reintegro",INSTALLMENT:"Cuota",ADJUSTMENT:"Ajuste",PENDING:"Pendiente",APPLIED:"Aplicado",CANCELLED:"Cancelado",PENDING_APPROVAL:"Pendiente de aprobación",APPROVED:"Aprobada",REJECTED:"Rechazada",OPEN:"Abierta",SETTLED:"Saldada"};
const label=(value:string)=>labels[value]??value.replaceAll("_"," ");
const date=(value:string)=>new Intl.DateTimeFormat("es-AR").format(new Date(value));
const balanceText=(cents:string)=>{const value=BigInt(cents);if(value>0n)return `La empresa te debe ${formatArs(value)}`;if(value<0n)return `Le debés a la empresa ${formatArs(-value)}`;return "Cuenta saldada";};

export function EmployeePortalView(){
  const [profile,setProfile]=useState<Profile|null>(null),[movements,setMovements]=useState<Movement[]>([]),[obligations,setObligations]=useState<Obligation[]>([]),[payments,setPayments]=useState<Payment[]>([]),[requests,setRequests]=useState<RequestItem[]>([]),[salaryHistory,setSalaryHistory]=useState<Salary[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[kind,setKind]=useState("ADVANCE"),[amount,setAmount]=useState(""),[description,setDescription]=useState(""),[saving,setSaving]=useState(false),[ok,setOk]=useState("");
  const load=useCallback(async()=>{setLoading(true);try{const [p,m,o,pay,s,r]=await Promise.all([api<Profile>("/me/employee"),api<{items:Movement[]}>("/me/employee/movements"),api<{items:Obligation[]}>("/me/employee/obligations"),api<{items:Payment[]}>("/me/employee/payments"),api<{current:Salary|null;history:Salary[]}>("/me/employee/salary"),api<{items:RequestItem[]}>("/me/employee/requests")]);setProfile(p);setMovements(m.items);setObligations(o.items);setPayments(pay.items);setSalaryHistory(s.history);setRequests(r.items);setError("");}catch(e){setError(errorMessage(e));}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  async function submit(event:FormEvent){event.preventDefault();setSaving(true);setOk("");try{await api("/me/employee/requests",{method:"POST",body:{kind,amountCents:parseArsToCents(amount),description:description.trim()||undefined}});setAmount("");setDescription("");setOk("Solicitud enviada para aprobación.");await load();}catch(e){setError(errorMessage(e));}finally{setSaving(false);}}
  if(loading&&!profile)return <Loading label="Cargando tu cuenta…"/>;
  if(error&&!profile)return <Alert>{error}</Alert>;
  if(!profile)return null;
  return <div className="page-stack">
    <PageHeader eyebrow="Portal del empleado" title="Mi cuenta" subtitle={`${profile.fullName}${profile.position?` · ${profile.position}`:""}${profile.branch?.name?` · ${profile.branch.name}`:""}`}/>
    {error?<Alert>{error}</Alert>:null}
    <StatStrip><Stat label="Saldo" value={balanceText(profile.balanceCents)}/><Stat label="Sueldo vigente" value={formatArs(profile.currentSalary?.amountCents)}/><Stat label="Movimientos pendientes" value={String(profile.summary.pendingMovements)}/><Stat label="Deudas abiertas" value={String(profile.summary.openObligations)}/></StatStrip>

    <section className="panel"><h2 className="panel-title">Movimientos</h2>{movements.length?<div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Importe</th><th>Sentido</th><th>Estado</th></tr></thead><tbody>{movements.map(item=><tr key={item.id}><td>{date(item.occurredAt)}</td><td>{label(item.kind)}{item.description?<small className="muted"> · {item.description}</small>:null}</td><td>{formatArs(item.amountCents)}</td><td>{item.direction==="COMPANY_OWES"?"A tu favor":"A favor de la empresa"}</td><td><Pill>{label(item.status)}</Pill></td></tr>)}</tbody></table></div>:<EmptyState title="Todavía no hay movimientos"/>}</section>

    <section className="panel"><h2 className="panel-title">Deudas y cuotas</h2>{obligations.length?obligations.map(item=><div key={item.id} className="panel"><div className="toolbar"><div><strong>{label(item.kind)}</strong><p>{item.description||"Sin descripción"} · Pendiente: <strong>{formatArs(item.pendingCents)}</strong></p></div><Pill>{label(item.status)}</Pill></div>{item.installments.length?<div className="table-wrap"><table><thead><tr><th>Cuota</th><th>Período</th><th>Importe</th><th>Pagado</th><th>Estado</th></tr></thead><tbody>{item.installments.map(i=><tr key={i.id}><td>{i.number}</td><td>{i.period}</td><td>{formatArs(i.amountCents)}</td><td>{formatArs(i.paidCents)}</td><td>{label(i.status)}</td></tr>)}</tbody></table></div>:null}</div>):<EmptyState title="No tenés deudas registradas"/>}</section>

    <div className="grid-2"><section className="panel"><h2 className="panel-title">Pagos</h2>{payments.length?<div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Importe</th><th>Método</th></tr></thead><tbody>{payments.map(item=><tr key={item.id}><td>{date(item.paidAt)}</td><td>{formatArs(item.amountCents)}</td><td>{label(item.method)}</td></tr>)}</tbody></table></div>:<EmptyState title="No hay pagos registrados"/>}</section><section className="panel"><h2 className="panel-title">Historial salarial</h2>{salaryHistory.length?<div className="table-wrap"><table><thead><tr><th>Desde</th><th>Importe</th></tr></thead><tbody>{salaryHistory.map(item=><tr key={item.id}><td>{date(item.effectiveFrom)}</td><td>{formatArs(item.amountCents)}</td></tr>)}</tbody></table></div>:<EmptyState title="No hay sueldo registrado"/>}</section></div>

    <div className="grid-2"><section className="panel"><h2 className="panel-title">Crear solicitud</h2>{ok?<Alert tone="ok">{ok}</Alert>:null}<form className="form-grid" onSubmit={submit}><Field label="Tipo"><select value={kind} onChange={e=>setKind(e.target.value)}><option value="ADVANCE">Adelanto</option><option value="REIMBURSEMENT">Reintegro</option><option value="SALARY_PAYMENT">Pago de sueldo</option><option value="MERCHANDISE">Mercadería</option><option value="CARD_CONSUMPTION">Consumo de tarjeta</option><option value="DEBT">Deuda</option></select></Field><Field label="Importe (ARS)"><MoneyInput required value={amount} onChange={v=>setAmount(v)}/></Field><Field label="Descripción (opcional)"><textarea value={description} onChange={e=>setDescription(e.target.value)}/></Field><button disabled={saving}>{saving?"Enviando…":"Enviar solicitud"}</button></form></section><section className="panel"><h2 className="panel-title">Mis solicitudes</h2>{requests.length?<div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Importe</th><th>Estado</th></tr></thead><tbody>{requests.map(item=><tr key={item.id}><td>{date(item.createdAt)}</td><td>{label(item.kind)}</td><td>{formatArs(item.amountCents)}</td><td><Pill>{label(item.status)}</Pill></td></tr>)}</tbody></table></div>:<EmptyState title="Todavía no hiciste solicitudes"/>}</section></div>
  </div>;
}
