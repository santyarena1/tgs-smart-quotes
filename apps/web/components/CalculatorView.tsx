"use client";

import {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject} from "react";
import {api, apiUpload} from "../lib/api";
import {applyInterestBps, planInstallmentCents, planTotalCents, slugFromLabel} from "../lib/calculator-money";
import {bpsToPct, formatArs, parseArsToCents, pctToBps} from "../lib/money";
import type {Branding, CalculatorGroup, CalculatorGroupKind} from "../lib/types";
import {Alert, Checkbox, Field, Loading, Modal, MoneyInput, PageHeader, errorMessage} from "./shared";

type DraftPlan = {
  id?: string;
  installments: number;
  interestBps: number;
  visible: boolean;
};

type DraftGroup = {
  id?: string;
  key: string;
  label: string;
  iconUrl: string | null;
  iconUrls: string[];
  kind: CalculatorGroupKind;
  visible: boolean;
  note: string;
  plans: DraftPlan[];
};

type ShotRow = {
  label: string;
  amount: string;
  total: string;
  zeroInterest: boolean;
};
type ShotMethod = {
  id: string;
  key: string;
  label: string;
  iconUrls: string[];
  note: string | null;
  rows: ShotRow[];
};

function todayLabel(): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function uniqueKey(label: string, used: Set<string>): string {
  const base = slugFromLabel(label);
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function toDraft(groups: CalculatorGroup[]): DraftGroup[] {
  return groups.map((group) => ({
    id: group.id,
    key: group.key,
    label: group.label,
    iconUrl: group.iconUrl,
    iconUrls: group.iconUrls?.length ? group.iconUrls : group.iconUrl ? [group.iconUrl] : [],
    kind: group.kind,
    visible: group.visible,
    note: group.note ?? "",
    plans: group.plans.map((plan) => ({
      id: plan.id,
      installments: plan.installments,
      interestBps: plan.interestBps,
      visible: plan.visible,
    })),
  }));
}

function PaymentMark({groupKey, label, iconUrl}: {groupKey: string; label: string; iconUrl: string | null}) {
  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="calc-mark-img" src={iconUrl} alt="" crossOrigin="anonymous" />
    );
  }
  const tone = groupKey.replace(/[^a-z0-9-]/g, "") || "otro";
  return (
    <span className={`calc-mark calc-mark-${tone}`} aria-hidden="true">
      {groupKey === "visa" ? "VISA"
        : groupKey === "mastercard" ? (
          <>
            <span /><span />
          </>
        )
        : groupKey === "mercadopago" ? "MP"
        : groupKey === "bbva" ? "BBVA"
        : groupKey === "gocuotas" ? "GO"
        : groupKey === "cash" ? "$"
        : groupKey === "list" ? "1×"
        : label.slice(0, 2).toUpperCase()}
    </span>
  );
}

function MethodMarks({groupKey, label, iconUrls}: {groupKey: string; label: string; iconUrls: string[]}) {
  if (groupKey === "otros-bancos") {
    return (
      <span className="calc-marks">
        <PaymentMark groupKey="visa" label="Visa" iconUrl={iconUrls[0] || null} />
        <PaymentMark groupKey="mastercard" label="Mastercard" iconUrl={iconUrls[1] || null} />
      </span>
    );
  }
  return <PaymentMark groupKey={groupKey} label={label} iconUrl={iconUrls.find(Boolean) || null} />;
}

function FinancingCard({
  cardRef,
  branding,
  title,
  cashCents,
  listCents,
  listVisible,
  listNote,
  methods,
}: {
  cardRef: RefObject<HTMLElement | null>;
  branding: Branding | null;
  title: string;
  cashCents: bigint | null;
  listCents: bigint | null;
  listVisible: boolean;
  listNote: string | null;
  methods: ShotMethod[];
}) {
  const company = branding?.name?.trim() || "The Gamer Shop";
  const accent = branding?.accentColor || "#E31B23";
  return (
    <article
      ref={cardRef}
      className="calc-shot"
      style={{"--calc-accent": accent} as CSSProperties}
    >
      <div className="calc-shot-glow" aria-hidden="true" />
      <header className="calc-shot-head">
        <div className="calc-shot-brand">
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="calc-shot-logo" crossOrigin="anonymous" />
          ) : (
            <span className="calc-shot-logo-fallback">TGS</span>
          )}
          <div>
            <strong>{company}</strong>
            <small>{title.trim() || "Financiación"}</small>
          </div>
        </div>
        <span className="calc-shot-date">{todayLabel()}</span>
      </header>

      <section className="calc-shot-hero">
        <div className="calc-shot-hero-cell">
          <p className="calc-shot-kicker">Efectivo / Transferencia</p>
          <p className="calc-shot-price">{cashCents === null ? "—" : formatArs(cashCents)}</p>
        </div>
        {listVisible ? (
          <div className="calc-shot-hero-cell">
            <p className="calc-shot-kicker">Precio de lista · 1 pago</p>
            <p className="calc-shot-price">{listCents === null ? "—" : formatArs(listCents)}</p>
            {listNote ? <p className="calc-shot-hero-note">{listNote}</p> : null}
          </div>
        ) : null}
      </section>

      <div className="calc-shot-methods">
        {methods.map((method) => (
          <section className="calc-shot-method" key={method.id}>
            <div className="calc-shot-method-head">
              <MethodMarks groupKey={method.key} label={method.label} iconUrls={method.iconUrls} />
              <h3>{method.label}</h3>
            </div>
            <ul>
              {method.rows.map((row) => (
                <li key={row.label}>
                  <span className="calc-shot-cuotas">{row.label}</span>
                  <span className="calc-shot-figures">
                    <strong>{row.amount}</strong>
                    <small>total {row.total}</small>
                    {row.zeroInterest ? <small className="calc-shot-zero">sin interés</small> : null}
                  </span>
                </li>
              ))}
            </ul>
            {method.note ? <p className="calc-shot-note">{method.note}</p> : null}
          </section>
        ))}
      </div>

      <footer className="calc-shot-foot">
        <span>The Gamer Shop</span>
        <span>Interés sobre efectivo · 0% sobre lista</span>
      </footer>
    </article>
  );
}

function planPreview(
  cashCents: bigint | null,
  listBps: number,
  kind: CalculatorGroupKind,
  plan: DraftPlan,
): string | null {
  if (cashCents === null) return null;
  if (kind === "CASH") return `→ ${formatArs(cashCents)}`;
  const listCents = applyInterestBps(cashCents, listBps);
  const total = kind === "LIST"
    ? applyInterestBps(cashCents, plan.interestBps)
    : planTotalCents(cashCents, listCents, plan.interestBps);
  if (plan.installments <= 1) return `→ ${formatArs(total)}`;
  const cuota = kind === "LIST"
    ? (total + BigInt(plan.installments) / 2n) / BigInt(plan.installments)
    : planInstallmentCents(cashCents, listCents, plan.installments, plan.interestBps);
  return `→ ${formatArs(cuota)} · total ${formatArs(total)}`;
}

function GearModal({
  open,
  groups,
  cashCents,
  onClose,
  onSaved,
}: {
  open: boolean;
  groups: CalculatorGroup[];
  cashCents: bigint | null;
  onClose: () => void;
  onSaved: (groups: CalculatorGroup[]) => void;
}) {
  const [draft, setDraft] = useState<DraftGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingIcons = useRef(new Map<string, File>());

  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(groups));
    setError(null);
    setNotice(null);
    pendingIcons.current.clear();
  }, [open, groups]);

  function patchGroup(index: number, patch: Partial<DraftGroup>) {
    setDraft((rows) => rows.map((row, i) => (i === index ? {...row, ...patch} : row)));
  }

  function moveGroup(index: number, dir: -1 | 1) {
    setDraft((rows) => {
      const other = index + dir;
      if (other < 0 || other >= rows.length) return rows;
      const next = [...rows];
      const a = next[index]!;
      next[index] = next[other]!;
      next[other] = a;
      return next;
    });
  }

  function addGroup() {
    const used = new Set(draft.map((g) => g.key));
    const key = uniqueKey("Nuevo medio", used);
    const reference = draft.find((g) => g.key === "otros-bancos") ?? draft.find((g) => g.kind === "PLAN");
    setDraft((rows) => [
      ...rows,
      {
        key,
        label: "Nuevo medio",
        iconUrl: null,
        iconUrls: [],
        kind: "PLAN",
        visible: true,
        note: "",
        plans: reference?.plans.map((p) => ({installments: p.installments, interestBps: p.interestBps, visible: true}))
          ?? [{installments: 3, interestBps: 0, visible: true}],
      },
    ]);
  }

  async function pickIcon(group: DraftGroup, file: File | null, slot = 0) {
    if (!file) return;
    if (group.id) {
      try {
        const form = new FormData();
        form.append("file", file);
        const next = await apiUpload<CalculatorGroup>(`/calculator/groups/${group.id}/icon?slot=${slot}`, form);
        setDraft((rows) => rows.map((row) => (row.id === next.id ? {
          ...row,
          iconUrl: next.iconUrl,
          iconUrls: next.iconUrls ?? [],
        } : row)));
        setNotice("Icono actualizado.");
      } catch (err) {
        setError(errorMessage(err));
      }
      return;
    }
    pendingIcons.current.set(`${group.key}:${slot}`, file);
    const preview = URL.createObjectURL(file);
    setDraft((rows) => rows.map((row) => {
      if (row.key !== group.key) return row;
      const iconUrls = [...row.iconUrls];
      while (iconUrls.length <= slot) iconUrls.push("");
      iconUrls[slot] = preview;
      return {...row, iconUrls, iconUrl: iconUrls.find(Boolean) || preview};
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        groups: draft.map((group, sortOrder) => ({
          id: group.id,
          key: group.key,
          label: group.label.trim(),
          kind: group.kind,
          sortOrder,
          visible: group.visible,
          note: group.note.trim() || "",
          plans: group.plans
            .filter((plan) => plan.installments > 0)
            .map((plan, planOrder) => ({
              id: plan.id,
              installments: plan.installments,
              interestBps: plan.interestBps,
              sortOrder: planOrder,
              visible: plan.visible,
            })),
        })),
      };
      if (payload.groups.some((g) => !g.label || !g.plans.length)) {
        throw new Error("Cada medio necesita nombre y al menos una cuota.");
      }
      let saved = await api<CalculatorGroup[]>("/calculator", {method: "PUT", body: payload});
      for (const [compound, file] of pendingIcons.current) {
        const [key, slot] = compound.split(":");
        const group = saved.find((g) => g.key === key);
        if (!group) continue;
        const form = new FormData();
        form.append("file", file);
        const updated = await apiUpload<CalculatorGroup>(`/calculator/groups/${group.id}/icon?slot=${slot ?? "0"}`, form);
        saved = saved.map((g) => (g.id === updated.id ? updated : g));
      }
      pendingIcons.current.clear();
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function resetFromFinancing() {
    if (!window.confirm("Esto vuelve a tomar los intereses de Configuración → Financiación. Los iconos se conservan.")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await api<CalculatorGroup[]>("/calculator/reset", {method: "POST"});
      setDraft(toDraft(saved));
      pendingIcons.current.clear();
      onSaved(saved);
      setNotice("Intereses restaurados desde la financiación de presupuestos.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      wide
      title="Medios e intereses"
      onClose={() => {if (!saving) onClose();}}
      footer={
        <>
          <button type="button" className="btn-ghost btn-sm" disabled={saving} onClick={onClose}>Cerrar</button>
          <button type="button" className="btn-ghost btn-sm" disabled={saving} onClick={() => void resetFromFinancing()}>
            Restaurar desde presupuestos
          </button>
          <button type="button" className="btn-dark btn-sm" disabled={saving} onClick={() => void save()}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <div className="calc-gear">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="ok">{notice}</Alert> : null}
        <p className="section-note">
          El % es sobre el efectivo que cargaste: 13% de $ 10 es $ 11, no $ 13. El 0% de un medio son cuotas sin interés sobre el precio de lista. Visa, Mastercard y el resto de bancos van juntos en “Otros bancos”.
        </p>
        <div className="calc-gear-list">
          {draft.map((group, index) => (
            <article className="calc-gear-card" key={group.id ?? group.key}>
              <div className="calc-gear-top">
                <div className="calc-gear-icons">
                  {(group.key === "otros-bancos"
                    ? [{slot: 0, name: "Visa"}, {slot: 1, name: "Mastercard"}]
                    : [{slot: 0, name: "Icono"}]
                  ).map((slot) => (
                    <label className="calc-gear-icon" key={`${group.key}-${slot.slot}`}>
                      <PaymentMark
                        groupKey={group.key === "otros-bancos" ? (slot.slot === 0 ? "visa" : "mastercard") : group.key}
                        label={slot.name}
                        iconUrl={group.iconUrls[slot.slot] || (slot.slot === 0 ? group.iconUrl : null)}
                      />
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          e.target.value = "";
                          void pickIcon(group, file, slot.slot);
                        }}
                      />
                      <span>Subir {slot.name}</span>
                    </label>
                  ))}
                </div>
                <div className="calc-gear-fields">
                  <Field label="Nombre">
                    <input value={group.label} maxLength={80} onChange={(e) => patchGroup(index, {label: e.target.value})} />
                  </Field>
                  <Field label="Leyenda en la tarjeta" hint="Ej. días de cuotas sin interés, vigencia de la promo.">
                    <textarea
                      rows={2}
                      maxLength={600}
                      value={group.note}
                      onChange={(e) => patchGroup(index, {note: e.target.value})}
                    />
                  </Field>
                  <Checkbox label="Visible en la tarjeta" checked={group.visible} onChange={(v) => patchGroup(index, {visible: v})} />
                </div>
                <div className="calc-gear-move">
                  <button type="button" className="btn-ghost btn-sm" disabled={index === 0} onClick={() => moveGroup(index, -1)}>↑</button>
                  <button type="button" className="btn-ghost btn-sm" disabled={index === draft.length - 1} onClick={() => moveGroup(index, 1)}>↓</button>
                  {group.kind === "PLAN" && group.key !== "bbva" && group.key !== "otros-bancos" ? (
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setDraft((rows) => rows.filter((_, i) => i !== index))}
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="calc-gear-plans">
                {group.plans.map((plan, planIndex) => (
                  <div className="calc-gear-plan" key={plan.id ?? `${group.key}-${planIndex}`}>
                    <Field label="Cuotas">
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={plan.installments}
                        disabled={group.kind !== "PLAN"}
                        onChange={(e) => {
                          const installments = Math.max(1, Math.trunc(Number(e.target.value) || 1));
                          setDraft((rows) => rows.map((row, i) => i === index ? {
                            ...row,
                            plans: row.plans.map((p, j) => j === planIndex ? {...p, installments} : p),
                          } : row));
                        }}
                      />
                    </Field>
                    <Field
                      label="Interés sobre efectivo %"
                      hint={group.kind === "LIST"
                        ? "Una sola vez sobre el efectivo. 13% de $ 10 → $ 11."
                        : group.kind === "CASH"
                          ? "El efectivo no lleva interés."
                          : "0% = sin interés (precio de lista). No se suma al % de lista."}
                    >
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={bpsToPct(plan.interestBps)}
                        onChange={(e) => {
                          let interestBps = 0;
                          try { interestBps = pctToBps(e.target.value); } catch { interestBps = 0; }
                          setDraft((rows) => rows.map((row, i) => i === index ? {
                            ...row,
                            plans: row.plans.map((p, j) => j === planIndex ? {...p, interestBps} : p),
                          } : row));
                        }}
                      />
                    </Field>
                    <p className="calc-gear-preview">
                      {planPreview(
                        cashCents,
                        draft.find((row) => row.kind === "LIST")?.plans[0]?.interestBps ?? 0,
                        group.kind,
                        plan,
                      ) ?? "→ —"}
                    </p>
                    {group.kind === "PLAN" ? (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        disabled={group.plans.length < 2}
                        onClick={() => setDraft((rows) => rows.map((row, i) => i === index ? {
                          ...row,
                          plans: row.plans.filter((_, j) => j !== planIndex),
                        } : row))}
                      >
                        ✕
                      </button>
                    ) : <span />}
                  </div>
                ))}
                {group.kind === "PLAN" ? (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => setDraft((rows) => rows.map((row, i) => i === index ? {
                      ...row,
                      plans: [...row.plans, {installments: 12, interestBps: row.plans.at(-1)?.interestBps ?? 0, visible: true}],
                    } : row))}
                  >
                    + Cuota
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <button type="button" className="btn-ghost" onClick={addGroup}>+ Agregar medio</button>
      </div>
    </Modal>
  );
}

export function CalculatorView() {
  const [groups, setGroups] = useState<CalculatorGroup[]>([]);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [cashInput, setCashInput] = useState("1.000.000");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gearOpen, setGearOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextGroups, nextBranding] = await Promise.all([
        api<CalculatorGroup[]>("/calculator"),
        api<Branding>("/settings/branding").catch(() => null),
      ]);
      setGroups(nextGroups);
      setBranding(nextBranding);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const cashCents = useMemo(() => {
    try {
      return BigInt(parseArsToCents(cashInput));
    } catch {
      return null;
    }
  }, [cashInput]);

  const listBps = groups.find((g) => g.kind === "LIST")?.plans[0]?.interestBps ?? 0;
  const listCents = cashCents === null ? null : applyInterestBps(cashCents, listBps);
  const listVisible = groups.some((g) => g.kind === "LIST" && g.visible);
  const listNote = groups.find((g) => g.kind === "LIST")?.note?.trim() || null;

  const methods = useMemo<ShotMethod[]>(() => {
    if (cashCents === null || listCents === null) return [];
    return groups
      .filter((g) => g.visible && g.kind === "PLAN")
      .map((group) => ({
        id: group.id,
        key: group.key,
        label: group.label,
        iconUrls: group.iconUrls?.length ? group.iconUrls : group.iconUrl ? [group.iconUrl] : [],
        note: group.note?.trim() || null,
        rows: group.plans.filter((p) => p.visible).map((plan) => {
          const cuota = planInstallmentCents(cashCents, listCents, plan.installments, plan.interestBps);
          const total = planTotalCents(cashCents, listCents, plan.interestBps);
          return {
            label: plan.installments === 1 ? "1 pago" : `${plan.installments} cuotas`,
            amount: formatArs(cuota),
            total: formatArs(total),
            zeroInterest: plan.interestBps === 0,
          };
        }),
      }))
      .filter((method) => method.rows.length > 0);
  }, [cashCents, groups, listCents]);

  async function capture(mode: "download" | "copy") {
    const node = cardRef.current;
    if (!node || cashCents === null) return;
    setCapturing(true);
    setError(null);
    setNotice(null);
    try {
      const {toPng} = await import("html-to-image");
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#07080c",
      });
      const stamp = new Intl.DateTimeFormat("sv-SE", {timeZone: "America/Argentina/Buenos_Aires"}).format(new Date());
      const slug = slugFromLabel(title || "financiacion");
      const filename = `TGS-${slug}-${stamp}.png`;
      if (mode === "copy" && typeof ClipboardItem !== "undefined") {
        const blob = await (await fetch(dataUrl)).blob();
        await navigator.clipboard.write([new ClipboardItem({"image/png": blob})]);
        setNotice("Captura copiada. Pegala en WhatsApp.");
        return;
      }
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      link.click();
      setNotice(mode === "copy" ? "No se pudo copiar: se descargó el PNG." : "Captura descargada.");
    } catch (err) {
      setError(errorMessage(err) || "No se pudo generar la captura.");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="calc-page">
      <PageHeader
        eyebrow="Calculadora"
        title="Financiación para mostrar"
        subtitle="Cargá el efectivo, mirá todas las cuotas y sacá una captura lista para el cliente."
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => setGearOpen(true)} aria-label="Configurar medios e intereses">
              ⚙ Intereses e iconos
            </button>
            <button type="button" className="btn-ghost" disabled={capturing || cashCents === null} onClick={() => void capture("copy")}>
              {capturing ? "Capturando…" : "Copiar captura"}
            </button>
            <button type="button" disabled={capturing || cashCents === null} onClick={() => void capture("download")}>
              Descargar PNG
            </button>
          </>
        }
      />

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="ok">{notice}</Alert> : null}

      <div className="calc-dock">
        <Field label="Precio efectivo / transferencia" hint="El % de lista y el de cada medio se aplican una sola vez sobre este importe. El 0% de un medio reparte el precio de lista.">
          <MoneyInput value={cashInput} onChange={setCashInput} />
        </Field>
        <Field label="Título en la tarjeta (opcional)" hint="Ej. PC Gamer RTX 5060. Sale en la captura.">
          <input value={title} maxLength={80} placeholder="Nombre del armado" onChange={(e) => setTitle(e.target.value)} />
        </Field>
      </div>

      {loading ? <Loading label="Cargando medios…" /> : (
        <div className="calc-stage">
          <FinancingCard
            cardRef={cardRef}
            branding={branding}
            title={title}
            cashCents={cashCents}
            listCents={listCents}
            listVisible={listVisible}
            listNote={listNote}
            methods={methods}
          />
        </div>
      )}

      <GearModal
        open={gearOpen}
        groups={groups}
        cashCents={cashCents}
        onClose={() => setGearOpen(false)}
        onSaved={(next) => { setGroups(next); setGearOpen(false); setNotice("Medios actualizados."); }}
      />
    </div>
  );
}
