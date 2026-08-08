"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  api,
  apiUpload,
  downloadAuthenticated,
  pingChromeExtension,
  type ExtensionPingResult,
} from "../lib/api";
import { bpsToPct, formatArs, parseArsToCents, pctToBps } from "../lib/money";
import type { AiSettings, CompanySettings, ExternalModuleSettings, FinancingPlan, PdfSettings } from "../lib/types";
import {
  Alert,
  Checkbox,
  EmptyState,
  Field,
  Loading,
  Modal,
  PageHeader,
  Pill,
  Tabs,
  errorMessage,
} from "./shared";
import {ChatbotSettingsSection} from "./ChatbotSettingsSection";

type Tab = "empresa" | "pdf" | "ia" | "chatbot" | "financiacion" | "extension" | "modulo-externo";

const TABS: { id: Tab; label: string }[] = [
  { id: "empresa", label: "Empresa" },
  { id: "pdf", label: "PDF" },
  { id: "ia", label: "IA" },
  { id: "chatbot", label: "Chatbot" },
  { id: "financiacion", label: "Financiación" },
  { id: "extension", label: "Extensión Chrome" },
  { id: "modulo-externo", label: "MÓDULO EXTERNO" },
];

type ExtensionInfo = {
  available: boolean;
  version: string;
  extensionId: string;
  downloadPath: string;
  sizeBytes: number | null;
  apiPublicUrl: string;
  webOrigin: string;
  whatsappUrl: string;
};

type ExtensionInstructions = {
  title: string;
  extensionId: string;
  steps: string[];
  neverAutoSend: boolean;
  apiBase: string;
};

type AiModelOption = {id:string;created:number;ownedBy:string};
// Orientación visual solamente: OpenAI `models.list()` no incluye precios.
function efficiencyHint(id:string):string|null {
  return /(nano|mini|small|flash)/i.test(id)?"económico/eficiente":null;
}

const PDF_FLAGS: { key: keyof PdfSettings; label: string }[] = [
  { key: "showListPrice", label: "Mostrar precio de lista" },
  { key: "showCashTransfer", label: "Mostrar efectivo/transferencia" },
  { key: "showFinancing", label: "Mostrar financiación" },
  { key: "showBbva", label: "Mostrar BBVA" },
  { key: "showOtherBanks", label: "Mostrar otros bancos" },
  { key: "showFinancingNote", label: "Mostrar nota de financiación" },
  { key: "showTaxData", label: "Mostrar datos fiscales" },
  { key: "showServicesBlock", label: "Mostrar bloque de servicios" },
  { key: "showWindows", label: "Mostrar Windows" },
  { key: "showDrivers", label: "Mostrar drivers" },
  { key: "showDelay", label: "Mostrar plazo" },
  { key: "showRma", label: "Mostrar RMA" },
  { key: "showExtraObservation", label: "Mostrar observación extra" },
  { key: "showIndividualPrices", label: "Mostrar precios individuales" },
  { key: "showComponentDetail", label: "Mostrar detalle de componentes" },
];

type FinDraft = {
  id?: string;
  bank: string;
  installments: string;
  interestPct: string;
  description: string;
  active: boolean;
  sortOrder: string;
};

const emptyFin = (): FinDraft => ({
  bank: "",
  installments: "3",
  interestPct: "0",
  description: "",
  active: true,
  sortOrder: "0",
});

export function SettingsView() {
  const [tab, setTab] = useState<Tab>("empresa");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [pdf, setPdf] = useState<PdfSettings | null>(null);
  const [ai, setAi] = useState<AiSettings | null>(null);
  const [generalMarkupPct, setGeneralMarkupPct] = useState("30");
  const [aiKey, setAiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [budgetDisplay, setBudgetDisplay] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [aiModels,setAiModels]=useState<AiModelOption[]>([]);
  const [modelsBusy,setModelsBusy]=useState(false);
  const [modelsNotice,setModelsNotice]=useState<string|null>(null);
  const [plans, setPlans] = useState<FinancingPlan[]>([]);
  const [finDraft, setFinDraft] = useState<FinDraft>(emptyFin());
  const [finModalOpen, setFinModalOpen] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [faviconBusy,setFaviconBusy]=useState(false);
  const [extInfo, setExtInfo] = useState<ExtensionInfo | null>(null);
  const [extInstructions, setExtInstructions] = useState<ExtensionInstructions | null>(null);
  const [extApiTest, setExtApiTest] = useState<string | null>(null);
  const [extPluginTest, setExtPluginTest] = useState<ExtensionPingResult | null>(null);
  const [extBusy, setExtBusy] = useState(false);

  const [externalEnabled, setExternalEnabled] = useState(false);
  const [externalBusy, setExternalBusy] = useState(false);
  const [externalError, setExternalError] = useState<string | null>(null);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, p, a, f, info, instructions, ext] = await Promise.all([
        api<CompanySettings>("/settings/company"),
        api<PdfSettings>("/settings/pdf"),
        api<AiSettings>("/settings/ai"),
        api<FinancingPlan[]>("/financing"),
        api<ExtensionInfo>("/settings/extension/info").catch(() => null),
        api<ExtensionInstructions>("/settings/extension/instructions").catch(() => null),
        api<ExternalModuleSettings>("/settings/external-module").catch(() => null),
      ]);
      setExternalEnabled(ext?.enabled ?? false);
      setCompany(c);
      setPdf(p);
      const budget =
        a.monthlyBudgetUsdCents === null || a.monthlyBudgetUsdCents === undefined
          ? null
          : String(a.monthlyBudgetUsdCents);
      setAi({ ...a, monthlyBudgetUsdCents: budget });
      setGeneralMarkupPct(bpsToPct(a.generalMarkupBps));
      setBudgetDisplay(budget ? centsToInput(budget) : "");
      setPlans(f);
      setExtInfo(info);
      setExtInstructions(instructions);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCompany(e: FormEvent) {
    e.preventDefault();
    if (!company) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { id: _id, updatedAt: _u, ...body } = company;
      setCompany(await api<CompanySettings>("/settings/company", { method: "PUT", body }));
      setNotice("Datos de empresa guardados.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File | null) {
    if (!file) return;
    setLogoBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const next = await apiUpload<CompanySettings>("/settings/company/logo", form);
      setCompany(next);
      setNotice("Logo subido. La URL quedó guardada para presupuestos y el sistema.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLogoBusy(false);
    }
  }

  async function clearLogo() {
    setLogoBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await api<CompanySettings>("/settings/company/logo", { method: "DELETE" });
      setCompany(next);
      setNotice("Logo eliminado.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLogoBusy(false);
    }
  }

  async function uploadFavicon(file:File|null){
    if(!file)return;
    setFaviconBusy(true);setError(null);setNotice(null);
    try{
      const form=new FormData();form.append("file",file);
      const next=await apiUpload<CompanySettings>("/settings/company/favicon",form);setCompany(next);
      window.dispatchEvent(new CustomEvent("tgs-favicon-changed",{detail:next.faviconUrl}));
      setNotice("Favicon subido y aplicado al web app.");
    }catch(err){setError(errorMessage(err))}finally{setFaviconBusy(false)}
  }

  async function clearFavicon(){
    setFaviconBusy(true);setError(null);setNotice(null);
    try{
      const next=await api<CompanySettings>("/settings/company/favicon",{method:"DELETE"});setCompany(next);
      window.dispatchEvent(new CustomEvent("tgs-favicon-changed",{detail:null}));
      setNotice("Favicon eliminado.");
    }catch(err){setError(errorMessage(err))}finally{setFaviconBusy(false)}
  }

  async function savePdf(e: FormEvent) {
    e.preventDefault();
    if (!pdf) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { id: _id, updatedAt: _u, ...body } = pdf;
      // layoutJson se gestiona desde el Editor de PDF (endpoint aparte); la API lo devuelve pero
      // no debe reenviarse acá (el schema estricto lo rechaza).
      delete (body as Record<string, unknown>).layoutJson;
      setPdf(await api<PdfSettings>("/settings/pdf", { method: "PUT", body }));
      setNotice("Configuración PDF guardada.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveAi(e: FormEvent) {
    e.preventDefault();
    if (!ai) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const monthlyBudgetUsdCents = budgetDisplay.trim() ? parseArsToCents(budgetDisplay) : null;
      const body: Record<string, unknown> = {
        enabled: ai.enabled,
        model: ai.model,
        analysisEnabled: ai.analysisEnabled,
        similarityEnabled: ai.similarityEnabled,
        compatibilityEnabled: ai.compatibilityEnabled,
        responsesEnabled: ai.responsesEnabled,
        ambiguousSimilarityAi: ai.ambiguousSimilarityAi,
        monthlyBudgetUsdCents,
        generalMarkupBps: pctToBps(generalMarkupPct),
        productSimilarityThreshold: ai.productSimilarityThreshold,
        frequentSupportThreshold: ai.frequentSupportThreshold,
        clearApiKey: clearKey,
      };
      if (aiKey.trim()) body.apiKey = aiKey.trim();
      const next = await api<AiSettings>("/settings/ai", { method: "PUT", body });
      const nextBudget = next.monthlyBudgetUsdCents == null ? null : String(next.monthlyBudgetUsdCents);
      setAi({ ...next, monthlyBudgetUsdCents: nextBudget });
      setGeneralMarkupPct(bpsToPct(next.generalMarkupBps));
      setBudgetDisplay(nextBudget ? centsToInput(nextBudget) : "");
      setAiKey("");
      setClearKey(false);
      setNotice("Configuración de IA guardada.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function testAi() {
    setTestResult(null);
    setError(null);
    try {
      const res = await api<{ ok: boolean; model: string; error?: string }>(
        "/settings/ai/test-connection",
        {
          method: "POST",
          body: {
            ...(aiKey.trim() ? { apiKey: aiKey.trim() } : {}),
            ...(ai?.model ? { model: ai.model } : {}),
          },
        },
      );
      setTestResult(
        res.ok ? `Conexión OK con modelo ${res.model}.` : `Falló la prueba: ${res.error ?? "error desconocido"}`,
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function loadAiModels(){
    setModelsBusy(true);
    setModelsNotice(null);
    setError(null);
    try{
      const result=await api<{models:AiModelOption[];pricingIncluded:false}>("/settings/ai/models");
      setAiModels(result.models);
      setModelsNotice(`Se cargaron ${result.models.length} modelos disponibles para la API key guardada.`);
    }catch(err){
      setError(errorMessage(err));
    }finally{
      setModelsBusy(false);
    }
  }

  function openFinNew() {
    setFinDraft({ ...emptyFin(), sortOrder: String(plans.length) });
    setFinModalOpen(true);
  }

  function openFinEdit(p: FinancingPlan) {
    setFinDraft({
      id: p.id,
      bank: p.bank ?? "",
      installments: String(p.installments),
      interestPct: bpsToPct(p.interestBps),
      description: p.description ?? "",
      active: p.active,
      sortOrder: String(p.sortOrder),
    });
    setFinModalOpen(true);
  }

  async function saveFin(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body = {
        installments: Number(finDraft.installments),
        interestBps: pctToBps(finDraft.interestPct),
        bank: finDraft.bank.trim() || null,
        description: finDraft.description.trim() || null,
        active: finDraft.active,
        sortOrder: Number(finDraft.sortOrder),
      };
      if (finDraft.id) {
        await api(`/financing/${finDraft.id}`, { method: "PUT", body });
        setNotice("Plan actualizado.");
      } else {
        await api("/financing", { method: "POST", body });
        setNotice("Plan creado.");
      }
      setFinModalOpen(false);
      setPlans(await api<FinancingPlan[]>("/financing"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveListInterest(e: FormEvent) {
    e.preventDefault();
    if (!company) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { id: _id, updatedAt: _u, ...body } = company;
      setCompany(await api<CompanySettings>("/settings/company", { method: "PUT", body }));
      setNotice("Interés de lista guardado.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeFin(id: string) {
    if (!window.confirm("¿Eliminar este plan?")) return;
    try {
      await api(`/financing/${id}`, { method: "DELETE" });
      setPlans(await api<FinancingPlan[]>("/financing"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function downloadExtension() {
    setExtBusy(true);
    setError(null);
    setNotice(null);
    try {
      await downloadAuthenticated("/settings/extension/download", "tgs-extension.zip");
      setNotice("Descarga del plugin iniciada.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExtBusy(false);
    }
  }

  async function testApiConnection() {
    setExtBusy(true);
    setExtApiTest(null);
    setError(null);
    try {
      const health = await api<{ status: string }>("/health");
      const session = await api<{
        user: { username: string; displayName: string | null };
      }>("/settings/extension/connection-test");
      setExtApiTest(
        `API OK (${health.status}). Sesión: ${session.user.displayName || session.user.username}.`,
      );
    } catch (err) {
      setExtApiTest(null);
      setError(errorMessage(err));
    } finally {
      setExtBusy(false);
    }
  }

  async function testPluginConnection() {
    setExtBusy(true);
    setError(null);
    try {
      setExtPluginTest(await pingChromeExtension());
    } catch (err) {
      setExtPluginTest({
        ok: false,
        installed: false,
        error: errorMessage(err),
      });
    } finally {
      setExtBusy(false);
    }
  }

  function openKeyModal() {
    setKeyInput("");
    setExternalError(null);
    setKeyModalOpen(true);
  }

  async function confirmToggleExternal(e: FormEvent) {
    e.preventDefault();
    const target = !externalEnabled;
    setExternalBusy(true);
    setExternalError(null);
    try {
      const next = await api<ExternalModuleSettings>("/settings/external-module", {
        method: "PUT",
        body: { enabled: target, key: keyInput },
      });
      setExternalEnabled(next.enabled);
      window.dispatchEvent(
        new CustomEvent<boolean>("tgs-external-module-changed", { detail: next.enabled }),
      );
      setNotice(next.enabled ? "Módulo Externo activado." : "Módulo Externo desactivado.");
      setKeyModalOpen(false);
      setKeyInput("");
    } catch (err) {
      setExternalError(errorMessage(err));
    } finally {
      setExternalBusy(false);
    }
  }

  const selectedAiModelUnavailable =
    aiModels.length > 0 && Boolean(ai) && !aiModels.some((model) => model.id === ai?.model);

  return (
    <div>
      <PageHeader
        eyebrow="Sistema"
        title="Configuración"
        subtitle="Empresa, PDF, IA, financiación y extensión de Chrome para WhatsApp."
        actions={
          <button type="button" className="btn-ghost" onClick={() => void load()}>
            Recargar
          </button>
        }
      />

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}
      {loading ? <Loading /> : null}

      {!loading && tab === "empresa" && company ? (
        <form className="form-grid card card-pad" onSubmit={saveCompany} style={{ maxWidth: 820 }}>
          <h3 className="panel-title">Datos de la empresa</h3>

          <div className="logo-upload">
            <div className="logo-preview">
              {company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logoUrl} alt={`Logo de ${company.name}`} />
              ) : (
                <span className="logo-placeholder">Sin logo</span>
              )}
            </div>
            <div className="logo-upload-meta">
              <p className="section-note" style={{ margin: 0 }}>
                Subí una imagen (PNG, JPG, WEBP o GIF, máx. 2 MB). Se guarda en el servidor y se
                genera una URL para PDF y la interfaz.
              </p>
              {company.logoUrl ? (
                <p className="muted" style={{ margin: "0.35rem 0 0", wordBreak: "break-all" }}>
                  URL: {company.logoUrl}
                </p>
              ) : null}
              <div className="form-actions" style={{ marginTop: "0.75rem" }}>
                <label className="btn-ghost" style={{ cursor: logoBusy ? "wait" : "pointer" }}>
                  {logoBusy ? "Subiendo…" : "Subir logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    hidden
                    disabled={logoBusy}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      void uploadLogo(file);
                    }}
                  />
                </label>
                {company.logoUrl ? (
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    disabled={logoBusy}
                    onClick={() => void clearLogo()}
                  >
                    Quitar logo
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="logo-upload">
            <div className="logo-preview" style={{width:72,height:72,minHeight:72}}>
              {company.faviconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.faviconUrl} alt="Favicon del sistema" style={{width:40,height:40,objectFit:"contain"}} />
              ) : (
                <span className="logo-placeholder">Sin favicon</span>
              )}
            </div>
            <div className="logo-upload-meta">
              <p className="section-note" style={{margin:0}}>Favicon del navegador. Subí ICO, PNG o SVG de hasta 1 MB.</p>
              {company.faviconUrl?<p className="muted" style={{margin:"0.35rem 0 0",wordBreak:"break-all"}}>URL: {company.faviconUrl}</p>:null}
              <div className="form-actions" style={{marginTop:"0.75rem"}}>
                <label className="btn-ghost" style={{cursor:faviconBusy?"wait":"pointer"}}>
                  {faviconBusy?"Subiendo…":"Subir favicon"}
                  <input type="file" accept="image/x-icon,image/vnd.microsoft.icon,image/png,image/svg+xml,.ico" hidden disabled={faviconBusy} onChange={event=>{const file=event.target.files?.[0]??null;event.target.value="";void uploadFavicon(file)}}/>
                </label>
                {company.faviconUrl?<button type="button" className="btn-danger btn-sm" disabled={faviconBusy} onClick={()=>void clearFavicon()}>Quitar favicon</button>:null}
              </div>
            </div>
          </div>

          <div className="grid-2">
            {(
              [
                ["name", "Nombre"],
                ["taxCondition", "Condición fiscal"],
                ["cuit", "CUIT"],
                ["grossIncome", "Ingresos brutos"],
                ["activityStart", "Inicio de actividades"],
                ["address", "Domicilio"],
                ["phones", "Teléfonos"],
                ["rmaUrl", "URL RMA"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label} htmlFor={`co-${key}`}>
                <input
                  id={`co-${key}`}
                  value={String(company[key] ?? "")}
                  onChange={(e) =>
                    setCompany({
                      ...company,
                      [key]: e.target.value,
                    })
                  }
                  required
                />
              </Field>
            ))}
          </div>
          <Field label="Texto de pie" htmlFor="co-footer">
            <textarea
              id="co-footer"
              rows={2}
              value={company.footerText}
              onChange={(e) => setCompany({ ...company, footerText: e.target.value })}
              required
            />
          </Field>
          <div className="grid-2">
            <Field label="Color primario" htmlFor="co-primary">
              <input
                id="co-primary"
                value={company.primaryColor}
                onChange={(e) => setCompany({ ...company, primaryColor: e.target.value })}
                required
              />
            </Field>
            <Field label="Color acento" htmlFor="co-accent">
              <input
                id="co-accent"
                value={company.accentColor}
                onChange={(e) => setCompany({ ...company, accentColor: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar empresa"}
            </button>
          </div>
        </form>
      ) : null}

      {!loading && tab === "pdf" && pdf ? (
        <form className="form-grid card card-pad" onSubmit={savePdf}>
          <h3 className="panel-title">Plantilla y vigencia</h3>
          <div className="grid-2">
            <Field label="Plantilla" htmlFor="pdf-template">
              <select
                id="pdf-template"
                value={pdf.template}
                onChange={(e) =>
                  setPdf({ ...pdf, template: e.target.value as PdfSettings["template"] })
                }
              >
                <option value="CLASICO">Clásico (actual)</option>
                <option value="MODERNO">Moderno (nuevo)</option>
              </select>
            </Field>
            <Field
              label="Días de validez"
              htmlFor="pdf-validity-days"
              hint='Vacío = no mostrar "Válido hasta"'
            >
              <input
                id="pdf-validity-days"
                type="number"
                min={0}
                max={365}
                value={pdf.validityDays ?? ""}
                onChange={(e) =>
                  setPdf({
                    ...pdf,
                    validityDays: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <Field label="Nota de financiación BBVA" htmlFor="pdf-financing-bbva-note">
            <textarea
              id="pdf-financing-bbva-note"
              rows={3}
              maxLength={2000}
              value={pdf.financingBbvaNote ?? ""}
              onChange={(e) =>
                setPdf({ ...pdf, financingBbvaNote: e.target.value === "" ? null : e.target.value })
              }
            />
          </Field>
          <h3 className="panel-title">Bloques visibles en el PDF</h3>
          <p className="section-note">
            Estas opciones se guardan en el backend. La generación de PDF todavía no está conectada
            en esta interfaz.
          </p>
          <div className="check-grid">
            {PDF_FLAGS.map(({ key, label }) => (
              <Checkbox
                key={key}
                label={label}
                checked={Boolean(pdf[key])}
                onChange={(v) => setPdf({ ...pdf, [key]: v })}
              />
            ))}
          </div>
          <h3 className="panel-title mt">Textos</h3>
          <div className="grid-2">
            {(
              [
                ["builtPcTitle", "Título PC armada"],
                ["builtPcDescription", "Descripción PC armada"],
                ["assemblyText", "Texto armado"],
                ["installText", "Texto instalación"],
                ["windowsText", "Texto Windows"],
                ["driversText", "Texto drivers"],
                ["estimatedDelay", "Plazo estimado"],
                ["rmaText", "Texto de aceptación de garantía"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label} htmlFor={`pdf-${key}`}>
                <textarea
                  id={`pdf-${key}`}
                  rows={2}
                  value={String(pdf[key] ?? "")}
                  onChange={(e) => setPdf({ ...pdf, [key]: e.target.value })}
                  required
                />
              </Field>
            ))}
          </div>
          <p className="section-note">
            El orden de componentes al armar una PC se define en Catálogo → Líneas PC (solo
            referencia de orden; no se edita acá).
          </p>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar PDF"}
            </button>
          </div>
        </form>
      ) : null}

      {!loading && tab === "ia" && ai ? (
        <form className="form-grid card card-pad" onSubmit={saveAi} style={{ maxWidth: 820 }}>
          <h3 className="panel-title">Conexión de IA</h3>
          <p className="section-note">
            Solo se configura y prueba la conexión. Análisis, similitud y respuestas con IA no están
            activas en esta interfaz.
          </p>
          <div className="grid-2">
            <Checkbox
              label="IA habilitada"
              checked={ai.enabled}
              onChange={(enabled) => setAi({ ...ai, enabled })}
            />
            <Field label="Modelo" htmlFor="ai-model">
              <select
                id="ai-model"
                value={ai.model}
                onChange={(e) => setAi({ ...ai, model: e.target.value })}
                required
              >
                {!aiModels.some((model) => model.id === ai.model) ? (
                  <option value={ai.model}>
                    {selectedAiModelUnavailable
                      ? `⚠ ${ai.model} (no encontrado en la cuenta actual)`
                      : `${ai.model} (actual)`}
                  </option>
                ) : null}
                {aiModels.map(model=><option key={model.id} value={model.id}>{model.id}{efficiencyHint(model.id)?` · ${efficiencyHint(model.id)}`:""}</option>)}
              </select>
            </Field>
          </div>
          {selectedAiModelUnavailable ? (
            <Alert tone="error">
              El modelo guardado no aparece entre los modelos disponibles para la API key actual.
              Elegí uno de la lista y guardá la configuración.
            </Alert>
          ) : null}
          <Field
            label="API key (dejar vacío para conservar)"
            htmlFor="ai-key"
            hint={ai.hasKey ? `Guardada: ${ai.apiKeyMasked ?? "••••"}` : "Sin clave"}
          >
            <input
              id="ai-key"
              type="password"
              value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Checkbox label="Borrar API key guardada" checked={clearKey} onChange={setClearKey} />
          <div className="grid-3">
            <Field label="Markup general (%)" htmlFor="ai-markup">
              <input
                id="ai-markup"
                value={generalMarkupPct}
                onChange={(e) => setGeneralMarkupPct(e.target.value)}
                placeholder="30"
              />
            </Field>
            <Field
              label="Umbral similitud de productos (%)"
              htmlFor="ai-sim"
              hint="Usado en Productos → Buscar duplicados. Más alto = más estricto (ej. 85)."
            >
              <input
                id="ai-sim"
                type="number"
                min={0}
                max={100}
                value={ai.productSimilarityThreshold}
                onChange={(e) => setAi({ ...ai, productSimilarityThreshold: Number(e.target.value) })}
              />
            </Field>
            <Field label="Umbral soporte frecuente" htmlFor="ai-freq">
              <input
                id="ai-freq"
                type="number"
                min={0}
                value={ai.frequentSupportThreshold}
                onChange={(e) => setAi({ ...ai, frequentSupportThreshold: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field
            label="Presupuesto mensual USD"
            htmlFor="ai-budget"
            hint={ai.monthlyBudgetUsdCents ? `Actual: ${formatArs(ai.monthlyBudgetUsdCents)} (centavos USD)` : "Sin tope"}
          >
            <input
              id="ai-budget"
              value={budgetDisplay}
              onChange={(e) => setBudgetDisplay(e.target.value)}
              placeholder="Vacío = sin tope"
            />
          </Field>
          <div className="check-grid">
            <Checkbox label="Análisis" checked={ai.analysisEnabled} onChange={(v) => setAi({ ...ai, analysisEnabled: v })} />
            <Checkbox label="Similitud" checked={ai.similarityEnabled} onChange={(v) => setAi({ ...ai, similarityEnabled: v })} />
            <Checkbox label="Compatibilidad" checked={ai.compatibilityEnabled} onChange={(v) => setAi({ ...ai, compatibilityEnabled: v })} />
            <Checkbox label="Respuestas" checked={ai.responsesEnabled} onChange={(v) => setAi({ ...ai, responsesEnabled: v })} />
            <Checkbox label="Similitud ambigua con IA" checked={ai.ambiguousSimilarityAi} onChange={(v) => setAi({ ...ai, ambiguousSimilarityAi: v })} />
          </div>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar IA"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => void testAi()}>
              Probar conexión
            </button>
            <button type="button" className="btn-ghost" disabled={modelsBusy} onClick={()=>void loadAiModels()}>
              {modelsBusy?"Consultando OpenAI…":"Cargar modelos disponibles"}
            </button>
          </div>
          {modelsNotice?<Alert tone="info">{modelsNotice} OpenAI no informa precios en este endpoint; “económico/eficiente” es sólo una orientación por familia del modelo.</Alert>:null}
          {testResult ? (
            <Alert tone={testResult.startsWith("Conexión OK") ? "ok" : "error"}>{testResult}</Alert>
          ) : null}
        </form>
      ) : null}

      {!loading && tab === "financiacion" ? (
        <div>
          {company ? (
            <form className="card card-pad form-grid" onSubmit={saveListInterest} style={{ marginBottom: 20 }}>
              <Field
                label="Interés de lista — 1 pago con tarjeta (%)"
                htmlFor="list-interest"
                hint="Se aplica una sola vez sobre el precio de efectivo/transferencia."
              >
                <input
                  id="list-interest"
                  type="number"
                  min={0}
                  step="0.01"
                  value={bpsToPct(company.listInterestBps)}
                  onChange={(e) => setCompany({ ...company, listInterestBps: pctToBps(e.target.value) })}
                  required
                />
              </Field>
              <div className="form-actions">
                <button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar interés de lista"}</button>
              </div>
            </form>
          ) : null}
          <div className="toolbar">
            <p className="section-note" style={{ margin: 0, flex: 1 }}>
              Cada plan se calcula sobre el precio de lista. Interés 0% significa sin interés.
            </p>
            <button type="button" onClick={openFinNew}>
              + Nuevo plan
            </button>
          </div>
          {plans.length === 0 ? (
            <EmptyState icon="▦" title="Sin planes de financiación">
              Creá planes de cuotas para incluirlos en los presupuestos.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Banco</th>
                    <th>Cuotas</th>
                    <th>Interés</th>
                    <th>Descripción</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id} className={`clickable${p.active ? "" : " dim"}`} onClick={() => openFinEdit(p)}>
                      <td>{p.bank || "Plan común"}</td>
                      <td className="num">{p.installments}</td>
                      <td className="num">{p.interestBps === 0 ? "Sin interés" : `${bpsToPct(p.interestBps)} %`}</td>
                      <td>{p.description || "—"}</td>
                      <td>{p.active ? <Pill tone="ok">Activo</Pill> : <Pill tone="neutral">Inactivo</Pill>}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn-danger btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              void removeFin(p.id);
                            }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Modal
            open={finModalOpen}
            title={finDraft.id ? "Editar plan" : "Nuevo plan"}
            onClose={() => setFinModalOpen(false)}
            wide
            footer={
              <>
                <button type="button" className="btn-ghost" onClick={() => setFinModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" form="fin-form" disabled={saving}>
                  {saving ? "Guardando…" : finDraft.id ? "Guardar cambios" : "Crear plan"}
                </button>
              </>
            }
          >
            <form id="fin-form" className="form-grid" onSubmit={saveFin}>
              <Field label="Banco (opcional)" htmlFor="fin-bank" hint="Dejalo vacío para un plan común.">
                <input id="fin-bank" value={finDraft.bank} onChange={(e) => setFinDraft({ ...finDraft, bank: e.target.value })} autoFocus />
              </Field>
              <div className="grid-3">
                <Field label="Cantidad de cuotas" htmlFor="fin-inst">
                  <input id="fin-inst" type="number" min={1} value={finDraft.installments} onChange={(e) => setFinDraft({ ...finDraft, installments: e.target.value })} required />
                </Field>
                <Field label="Interés (%)" htmlFor="fin-interest">
                  <input id="fin-interest" type="number" min={0} step="0.01" value={finDraft.interestPct} onChange={(e) => setFinDraft({ ...finDraft, interestPct: e.target.value })} placeholder="25" required />
                </Field>
                <Field label="Orden" htmlFor="fin-order">
                  <input id="fin-order" type="number" value={finDraft.sortOrder} onChange={(e) => setFinDraft({ ...finDraft, sortOrder: e.target.value })} />
                </Field>
              </div>
              <Field label="Descripción corta (opcional)" htmlFor="fin-description">
                <input id="fin-description" value={finDraft.description} onChange={(e) => setFinDraft({ ...finDraft, description: e.target.value })} placeholder="Solo viernes y sábados" />
              </Field>
              <div className="grid-2">
                <Checkbox label="Sin interés" checked={Number(finDraft.interestPct) === 0} onChange={(checked) => checked && setFinDraft({ ...finDraft, interestPct: "0" })} />
                <Checkbox label="Activo" checked={finDraft.active} onChange={(active) => setFinDraft({ ...finDraft, active })} />
              </div>
            </form>
          </Modal>
        </div>
      ) : null}

      {!loading && tab === "chatbot" ? <ChatbotSettingsSection /> : null}

      {!loading && tab === "extension" ? (
        <div className="form-grid" style={{ maxWidth: 900 }}>
          <div className="card card-pad">
            <h3 className="panel-title">Plugin Chrome para WhatsApp</h3>
            <p className="section-note">
              Extensión Manifest V3 que inserta un panel en WhatsApp Web. Prepara mensajes y PDFs,
              pero <strong>nunca envía sola</strong>: el vendedor siempre confirma en WhatsApp.
            </p>
            <div className="form-actions" style={{ flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={extBusy || !extInfo?.available}
                onClick={() => void downloadExtension()}
              >
                {extBusy ? "…" : "Descargar tgs-extension.zip"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={extBusy}
                onClick={() => void testApiConnection()}
              >
                Probar conexión API
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={extBusy}
                onClick={() => void testPluginConnection()}
              >
                Probar plugin instalado
              </button>
            </div>
            {extInfo ? (
              <p className="muted" style={{ marginTop: "0.75rem" }}>
                Versión {extInfo.version}
                {extInfo.available
                  ? ` · ZIP listo${extInfo.sizeBytes ? ` (${Math.round(extInfo.sizeBytes / 1024)} KB)` : ""}`
                  : " · ZIP no generado aún (ejecutá pnpm extension:zip)"}
                {" · "}ID: <code>{extInfo.extensionId}</code>
              </p>
            ) : null}
            {extApiTest ? <Alert tone="ok">{extApiTest}</Alert> : null}
            {extPluginTest ? (
              <Alert tone={extPluginTest.ok ? "ok" : "error"}>
                {extPluginTest.ok
                  ? `Plugin OK (v${extPluginTest.extensionVersion}). API y sesión conectadas${
                      extPluginTest.user
                        ? ` como ${extPluginTest.user.displayName || extPluginTest.user.username}`
                        : ""
                    }.`
                  : extPluginTest.error || "El plugin no respondió correctamente."}
              </Alert>
            ) : null}
          </div>

          <div className="card card-pad">
            <h3 className="panel-title">Instrucciones de instalación y uso</h3>
            <ol className="instruction-list">
              {(extInstructions?.steps ?? [
                "Descargá el ZIP desde este panel.",
                "Descomprimilo en una carpeta fija.",
                "Abrí chrome://extensions y activá Modo de desarrollador.",
                "Cargá la carpeta descomprimida (Load unpacked).",
                "Iniciá sesión en TGS (http://localhost:3000) en el mismo Chrome.",
                "Abrí https://web.whatsapp.com y usá el panel TGS a la derecha.",
                "Verificá que diga “Conectado”. Generá PDF / insertá mensaje; enviá vos en WhatsApp.",
              ]).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <Alert tone="info">
              Tip: si el plugin dice “Sin sesión”, abrí la web TGS, iniciá sesión y pulsá “Probar”
              en el panel de WhatsApp. Si dice “API offline”, levantá el backend en el puerto 3001.
            </Alert>
          </div>
        </div>
      ) : null}

      {!loading && tab === "modulo-externo" ? (
        <div className="card card-pad" style={{ maxWidth: 820 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h3 className="panel-title" style={{ margin: 0 }}>
              Módulo Externo
            </h3>
            <Pill tone={externalEnabled ? "ok" : "neutral"}>
              {externalEnabled ? "Activado" : "Desactivado"}
            </Pill>
          </div>
          <p className="section-note">
            Módulo oculto: cuando está activado aparece en el menú lateral. Activar o desactivar
            requiere la clave.
          </p>
          <div className="form-actions" style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className={externalEnabled ? "btn-ghost" : "btn-dark"}
              onClick={openKeyModal}
            >
              {externalEnabled ? "Desactivar módulo" : "Activar módulo"}
            </button>
          </div>
        </div>
      ) : null}

      <Modal
        open={keyModalOpen}
        title={externalEnabled ? "Desactivar Módulo Externo" : "Activar Módulo Externo"}
        onClose={() => {
          if (!externalBusy) setKeyModalOpen(false);
        }}
      >
        <form className="form-grid" onSubmit={confirmToggleExternal}>
          <p className="section-note" style={{ margin: 0 }}>
            Ingresá la clave para {externalEnabled ? "desactivar" : "activar"} el módulo.
          </p>
          <Field label="Clave" htmlFor="external-module-key">
            <input
              id="external-module-key"
              type="password"
              autoFocus
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              autoComplete="off"
            />
          </Field>
          {externalError ? <Alert>{externalError}</Alert> : null}
          <div className="form-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setKeyModalOpen(false)}
              disabled={externalBusy}
            >
              Cancelar
            </button>
            <button type="submit" className="btn-dark" disabled={externalBusy || !keyInput}>
              {externalBusy ? "Guardando…" : externalEnabled ? "Desactivar" : "Activar"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function centsToInput(cents: string): string {
  try {
    const v = BigInt(cents);
    return `${v / 100n},${(v % 100n).toString().padStart(2, "0")}`;
  } catch {
    return "";
  }
}
