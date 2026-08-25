"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { bpsToPct, centsToInput, formatArs, parseArsToCents, pctToBps } from "../lib/money";
import { Alert, Checkbox, Field, Loading, Modal, MoneyInput, PageHeader, Pill, Tabs } from "./shared";

type Tab = "resumen" | "sueldos" | "solicitudes";
type DetailTab = "movimientos" | "sueldo" | "obligaciones";
type Direction = "EMPLOYEE_OWES" | "COMPANY_OWES";
type MovementStatus = "PENDING" | "APPLIED" | "CANCELLED";
type MovementKind = "SALARY_ACCRUAL" | "SALARY_PAYMENT" | "ADVANCE" | "MERCHANDISE" | "CARD_CONSUMPTION" | "DEBT" | "REPAYMENT" | "REIMBURSEMENT" | "INSTALLMENT" | "ADJUSTMENT";

type Employee = { id:string; fullName:string; docId?:string|null; position?:string|null; active:boolean; branchId?:string|null; branch?:{id:string;name:string}|null; salaryRecords?:Salary[]; balanceCents:string; pendingCount:number };
type Salary = { id:string; amountCents:string; effectiveFrom:string; previousAmountCents?:string|null; changeBps?:number|null; reason?:string|null };
type Detail = Employee & { user?:{username:string;displayName?:string|null;active:boolean}|null; currentSalary?:Salary|null; notes?:string|null; summary:{pendingMovements:number;openObligations:number} };
type Movement = { id:string; kind:MovementKind; direction:Direction; amountCents:string; status:MovementStatus; occurredAt:string; description?:string|null; obligationId?:string|null };
type Summary = { activeEmployees:number; totalCompanyOwesCents:string; totalEmployeesOweCents:string; pendingMovements:number; pendingRequests:number };
type RequestRow = { id:string; kind:MovementKind; amountCents:string; description?:string|null; createdAt:string; employee:{id:string;fullName:string} };
type Obligation = { id:string; kind:string; originalAmountCents:string; pendingCents:string; status:"OPEN"|"SETTLED"|"CANCELLED"; description?:string|null; productId?:string|null; createdAt:string; installments:Array<{id:string;number:number;amountCents:string;paidCents:string;period:string;status:string}> };
type Preview = { employeeId:string; name:string; oldCents:string; bps:number; newCents:string; newInput:string; included:boolean };
type Breakdown = { accruedCents:string; creditsCents:string; debtsCents:string; paidCents:string; adjustmentsCents:string; balanceCents:string };

const kinds: Array<[MovementKind,string]> = [["ADVANCE","Adelanto"],["MERCHANDISE","Mercadería"],["CARD_CONSUMPTION","Consumo de tarjeta"],["DEBT","Deuda"],["REPAYMENT","Devolución / pago"],["REIMBURSEMENT","Reintegro"],["SALARY_ACCRUAL","Sueldo devengado"],["SALARY_PAYMENT","Pago de sueldo"],["INSTALLMENT","Cuota"],["ADJUSTMENT","Ajuste"]];
const kindLabel = (kind:string) => kinds.find(([id])=>id===kind)?.[1] ?? kind.replaceAll("_"," ");
const today = () => new Date().toISOString().slice(0,10);
const month = () => new Date().toISOString().slice(0,7).replace("-","");
const errorText = (e:unknown) => e instanceof Error ? e.message : "Ocurrió un error inesperado.";
const abs = (v:string) => { try { const n=BigInt(v); return (n<0n?-n:n).toString(); } catch { return "0"; } };

function Balance({value}:{value:string}) { const n=BigInt(value||"0"); return n>0n?<Pill tone="ok">Empresa debe: {formatArs(value)}</Pill>:n<0n?<Pill tone="bad">Empleado debe: {formatArs(abs(value))}</Pill>:<Pill>Cuenta saldada</Pill>; }
function Status({value}:{value:string}) { const labels:Record<string,string>={PENDING:"Pendiente",APPLIED:"Aplicado",CANCELLED:"Cancelado",OPEN:"Abierta",SETTLED:"Saldada"}; return <Pill tone={value==="APPLIED"||value==="SETTLED"?"ok":value==="PENDING"||value==="OPEN"?"warn":"bad"}>{labels[value]??value}</Pill>; }

export function EmployeesView() {
  const [tab,setTab]=useState<Tab>("resumen"), [loading,setLoading]=useState(true), [error,setError]=useState(""), [ok,setOk]=useState("");
  const [summary,setSummary]=useState<Summary|null>(null), [employees,setEmployees]=useState<Employee[]>([]), [requests,setRequests]=useState<RequestRow[]>([]), [search,setSearch]=useState("");
  const [selectedId,setSelectedId]=useState<string|null>(null), [employeeModal,setEmployeeModal]=useState<"new"|Employee|null>(null), [quickSalary,setQuickSalary]=useState<Employee|null>(null), [quickObligation,setQuickObligation]=useState<Employee|null>(null), [quickPayment,setQuickPayment]=useState<Employee|null>(null);
  const load=useCallback(async()=>{ setLoading(true); try { const [s,e,r]=await Promise.all([api<Summary>("/employees/summary"),api<{items:Employee[]}>("/employees"),api<{items:RequestRow[]}>("/employee-requests",{query:{status:"PENDING_APPROVAL"}})]); setSummary(s);setEmployees(e.items);setRequests(r.items);setError(""); } catch(e){setError(errorText(e));} finally{setLoading(false);} },[]);
  useEffect(()=>{void load();},[load]);
  const filtered=useMemo(()=>{
    const rows=employees.filter(e=>`${e.fullName} ${e.branch?.name??""} ${e.position??""}`.toLowerCase().includes(search.toLowerCase()));
    return [...rows].sort((a,b)=>{
      let av=0n,bv=0n;
      try{av=BigInt(a.balanceCents||"0");}catch{/* 0 */}
      try{bv=BigInt(b.balanceCents||"0");}catch{/* 0 */}
      return bv<av?-1:bv>av?1:0;
    });
  },[employees,search]);
  const salaryByBranch=useMemo(()=>{
    const totals=new Map<string,bigint>();
    for(const e of employees){
      if(!e.active)continue;
      const amount=e.salaryRecords?.[0]?.amountCents;
      if(!amount)continue;
      const label=e.branch?.name??"Sin local";
      let cents=0n;
      try{cents=BigInt(amount);}catch{/* 0 */}
      totals.set(label,(totals.get(label)??0n)+cents);
    }
    return [...totals.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  },[employees]);
  async function review(id:string,action:"approve"|"reject"){if(action==="reject"&&!confirm("¿Rechazar esta solicitud?"))return;try{await api(`/employee-requests/${id}/${action}`,{method:"POST"});setOk(action==="approve"?"Solicitud aprobada.":"Solicitud rechazada.");await load();}catch(e){setError(errorText(e));}}
  if(loading)return <Loading label="Cargando empleados…"/>;
  if(selectedId)return <EmployeeDetail id={selectedId} onBack={()=>{setSelectedId(null);void load();}}/>;
  return <section>
    <PageHeader eyebrow="Administración" title="Empleados y cuenta corriente" subtitle="Sueldos, movimientos, obligaciones, pagos y solicitudes." actions={<button onClick={()=>setEmployeeModal("new")}>Nuevo empleado</button>}/>
    {error?<Alert>{error}</Alert>:null}{ok?<Alert tone="ok">{ok}</Alert>:null}
    <Tabs tabs={[{id:"resumen",label:"Resumen"},{id:"sueldos",label:"Ajuste de sueldos"},{id:"solicitudes",label:`Solicitudes (${requests.length})`}]} active={tab} onChange={setTab}/>
    {tab==="resumen"&&summary?<>
      <div className="stat-strip">
        <div className="stat"><span className="stat-label">Empresa debe a empleados</span><strong className="stat-value">{formatArs(summary.totalCompanyOwesCents)}</strong></div>
        <div className="stat"><span className="stat-label">Empleados deben a la empresa</span><strong className="stat-value">{formatArs(summary.totalEmployeesOweCents)}</strong></div>
        <div className="stat"><span className="stat-label">Equipo activo</span><strong className="stat-value">{summary.activeEmployees}</strong></div>
        <div className="stat"><span className="stat-label">Solicitudes pendientes</span><strong className="stat-value">{summary.pendingRequests}</strong></div>
      </div>
      {salaryByBranch.length?<div className="panel"><h2 className="panel-title">Sueldos por local</h2><div className="table-wrap"><table><thead><tr><th>Local</th><th>Total sueldos vigentes</th></tr></thead><tbody>{salaryByBranch.map(([label,cents])=><tr key={label}><td>{label}</td><td>{formatArs(cents.toString())}</td></tr>)}</tbody></table></div></div>:null}
      <div className="toolbar"><input aria-label="Buscar empleados" placeholder="Buscar por nombre, local o puesto…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="table-wrap"><table><thead><tr><th>Empleado</th><th>Local</th><th>Sueldo vigente</th><th>Neto a pagar</th><th/></tr></thead><tbody>{filtered.map(e=><tr key={e.id}><td><strong>{e.fullName}</strong><br/><span className="muted">{e.position||"Sin puesto"}</span></td><td>{e.branch?.name||"Sin local"}</td><td>{formatArs(e.salaryRecords?.[0]?.amountCents)}</td><td><Balance value={e.balanceCents}/></td><td><div className="row-actions"><button className="btn-dark btn-sm" onClick={()=>setQuickSalary(e)}>Cargar sueldo</button><button className="btn-dark btn-sm" onClick={()=>setQuickObligation(e)}>Cargar deuda</button><button className="btn-dark btn-sm" onClick={()=>setQuickPayment(e)}>Pagar</button><button className="btn-ghost btn-sm" onClick={()=>setSelectedId(e.id)}>Detalle</button><button className="btn-ghost btn-sm" onClick={()=>setEmployeeModal(e)}>Editar</button></div></td></tr>)}{!filtered.length?<tr><td colSpan={5}>No hay empleados para esta búsqueda.</td></tr>:null}</tbody></table></div>
    </>:null}
    {tab==="sueldos"?<BulkSalary onDone={load}/>:null}
    {tab==="solicitudes"?<div className="table-wrap"><table><thead><tr><th>Empleado</th><th>Solicitud</th><th>Monto</th><th>Fecha</th><th/></tr></thead><tbody>{requests.map(r=><tr key={r.id}><td>{r.employee.fullName}</td><td>{kindLabel(r.kind)}<br/><span className="muted">{r.description||"Sin descripción"}</span></td><td>{formatArs(r.amountCents)}</td><td>{new Date(r.createdAt).toLocaleDateString("es-AR")}</td><td><div className="row-actions"><button className="btn-dark btn-sm" onClick={()=>void review(r.id,"approve")}>Aprobar</button><button className="btn-danger btn-sm" onClick={()=>void review(r.id,"reject")}>Rechazar</button></div></td></tr>)}{!requests.length?<tr><td colSpan={5}>No hay solicitudes pendientes.</td></tr>:null}</tbody></table></div>:null}
    <EmployeeModal value={employeeModal} onClose={()=>setEmployeeModal(null)} onSaved={async()=>{setEmployeeModal(null);await load();}}/>
    {quickSalary?<SalaryModal employeeId={quickSalary.id} open onClose={()=>setQuickSalary(null)} onSaved={async()=>{setQuickSalary(null);setOk("Sueldo cargado.");await load();}}/>:null}
    {quickObligation?<ObligationModal employeeId={quickObligation.id} open onClose={()=>setQuickObligation(null)} onSaved={async()=>{setQuickObligation(null);setOk("Deuda cargada.");await load();}}/>:null}
    {quickPayment?<PaymentModal employeeId={quickPayment.id} obligations={[]} currentBalanceCents={quickPayment.balanceCents} open onClose={()=>setQuickPayment(null)} onSaved={async()=>{setQuickPayment(null);setOk("Pago registrado.");await load();}}/>:null}
  </section>;
}

function EmployeeModal({value,onClose,onSaved}:{value:"new"|Employee|null;onClose:()=>void;onSaved:()=>void}) { const [name,setName]=useState(""),[doc,setDoc]=useState(""),[position,setPosition]=useState(""),[notes,setNotes]=useState(""),[saving,setSaving]=useState(false),[error,setError]=useState(""); useEffect(()=>{setName(value&&value!=="new"?value.fullName:"");setDoc(value&&value!=="new"?value.docId??"":"");setPosition(value&&value!=="new"?value.position??"":"");setNotes("");setError("");},[value]); async function submit(e:FormEvent){e.preventDefault();setSaving(true);try{const path=value==="new"?"/employees":`/employees/${value?.id??""}`;await api(path,{method:value==="new"?"POST":"PUT",body:{fullName:name,docId:doc||null,position:position||null,notes:notes||null}});onSaved();}catch(e){setError(errorText(e));}finally{setSaving(false);}} return <Modal open={Boolean(value)} title={value==="new"?"Nuevo empleado":"Editar empleado"} onClose={onClose} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button form="employee-form" disabled={saving}>{saving?"Guardando…":"Guardar"}</button></>}><form id="employee-form" className="form-grid" onSubmit={submit}>{error?<Alert>{error}</Alert>:null}<Field label="Nombre y apellido"><input required value={name} onChange={e=>setName(e.target.value)}/></Field><div className="grid-2"><Field label="DNI / documento"><input value={doc} onChange={e=>setDoc(e.target.value)}/></Field><Field label="Puesto"><input value={position} onChange={e=>setPosition(e.target.value)}/></Field></div><Field label="Notas"><textarea value={notes} onChange={e=>setNotes(e.target.value)}/></Field></form></Modal>; }

function EmployeeDetail({id,onBack}:{id:string;onBack:()=>void}) {
  const [detail,setDetail]=useState<Detail|null>(null),[movements,setMovements]=useState<Movement[]>([]),[salaries,setSalaries]=useState<Salary[]>([]),[obligations,setObligations]=useState<Obligation[]>([]),[tab,setTab]=useState<DetailTab>("movimientos"),[loading,setLoading]=useState(true),[error,setError]=useState(""),[ok,setOk]=useState("");
  const [filters,setFilters]=useState({period:"",kind:"",direction:""}),[movementOpen,setMovementOpen]=useState(false),[salaryOpen,setSalaryOpen]=useState(false),[obligationOpen,setObligationOpen]=useState(false),[paymentOpen,setPaymentOpen]=useState(false);
  const load=useCallback(async()=>{setLoading(true);try{const [d,m,s,o]=await Promise.all([api<Detail>(`/employees/${id}`),api<{items:Movement[]}>(`/employees/${id}/movements`,{query:filters}),api<{items:Salary[]}>(`/employees/${id}/salary/history`),api<{items:Obligation[]}>(`/employees/${id}/obligations`)]);setDetail(d);setMovements(m.items);setSalaries(s.items);setObligations(o.items);setError("");}catch(e){setError(errorText(e));}finally{setLoading(false);}},[id,filters]);
  useEffect(()=>{void load();},[load]);
  async function deleteMovement(m:Movement){if(!confirm("¿Eliminar este movimiento? Dejará de impactar el saldo."))return;try{await api(`/movements/${m.id}/cancel`,{method:"POST"});setOk("Movimiento eliminado.");await load();}catch(e){setError(errorText(e));}}
  async function cancelObligation(o:Obligation){if(!confirm("¿Cancelar esta obligación y sus movimientos?"))return;try{await api(`/obligations/${o.id}/cancel`,{method:"POST"});await load();}catch(e){setError(errorText(e));}}
  if(loading&&!detail)return <Loading label="Cargando cuenta corriente…"/>; if(!detail)return <Alert>{error||"No se encontró el empleado."}</Alert>;
  return <section><PageHeader eyebrow="Cuenta corriente" title={detail.fullName} subtitle={`${detail.position||"Sin puesto"} · ${detail.branch?.name||"Sin local"}`} actions={<><button className="btn-ghost" onClick={onBack}>← Volver</button><button onClick={()=>setSalaryOpen(true)}>Cargar sueldo</button><button onClick={()=>setObligationOpen(true)}>Cargar deuda</button><button onClick={()=>setPaymentOpen(true)}>Pagar</button><button className="btn-ghost" onClick={()=>setMovementOpen(true)}>Otro movimiento</button></>}/>{error?<Alert>{error}</Alert>:null}{ok?<Alert tone="ok">{ok}</Alert>:null}
    <div className="stat-strip"><div className="stat"><span className="stat-label">Neto a pagar</span><span className="stat-value"><Balance value={detail.balanceCents}/></span></div><div className="stat"><span className="stat-label">Sueldo vigente</span><strong className="stat-value">{formatArs(detail.currentSalary?.amountCents)}</strong></div><div className="stat"><span className="stat-label">Obligaciones abiertas</span><strong className="stat-value">{detail.summary.openObligations}</strong></div>{detail.summary.pendingMovements?<div className="stat"><span className="stat-label">Movimientos sin aplicar (histórico)</span><strong className="stat-value">{detail.summary.pendingMovements}</strong></div>:null}</div>
    <div className="panel"><strong>Usuario asociado:</strong> {detail.user?`${detail.user.displayName||detail.user.username} (@${detail.user.username})${detail.user.active?"":" · inactivo"}`:"Sin usuario asociado"}{detail.docId?<> · <strong>Documento:</strong> {detail.docId}</>:null}</div>
    <div className="toolbar"><Tabs tabs={[{id:"movimientos",label:"Movimientos"},{id:"sueldo",label:"Sueldo"},{id:"obligaciones",label:"Obligaciones y pagos"}]} active={tab} onChange={setTab}/></div>
    {tab==="movimientos"?<><div className="grid-2"><Field label="Concepto"><select value={filters.kind} onChange={e=>setFilters({...filters,kind:e.target.value})}><option value="">Todos</option>{kinds.map(k=><option key={k[0]} value={k[0]}>{k[1]}</option>)}</select></Field><Field label="Dirección"><select value={filters.direction} onChange={e=>setFilters({...filters,direction:e.target.value})}><option value="">Todas</option><option value="COMPANY_OWES">Empresa debe</option><option value="EMPLOYEE_OWES">Empleado debe</option></select></Field></div><MovementTable items={movements} onDelete={deleteMovement}/></>:null}
    {tab==="sueldo"?<div className="table-wrap"><table><thead><tr><th>Vigencia</th><th>Anterior</th><th>Nuevo sueldo</th><th>Variación</th><th>Motivo</th></tr></thead><tbody>{salaries.map(s=><tr key={s.id}><td>{new Date(s.effectiveFrom).toLocaleDateString("es-AR")}</td><td>{formatArs(s.previousAmountCents)}</td><td><strong>{formatArs(s.amountCents)}</strong></td><td>{s.changeBps==null?"—":`${bpsToPct(s.changeBps)} %`}</td><td>{s.reason||"—"}</td></tr>)}</tbody></table></div>:null}
    {tab==="obligaciones"?<Obligations items={obligations} onCancel={cancelObligation}/>:null}
    <MovementModal employeeId={id} open={movementOpen} onClose={()=>setMovementOpen(false)} onSaved={async()=>{setMovementOpen(false);await load();}}/><SalaryModal employeeId={id} open={salaryOpen} onClose={()=>setSalaryOpen(false)} onSaved={async()=>{setSalaryOpen(false);await load();}}/><ObligationModal employeeId={id} open={obligationOpen} onClose={()=>setObligationOpen(false)} onSaved={async()=>{setObligationOpen(false);await load();}}/><PaymentModal employeeId={id} obligations={obligations} currentBalanceCents={detail.balanceCents} open={paymentOpen} onClose={()=>setPaymentOpen(false)} onSaved={async()=>{setPaymentOpen(false);await load();}}/>
  </section>;
}

function MovementTable({items,onDelete}:{items:Movement[];onDelete:(m:Movement)=>void}) { return <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Quién debe</th><th>Monto</th><th/></tr></thead><tbody>{items.map(m=><tr key={m.id}><td>{new Date(m.occurredAt).toLocaleDateString("es-AR")}</td><td>{kindLabel(m.kind)}<br/><span className="muted">{m.description||"Sin descripción"}</span></td><td>{m.direction==="COMPANY_OWES"?"Empresa al empleado":"Empleado a la empresa"}</td><td>{formatArs(m.amountCents)}</td><td>{m.status!=="CANCELLED"?<button className="btn-danger btn-sm" onClick={()=>onDelete(m)}>Eliminar</button>:<span className="muted">Eliminado</span>}</td></tr>)}{!items.length?<tr><td colSpan={5}>No hay movimientos para estos filtros.</td></tr>:null}</tbody></table></div>; }

function MovementModal({employeeId,open,onClose,onSaved,label}:{employeeId:string;open:boolean;onClose:()=>void;onSaved:()=>void;label?:string}) { const [kind,setKind]=useState<MovementKind>("ADVANCE"),[amount,setAmount]=useState(""),[description,setDescription]=useState(""),[more,setMore]=useState(false),[direction,setDirection]=useState<Direction>("EMPLOYEE_OWES"),[date,setDate]=useState(today()),[saving,setSaving]=useState(false),[error,setError]=useState(""); useEffect(()=>{if(!open)return;setKind("ADVANCE");setAmount("");setDescription("");setDirection("EMPLOYEE_OWES");setDate(today());setMore(false);setError("");},[open]); async function submit(e:FormEvent){e.preventDefault();setSaving(true);try{const body:any={kind,amountCents:parseArsToCents(amount),description:description||null,occurredAt:new Date(`${date}T12:00:00`).toISOString(),status:"APPLIED"};if(kind==="ADJUSTMENT"||more)body.direction=direction;await api(`/employees/${employeeId}/movements`,{method:"POST",body});onSaved();}catch(e){setError(errorText(e));}finally{setSaving(false);}} return <Modal open={open} title={label?`Cargar movimiento — ${label}`:"Movimiento rápido"} onClose={onClose} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button form="movement-form" disabled={saving}>{saving?"Guardando…":"Guardar movimiento"}</button></>}><form id="movement-form" className="form-grid" onSubmit={submit}>{error?<Alert>{error}</Alert>:null}<Field label="Concepto"><select value={kind} onChange={e=>setKind(e.target.value as MovementKind)}>{kinds.map(k=><option key={k[0]} value={k[0]}>{k[1]}</option>)}</select></Field><Field label="Monto (ARS)"><MoneyInput autoFocus required placeholder="50.000" value={amount} onChange={setAmount}/></Field><Field label="Descripción (opcional)"><input value={description} onChange={e=>setDescription(e.target.value)}/></Field><button type="button" className="btn-ghost" onClick={()=>setMore(!more)}>{more?"Ocultar opciones":"Más opciones"}</button>{more||kind==="ADJUSTMENT"?<div className="grid-2"><Field label="Quién queda debiendo"><select value={direction} onChange={e=>setDirection(e.target.value as Direction)}><option value="EMPLOYEE_OWES">Empleado a empresa</option><option value="COMPANY_OWES">Empresa a empleado</option></select></Field><Field label="Fecha"><input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></Field></div>:null}</form></Modal>; }

type SalarySuggestion = { previousAmountCents:string|null; ipcPeriod:string|null; ipcPct:number|null; suggestedAmountCents:string|null };
const currentMonthInput = () => new Date().toISOString().slice(0,7);

function SalaryModal({employeeId,open,onClose,onSaved}:{employeeId:string;open:boolean;onClose:()=>void;onSaved:()=>void}) {
  const [monthInput,setMonthInput]=useState(currentMonthInput()),[pct,setPct]=useState(""),[amount,setAmount]=useState(""),[reason,setReason]=useState(""),[suggestion,setSuggestion]=useState<SalarySuggestion|null>(null),[loadingSuggestion,setLoadingSuggestion]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    if(!open)return;
    setMonthInput(currentMonthInput());setPct("");setAmount("");setReason("");setError("");setSuggestion(null);setLoadingSuggestion(true);
    api<SalarySuggestion>(`/employees/${employeeId}/salary/suggestion`)
      .then(s=>{setSuggestion(s);if(s.ipcPct!=null)setPct(bpsToPct(Math.round(s.ipcPct*100)));if(s.suggestedAmountCents!=null)setAmount(centsToInput(s.suggestedAmountCents));})
      .catch(()=>{/* sin sugerencia, se completa a mano */})
      .finally(()=>setLoadingSuggestion(false));
  },[open,employeeId]);
  async function submit(e:FormEvent){e.preventDefault();setSaving(true);try{const body:any={amountCents:parseArsToCents(amount),reason:reason||undefined,effectiveFrom:new Date(`${monthInput}-01T12:00:00`).toISOString()};if(pct.trim())body.changeBps=pctToBps(pct);await api(`/employees/${employeeId}/salary`,{method:"PUT",body});onSaved();}catch(e){setError(errorText(e));}finally{setSaving(false);}}
  return <Modal open={open} title="Cargar sueldo" onClose={onClose} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button form="salary-form" disabled={saving}>{saving?"Guardando…":"Guardar sueldo"}</button></>}>
    <form id="salary-form" className="form-grid" onSubmit={submit}>
      {error?<Alert>{error}</Alert>:null}
      <Field label="Mes"><input type="month" required value={monthInput} onChange={e=>setMonthInput(e.target.value)}/></Field>
      <div className="grid-2">
        <Field label="% IPC" hint={loadingSuggestion?"Buscando IPC…":suggestion?.ipcPeriod?`Último IPC publicado: ${suggestion.ipcPeriod}`:"No se pudo traer el IPC, completá a mano si querés"}>
          <input inputMode="decimal" placeholder="Ej. 2,1" value={pct} onChange={e=>setPct(e.target.value)}/>
        </Field>
        <Field label="Nuevo sueldo (ARS)" hint={suggestion?.previousAmountCents?`Sueldo anterior: ${formatArs(suggestion.previousAmountCents)}`:"Sin sueldo anterior cargado"}>
          <MoneyInput required value={amount} onChange={setAmount}/>
        </Field>
      </div>
      <p className="section-note">El monto ya viene calculado con el IPC (sueldo anterior + %). Si además querés dar un aumento, editalo directamente acá.</p>
      <Field label="Motivo (opcional)"><input value={reason} onChange={e=>setReason(e.target.value)}/></Field>
    </form>
  </Modal>;
}

function Obligations({items,onCancel}:{items:Obligation[];onCancel:(o:Obligation)=>void}) { return <>{items.map(o=><div className="panel" key={o.id}><div className="toolbar"><div><h3 className="panel-title">{kindLabel(o.kind)}</h3><p>{o.description||"Sin descripción"} · Original: <strong>{formatArs(o.originalAmountCents)}</strong> · Pendiente: <strong>{formatArs(o.pendingCents)}</strong></p></div><div className="toolbar-actions"><Status value={o.status}/>{o.status==="OPEN"?<button className="btn-danger btn-sm" onClick={()=>onCancel(o)}>Cancelar obligación</button>:null}</div></div>{o.installments.length?<div className="table-wrap"><table><thead><tr><th>Cuota</th><th>Período</th><th>Importe</th><th>Pagado</th><th>Estado</th></tr></thead><tbody>{o.installments.map(i=><tr key={i.id}><td>{i.number}</td><td>{i.period}</td><td>{formatArs(i.amountCents)}</td><td>{formatArs(i.paidCents)}</td><td><Status value={i.status}/></td></tr>)}</tbody></table></div>:null}</div>)}{!items.length?<div className="panel">No hay obligaciones para este empleado.</div>:null}</>; }

function ObligationModal({employeeId,open,onClose,onSaved}:{employeeId:string;open:boolean;onClose:()=>void;onSaved:()=>void}) { const [kind,setKind]=useState("ADVANCE"),[amount,setAmount]=useState(""),[description,setDescription]=useState(""),[withInstallments,setWithInstallments]=useState(false),[count,setCount]=useState("1"),[error,setError]=useState(""); async function submit(e:FormEvent){e.preventDefault();try{await api(`/employees/${employeeId}/obligations`,{method:"POST",body:{kind,originalAmountCents:parseArsToCents(amount),description:description||null,...(withInstallments?{installments:{count:Number(count),firstPeriod:month()}}:{})}});onSaved();}catch(e){setError(errorText(e));}} return <Modal open={open} title="Cargar deuda" onClose={onClose} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button form="obligation-form">Cargar deuda</button></>}><form id="obligation-form" className="form-grid" onSubmit={submit}>{error?<Alert>{error}</Alert>:null}<Field label="Tipo"><select value={kind} onChange={e=>setKind(e.target.value)}><option value="ADVANCE">Adelanto</option><option value="MERCHANDISE">Mercadería</option><option value="CARD_CONSUMPTION">Consumo de tarjeta</option><option value="OTHER">Otra</option></select></Field><Field label="Monto (ARS)"><MoneyInput required value={amount} onChange={setAmount}/></Field><Field label="Descripción"><input value={description} onChange={e=>setDescription(e.target.value)}/></Field><Checkbox label="Dividir en cuotas" checked={withInstallments} onChange={setWithInstallments}/>{withInstallments?<Field label="Cantidad de cuotas" hint="Las cuotas arrancan este mes automáticamente."><input type="number" min={1} required value={count} onChange={e=>setCount(e.target.value)}/></Field>:null}</form></Modal>; }

function PaymentModal({employeeId,obligations,currentBalanceCents,open,onClose,onSaved}:{employeeId:string;obligations:Obligation[];currentBalanceCents:string;open:boolean;onClose:()=>void;onSaved:()=>void}) {
  const [amount,setAmount]=useState(""),[method,setMethod]=useState("EFECTIVO"),[reference,setReference]=useState(""),[obligationId,setObligationId]=useState(""),[error,setError]=useState("");
  const [breakdown,setBreakdown]=useState<Breakdown|null>(null),[loadingBreakdown,setLoadingBreakdown]=useState(false);
  const openObligations=obligations.filter(o=>o.status==="OPEN");
  useEffect(()=>{
    if(!open)return;
    setAmount("");setMethod("EFECTIVO");setReference("");setObligationId("");setError("");setBreakdown(null);setLoadingBreakdown(true);
    api<Breakdown>(`/employees/${employeeId}/balance/breakdown`).then(setBreakdown).catch(()=>{/* se usa currentBalanceCents como fallback */}).finally(()=>setLoadingBreakdown(false));
  },[open,employeeId]);
  const previewBalance=(()=>{try{return (BigInt(currentBalanceCents||"0")-(amount.trim()?BigInt(parseArsToCents(amount)):0n)).toString();}catch{return currentBalanceCents;}})();
  async function submit(e:FormEvent){e.preventDefault();try{const cents=parseArsToCents(amount);await api(`/employees/${employeeId}/payments`,{method:"POST",body:{amountCents:cents,method,reference:reference||undefined,...(obligationId?{allocations:[{targetType:"OBLIGATION",targetId:obligationId,amountCents:cents}]}:{})}});onSaved();}catch(e){setError(errorText(e));}}
  return <Modal open={open} title="Registrar pago" onClose={onClose} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button form="payment-form">Registrar pago</button></>}>
    <form id="payment-form" className="form-grid" onSubmit={submit}>
      {error?<Alert>{error}</Alert>:null}
      <div className="panel">
        <h3 className="panel-title">Cómo se arma el neto a pagar</h3>
        {loadingBreakdown?<Loading label="Calculando…"/>:breakdown?<table><tbody>
          <tr><td>Sueldo devengado</td><td className="num">+ {formatArs(breakdown.accruedCents)}</td></tr>
          {breakdown.creditsCents!=="0"?<tr><td>Otros a favor</td><td className="num">+ {formatArs(breakdown.creditsCents)}</td></tr>:null}
          <tr><td>Deudas</td><td className="num">− {formatArs(breakdown.debtsCents)}</td></tr>
          <tr><td>Ya pagado</td><td className="num">− {formatArs(breakdown.paidCents)}</td></tr>
          {breakdown.adjustmentsCents!=="0"?<tr><td>Ajustes</td><td className="num">{formatArs(breakdown.adjustmentsCents)}</td></tr>:null}
          <tr><td><strong>Neto a pagar actual</strong></td><td className="num"><Balance value={breakdown.balanceCents}/></td></tr>
        </tbody></table>:null}
      </div>
      <Field label="Monto a pagar (ARS)" hint="Resta del neto a pagar total. Puede ser parcial, completo, o incluso un adelanto que se lleva."><MoneyInput autoFocus required value={amount} onChange={setAmount}/></Field>
      <div className="panel"><span className="stat-label">Neto a pagar después de este pago</span><br/><Balance value={previewBalance}/></div>
      <Field label="Método"><select value={method} onChange={e=>setMethod(e.target.value)}><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option><option value="MERCADO_PAGO">Mercado Pago</option><option value="TARJETA">Tarjeta</option><option value="OTRO">Otro</option></select></Field>
      {openObligations.length?<Field label="Asociar a obligación (opcional)" hint="Si no elegís ninguna, queda como pago general contra la cuenta corriente."><select value={obligationId} onChange={e=>setObligationId(e.target.value)}><option value="">Pago general</option>{openObligations.map(o=><option key={o.id} value={o.id}>{kindLabel(o.kind)} · {formatArs(o.originalAmountCents)} · pendiente {formatArs(o.pendingCents)}</option>)}</select></Field>:null}
      <Field label="Referencia (opcional)"><input value={reference} onChange={e=>setReference(e.target.value)}/></Field>
    </form>
  </Modal>;
}

function BulkSalary({onDone}:{onDone:()=>void}) { const [pct,setPct]=useState(""),[step,setStep]=useState(""),[items,setItems]=useState<Preview[]>([]),[bps,setBps]=useState(0),[error,setError]=useState(""),[ok,setOk]=useState(""),[applying,setApplying]=useState(false); async function preview(e:FormEvent){e.preventDefault();try{const nextBps=pctToBps(pct);const r=await api<{items:Array<Omit<Preview,"included"|"newInput">>}>("/employees/salary/bulk-preview",{method:"POST",body:{bps:nextBps,...(step?{roundingStepPesos:Number(step)}:{})}});setBps(nextBps);setItems(r.items.map(x=>({...x,newInput:centsToInput(x.newCents),included:true})));setError("");setOk("");}catch(e){setError(errorText(e));}} async function apply(){const selected=items.filter(x=>x.included);if(!selected.length){setError("Seleccioná al menos un empleado.");return;}let parsed:Array<{employeeId:string;newCents:string}>;try{parsed=selected.map(x=>({employeeId:x.employeeId,newCents:parseArsToCents(x.newInput)}));}catch(e){setError(errorText(e));return;}if(!confirm(`Confirmá la actualización de sueldo para ${selected.length} empleado(s). Esta acción crea registros salariales nuevos.`))return;setApplying(true);try{await api("/employees/salary/bulk-apply",{method:"POST",body:{bps,items:parsed}});setOk("Sueldos actualizados correctamente.");setItems([]);await onDone();}catch(e){setError(errorText(e));}finally{setApplying(false);}} return <div><div className="panel"><h2 className="panel-title">1. Preparar vista previa</h2><form className="grid-2" onSubmit={preview}><Field label="Porcentaje"><input required inputMode="decimal" placeholder="Ej. 10,5" value={pct} onChange={e=>setPct(e.target.value)}/></Field><Field label="Redondeo en pesos (opcional)" hint="Ej. 1000 para redondear a $ 1.000"><input type="number" min={0} value={step} onChange={e=>setStep(e.target.value)}/></Field><button>Generar vista previa</button></form></div>{error?<Alert>{error}</Alert>:null}{ok?<Alert tone="ok">{ok}</Alert>:null}{items.length?<><h2 className="panel-title">2. Revisar y confirmar</h2><div className="table-wrap"><table><thead><tr><th>Incluir</th><th>Empleado</th><th>Anterior</th><th>%</th><th>Nuevo sueldo editable</th></tr></thead><tbody>{items.map((x,i)=><tr key={x.employeeId}><td><Checkbox label="" checked={x.included} onChange={v=>setItems(items.map((y,j)=>j===i?{...y,included:v}:y))}/></td><td>{x.name}</td><td>{formatArs(x.oldCents)}</td><td>{bpsToPct(x.bps)} %</td><td><MoneyInput aria-label={`Nuevo sueldo de ${x.name}`} disabled={!x.included} value={x.newInput} onChange={v=>setItems(items.map((y,j)=>j===i?{...y,newInput:v}:y))}/></td></tr>)}</tbody></table></div><Alert tone="info">Nada se aplica hasta que confirmes este paso.</Alert><button disabled={applying} onClick={()=>void apply()}>{applying?"Aplicando…":"Confirmar y aplicar sueldos"}</button></>:null}</div>; }
